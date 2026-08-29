-- Align browser capabilities with server-enforced SMS authorization.

create or replace function public.has_studio_permission(
  p_studio_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.studio_members as m
    where m.studio_id = p_studio_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and case p_permission
        when 'finance.read' then m.roles && array['owner', 'system_admin', 'studio_manager', 'accountant']::text[]
        when 'finance.write' then m.roles && array['owner', 'system_admin', 'studio_manager', 'accountant']::text[]
        when 'members.manage' then m.roles && array['owner', 'system_admin', 'studio_manager']::text[]
        when 'sms.send' then m.roles && array['owner', 'system_admin', 'studio_manager', 'office_secretary']::text[]
        else false
      end
  );
$$;

create or replace function public.reserve_sms_dispatch(
  p_studio_id uuid,
  p_purpose text,
  p_recipient_count integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
    and not public.has_studio_permission(p_studio_id, 'sms.send') then
    raise exception 'sms_permission_denied' using errcode = '42501';
  end if;
  if p_purpose in ('portal_invite', 'contract_verify', 'cheque_reminder')
    and not (v_roles && array['owner', 'system_admin', 'studio_manager', 'accountant', 'office_secretary']::text[]) then
    raise exception 'sms_permission_denied' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sms:studio:' || p_studio_id::text, 0)
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

revoke all on function public.has_studio_permission(uuid, text) from public, anon;
grant execute on function public.has_studio_permission(uuid, text) to authenticated;
revoke all on function public.reserve_sms_dispatch(uuid, text, integer, text) from public, anon;
grant execute on function public.reserve_sms_dispatch(uuid, text, integer, text) to authenticated;


