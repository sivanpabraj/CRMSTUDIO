-- Customer portal: verified phone identity, append-only chat, and private attachments.
-- Customer access is derived from the phone claim issued by Supabase Auth.

create table if not exists public.customer_portal_access (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (contract_id, user_id)
);

create index if not exists customer_portal_access_user_idx
  on public.customer_portal_access (user_id, studio_id);
create index if not exists customer_portal_access_contract_idx
  on public.customer_portal_access (contract_id);

create table if not exists public.customer_portal_messages (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  contract_local_id text not null,
  request_key text not null,
  request_type text not null default 'message',
  sender_id uuid not null references auth.users(id) on delete restrict,
  sender_kind text not null check (sender_kind in ('customer', 'manager', 'staff', 'system')),
  sender_name text not null default '',
  body text not null default '' check (char_length(body) <= 4000),
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_size bigint check (attachment_size is null or attachment_size between 1 and 5242880),
  created_at timestamptz not null default now(),
  check (body <> '' or attachment_path is not null),
  check (
    attachment_path is null
    or attachment_path like studio_id::text || '/%'
  )
);

create index if not exists customer_portal_messages_contract_time_idx
  on public.customer_portal_messages (contract_id, created_at);
create index if not exists customer_portal_messages_studio_time_idx
  on public.customer_portal_messages (studio_id, created_at desc);
create unique index if not exists customer_portal_messages_attachment_unique
  on public.customer_portal_messages (attachment_path)
  where attachment_path is not null;

alter table public.customer_portal_access enable row level security;
alter table public.customer_portal_messages enable row level security;

drop policy if exists customer_portal_access_self_read on public.customer_portal_access;
create policy customer_portal_access_self_read
  on public.customer_portal_access for select to authenticated
  using (
    user_id = (select auth.uid())
    or studio_id in (select public.user_studio_ids())
  );

drop policy if exists customer_contract_read on public.contracts;
create policy customer_contract_read
  on public.contracts for select to authenticated
  using (exists (
    select 1 from public.customer_portal_access a
    where a.contract_id = contracts.id
      and a.user_id = (select auth.uid())
  ));

drop policy if exists customer_portal_messages_read on public.customer_portal_messages;
create policy customer_portal_messages_read
  on public.customer_portal_messages for select to authenticated
  using (
    studio_id in (select public.user_studio_ids())
    or exists (
      select 1 from public.customer_portal_access a
      where a.contract_id = customer_portal_messages.contract_id
        and a.user_id = (select auth.uid())
    )
  );

drop policy if exists customer_portal_messages_insert on public.customer_portal_messages;
create policy customer_portal_messages_insert
  on public.customer_portal_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      (
        sender_kind = 'customer'
        and exists (
          select 1 from public.customer_portal_access a
          where a.contract_id = customer_portal_messages.contract_id
            and a.studio_id = customer_portal_messages.studio_id
            and a.user_id = (select auth.uid())
        )
      )
      or (
        sender_kind in ('manager', 'staff')
        and customer_portal_messages.studio_id in (select public.user_studio_ids())
      )
    )
  );

-- Attach a verified Supabase phone identity to every active matching contract.
create or replace function public.claim_customer_contracts()
returns table (
  contract_id uuid,
  studio_id uuid,
  local_id text,
  contract_num text,
  groom text,
  bride text,
  event_date text,
  status text,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_phone text;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select case
    when regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') ~ '^989[0-9]{9}$'
      then '0' || substr(regexp_replace(u.phone, '[^0-9]', '', 'g'), 3)
    when regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') ~ '^9[0-9]{9}$'
      then '0' || regexp_replace(u.phone, '[^0-9]', '', 'g')
    else regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g')
  end into v_phone
  from auth.users u where u.id = v_user_id;

  if v_phone !~ '^09[0-9]{9}$' then
    raise exception 'verified_phone_required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('customer:' || v_user_id::text, 0));

  insert into public.customer_portal_access (studio_id, contract_id, user_id, last_seen_at)
  select c.studio_id, c.id, v_user_id, now()
  from public.contracts c
  where c.status <> 'cancelled'
    and right(v_phone, 10) in (
      right(regexp_replace(coalesce(c.groom_phone, ''), '[^0-9]', '', 'g'), 10),
      right(regexp_replace(coalesce(c.bride_phone, ''), '[^0-9]', '', 'g'), 10)
    )
  on conflict (contract_id, user_id)
  do update set last_seen_at = excluded.last_seen_at;

  return query
  select c.id, c.studio_id, c.local_id, c.contract_num, c.groom, c.bride,
         c.event_date, c.status, c.payload
  from public.contracts c
  join public.customer_portal_access a on a.contract_id = c.id
  where a.user_id = v_user_id and c.status <> 'cancelled'
  order by c.event_date desc nulls last;
end;
$$;

revoke execute on function public.claim_customer_contracts() from public, anon;
grant execute on function public.claim_customer_contracts() to authenticated;

-- Customer uploads: {studio_id}/customer/{contract_uuid}/{asset_id}/{filename}
drop policy if exists customer_files_insert on storage.objects;
create policy customer_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'studio-files'
    and (storage.foldername(name))[2] = 'customer'
    and exists (
      select 1 from public.customer_portal_access a
      where a.user_id = (select auth.uid())
        and a.studio_id::text = (storage.foldername(name))[1]
        and a.contract_id::text = (storage.foldername(name))[3]
    )
  );

drop policy if exists customer_files_select on storage.objects;
create policy customer_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'studio-files'
    and exists (
      select 1
      from public.customer_portal_messages m
      join public.customer_portal_access a on a.contract_id = m.contract_id
      where m.attachment_path = storage.objects.name
        and a.user_id = (select auth.uid())
    )
  );

drop policy if exists customer_files_delete_own on storage.objects;
create policy customer_files_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'studio-files'
    and owner_id = (select auth.uid())::text
    and not exists (
      select 1 from public.customer_portal_messages m
      where m.attachment_path = storage.objects.name
    )
  );

revoke all on public.customer_portal_access, public.customer_portal_messages from anon;
grant select on public.customer_portal_access to authenticated;
grant select, insert on public.customer_portal_messages to authenticated;

comment on function public.claim_customer_contracts() is
  'Public authenticated RPC: binds only the caller verified phone to matching active contracts.';
