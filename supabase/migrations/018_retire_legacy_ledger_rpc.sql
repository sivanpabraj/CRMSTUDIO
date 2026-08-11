-- The authoritative finance path is post_finance_command. The older ledger
-- version RPC is not called by the application and must not remain exposed.

revoke execute on function public.claim_ledger_version(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.claim_ledger_version(uuid, bigint)
  to service_role;

alter function public.claim_ledger_version(uuid, bigint)
  set search_path = '';

comment on function public.claim_ledger_version(uuid, bigint) is
  'Legacy internal compatibility RPC; browser access revoked';


