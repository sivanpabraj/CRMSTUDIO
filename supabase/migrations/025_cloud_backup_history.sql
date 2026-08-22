-- Studio M — immutable, versioned cloud backup history
-- Backups are disaster-recovery artifacts. They never participate in login/auth decisions.

create table if not exists public.studio_backup_archives (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  payload jsonb not null,
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  source text not null default 'manual' check (char_length(source) between 1 and 32),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  db_version int not null,
  app_version text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_studio_backup_archives_recent
  on public.studio_backup_archives (studio_id, created_at desc);

alter table public.studio_backup_archives enable row level security;

revoke all on table public.studio_backup_archives from public, anon, authenticated;
grant select on table public.studio_backup_archives to authenticated;

drop policy if exists "backup_archives_select_manager" on public.studio_backup_archives;
create policy "backup_archives_select_manager"
  on public.studio_backup_archives for select
  to authenticated
  using (exists (
    select 1 from public.studio_members m
    where m.studio_id = studio_backup_archives.studio_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and 'studio_manager' = any(m.roles)
  ));

create or replace function public.create_studio_backup(
  p_studio_id uuid,
  p_payload jsonb,
  p_checksum text,
  p_source text default 'manual',
  p_db_version int default 1,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_size bigint;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.studio_members m
    where m.studio_id = p_studio_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and 'studio_manager' = any(m.roles)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid backup payload';
  end if;
  if p_checksum is null or p_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid backup checksum';
  end if;

  v_size := octet_length(p_payload::text);
  if v_size < 1 or v_size > 20971520 then
    raise exception 'backup payload exceeds 20 MiB limit';
  end if;

  insert into public.studio_backup_archives (
    studio_id, payload, checksum, source, size_bytes,
    db_version, app_version, created_by
  ) values (
    p_studio_id, p_payload, p_checksum,
    left(coalesce(nullif(btrim(p_source), ''), 'manual'), 32), v_size,
    greatest(coalesce(p_db_version, 1), 1), left(p_app_version, 64), (select auth.uid())
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_studio_backup(uuid, jsonb, text, text, int, text)
  from public, anon;
grant execute on function public.create_studio_backup(uuid, jsonb, text, text, int, text)
  to authenticated;

comment on table public.studio_backup_archives is
  'Immutable manager-only disaster recovery snapshots; not an authentication source.';
