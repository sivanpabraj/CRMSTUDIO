-- Only the trusted SMS Edge Function may finalize provider delivery state.
-- The initial reservation remains user-scoped and permission checked.

create or replace function public.complete_sms_dispatch(
  p_dispatch_id uuid,
  p_success boolean,
  p_failure_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sms_dispatches
  set status = case when p_success then 'sent' else 'failed' end,
      failure_code = case
        when p_success then null
        else left(coalesce(p_failure_code, 'provider_failed'), 120)
      end,
      completed_at = now()
  where id = p_dispatch_id
    and status = 'reserved';

  return found;
end;
$$;

revoke execute on function public.complete_sms_dispatch(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_sms_dispatch(uuid, boolean, text)
  to service_role;

comment on function public.complete_sms_dispatch(uuid, boolean, text) is
  'Internal SMS provider finalization; executable only by service_role';


