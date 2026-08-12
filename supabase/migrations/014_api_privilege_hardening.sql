-- Lock down PostgREST exposure independently from RLS.
-- RLS filters rows; SQL grants decide which API operations are reachable at all.

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

-- Remove broad/default signed-in grants, then restore only the operations the app uses.
revoke all privileges on all tables in schema public from authenticated;
revoke all privileges on all sequences in schema public from authenticated;
revoke execute on all functions in schema public from authenticated;

grant select, update on public.studios to authenticated;
grant select on public.studio_members to authenticated;
grant select, insert, update, delete on public.studio_snapshots to authenticated;
grant select, insert, update, delete on public.contracts to authenticated;
grant select, insert, update, delete on public.studio_sync_cursors to authenticated;
grant select, insert, update, delete on public.studio_entities to authenticated;
grant select, insert on public.studio_sync_events to authenticated;
grant select on public.studio_mutation_audit to authenticated;
grant select on public.studio_ledger_entries to authenticated;
grant select on public.studio_ledger_heads to authenticated;
grant select on public.finance_commands to authenticated;
grant select on public.finance_transactions to authenticated;
grant select on public.finance_transaction_heads to authenticated;
grant select on public.finance_journal_lines to authenticated;
grant select on public.finance_account_balances to authenticated;
grant select on public.studio_invitations to authenticated;
grant select on public.studio_join_requests to authenticated;
grant select on public.sms_dispatches to authenticated;

grant execute on function public.user_studio_ids() to authenticated;
grant execute on function public.register_studio(text, text, text, text) to authenticated;
grant execute on function public.upsert_studio_snapshot(uuid, jsonb, integer, text) to authenticated;
grant execute on function public.upsert_studio_entities(uuid, text, jsonb) to authenticated;
grant execute on function public.claim_ledger_version(uuid, bigint) to authenticated;
grant execute on function public.rls_can_select_studio(uuid) to authenticated;
grant execute on function public.has_studio_permission(uuid, text) to authenticated;
grant execute on function public.post_finance_command(uuid, text, text, jsonb) to authenticated;
grant execute on function public.create_studio_invitation(uuid, text[], integer, integer) to authenticated;
grant execute on function public.request_studio_join(text, text, text) to authenticated;
grant execute on function public.review_studio_join(uuid, boolean) to authenticated;
grant execute on function public.reserve_sms_dispatch(uuid, text, integer, text) to authenticated;
grant execute on function public.complete_sms_dispatch(uuid, boolean, text) to authenticated;

-- Keep future objects private unless a migration explicitly grants API access.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;


