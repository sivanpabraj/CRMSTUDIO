-- Durable SMS authorization, quotas and audit trail.

create table if not exists public.sms_dispatches (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),
  purpose text not null check (purpose in (
    'otp_login', 'portal_invite', 'password_reset', 'contract_verify',
    'cheque_reminder', 'generic'
  )),
  recipient_count integer not null check (recipient_count between 1 and 10),
  status text not null default 'reserved'
    check (status in ('reserved', 'sent', 'failed')),
  failure_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (studio_id, idempotency_key)
);

create index if not exists sms_dispatches_user_created
  on public.sms_dispatches (studio_id, user_id, created_at desc);
create index if not exists sms_dispatches_studio_created
  on public.sms_dispatches (studio_id, created_at desc);

alter table public.sms_dispatches enable row level security;

create policy sms_dispatches_read on public.sms_dispatches for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_studio_permission(studio_id, 'members.manage')
  );

revoke all on public.sms_dispatches from authenticated;
grant select on public.sms_dispatches to authenticated;

create or replace function public.reserve_sms_dispatch(
  p_studio_id uuid,
  p_purpose text,
  p_recipient_count integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roles text[];
  v_existing public.sms_dispatches;
  v_dispatch public.sms_dispatches;
  v_user_minute integer;
  v_studio_day integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_purpose not in (
    'otp_login', 'portal_invite', 'password_reset', 'contract_verify',
    'cheque_reminder', 'generic'
  ) then raise exception 'sms_purpose_not_allowed'; end if;
  if p_recipient_count not between 1 and 10 then raise exception 'invalid_recipient_count'; end if;
  if length(coalesce(p_idempotency_key, '')) not between 8 and 128 then
    raise exception 'invalid_idempotency_key';
  end if;

  select roles into v_roles
  from public.studio_members
  where studio_id = p_studio_id
    and user_id = auth.uid()
    and status = 'active';
  if not found then raise exception 'sms_membership_denied' using errcode = '42501'; end if;

  if p_purpose = 'generic'
    and not (v_roles && array['owner', 'system_admin', 'studio_manager']::text[]) then
    raise exception 'sms_permission_denied' using errcode = '42501';
  end if;
  if p_purpose in ('portal_invite', 'contract_verify', 'cheque_reminder')
    and not (v_roles && array['owner', 'system_admin', 'studio_manager', 'accountant', 'office_secretary']::text[]) then
    raise exception 'sms_permission_denied' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('sms:studio:' || p_studio_id::text, 0)
  );

  select * into v_existing
  from public.sms_dispatches
  where studio_id = p_studio_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'dispatchId', v_existing.id,
      'status', v_existing.status,
      'deduped', true
    );
  end if;

  select coalesce(sum(recipient_count), 0)::integer into v_user_minute
  from public.sms_dispatches
  where studio_id = p_studio_id
    and user_id = auth.uid()
    and created_at >= now() - interval '1 minute';
  if v_user_minute + p_recipient_count > 20 then
    raise exception 'sms_user_rate_limit';
  end if;

  select coalesce(sum(recipient_count), 0)::integer into v_studio_day
  from public.sms_dispatches
  where studio_id = p_studio_id
    and created_at >= date_trunc('day', now());
  if v_studio_day + p_recipient_count > 500 then
    raise exception 'sms_studio_daily_quota';
  end if;

  insert into public.sms_dispatches (
    studio_id, user_id, idempotency_key, purpose, recipient_count
  ) values (
    p_studio_id, auth.uid(), p_idempotency_key, p_purpose, p_recipient_count
  ) returning * into v_dispatch;

  return jsonb_build_object(
    'dispatchId', v_dispatch.id,
    'status', v_dispatch.status,
    'deduped', false
  );
end;
$$;

create or replace function public.complete_sms_dispatch(
  p_dispatch_id uuid,
  p_success boolean,
  p_failure_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sms_dispatches
  set status = case when p_success then 'sent' else 'failed' end,
      failure_code = case when p_success then null else left(coalesce(p_failure_code, 'provider_failed'), 120) end,
      completed_at = now()
  where id = p_dispatch_id
    and user_id = auth.uid()
    and status = 'reserved';
  return found;
end;
$$;

revoke all on function public.reserve_sms_dispatch(uuid, text, integer, text) from public;
revoke all on function public.complete_sms_dispatch(uuid, boolean, text) from public;
grant execute on function public.reserve_sms_dispatch(uuid, text, integer, text) to authenticated;
grant execute on function public.complete_sms_dispatch(uuid, boolean, text) to authenticated;
