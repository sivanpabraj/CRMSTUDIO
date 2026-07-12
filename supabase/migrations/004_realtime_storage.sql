-- Studio M Phase 3 — Realtime, file storage, sync audit
-- Run after 003_structured_sync.sql

-- ── Realtime on entity changes ──
do $$
begin
  alter publication supabase_realtime add table public.studio_entities;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ── Sync event log (optional audit / debugging) ──
create table if not exists public.studio_sync_events (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  entity_type text not null,
  local_id text,
  event_type text not null default 'upsert',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  actor uuid references auth.users(id)
);

create index if not exists idx_sync_events_studio_time
  on public.studio_sync_events (studio_id, created_at desc);

alter table public.studio_sync_events enable row level security;

drop policy if exists "sync_events_select_member" on public.studio_sync_events;
drop policy if exists "sync_events_insert_manager" on public.studio_sync_events;

create policy "sync_events_select_member" on public.studio_sync_events for select
  using (studio_id in (select public.user_studio_ids()));

create policy "sync_events_insert_manager" on public.studio_sync_events for insert
  with check (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
  ));

grant select, insert on public.studio_sync_events to authenticated;

-- ── Supabase Storage: studio-files bucket ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'studio-files',
  'studio-files',
  false,
  52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','application/pdf','application/zip']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS: path = {studio_id}/{asset_id}/{filename}
drop policy if exists "studio_files_select_member" on storage.objects;
drop policy if exists "studio_files_insert_manager" on storage.objects;
drop policy if exists "studio_files_update_manager" on storage.objects;
drop policy if exists "studio_files_delete_manager" on storage.objects;

create policy "studio_files_select_member" on storage.objects for select
  using (
    bucket_id = 'studio-files'
    and (storage.foldername(name))[1]::uuid in (select public.user_studio_ids())
  );

create policy "studio_files_insert_manager" on storage.objects for insert
  with check (
    bucket_id = 'studio-files'
    and (storage.foldername(name))[1]::uuid in (
      select studio_id from public.studio_members
      where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
    )
  );

create policy "studio_files_update_manager" on storage.objects for update
  using (
    bucket_id = 'studio-files'
    and (storage.foldername(name))[1]::uuid in (
      select studio_id from public.studio_members
      where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
    )
  );

create policy "studio_files_delete_manager" on storage.objects for delete
  using (
    bucket_id = 'studio-files'
    and (storage.foldername(name))[1]::uuid in (
      select studio_id from public.studio_members
      where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
    )
  );

-- Trigger: log entity upserts for realtime subscribers (lightweight)
create or replace function public.log_studio_entity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.studio_sync_events (studio_id, entity_type, local_id, event_type, payload, actor)
  values (
    new.studio_id,
    new.entity_type,
    new.local_id,
    tg_op,
    jsonb_build_object('revision', new.revision, 'updated_at', new.updated_at),
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists trg_studio_entities_sync_event on public.studio_entities;
create trigger trg_studio_entities_sync_event
  after insert or update on public.studio_entities
  for each row execute function public.log_studio_entity_change();
