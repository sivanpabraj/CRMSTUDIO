-- RLS evaluation and foreign-key lookup hardening for production scale.

create index if not exists finance_commands_user_id_idx on public.finance_commands (user_id);
create index if not exists finance_transaction_heads_current_tx_idx on public.finance_transaction_heads (current_transaction_id);
create index if not exists finance_transactions_command_id_idx on public.finance_transactions (command_id);
create index if not exists finance_transactions_reverses_id_idx on public.finance_transactions (reverses_id);
create index if not exists sms_dispatches_user_id_idx on public.sms_dispatches (user_id);
create index if not exists studio_entities_updated_by_idx on public.studio_entities (updated_by);
create index if not exists studio_invitations_created_by_idx on public.studio_invitations (created_by);
create index if not exists studio_join_requests_invitation_id_idx on public.studio_join_requests (invitation_id);
create index if not exists studio_join_requests_reviewed_by_idx on public.studio_join_requests (reviewed_by);
create index if not exists studio_join_requests_user_id_idx on public.studio_join_requests (user_id);
create index if not exists studio_ledger_entries_audit_id_idx on public.studio_ledger_entries (audit_id);
create index if not exists studio_ledger_entries_user_id_idx on public.studio_ledger_entries (user_id);
create index if not exists studio_mutation_audit_user_id_idx on public.studio_mutation_audit (user_id);
create index if not exists studio_snapshots_updated_by_idx on public.studio_snapshots (updated_by);
create index if not exists studio_sync_events_actor_idx on public.studio_sync_events (actor);

drop policy if exists "studios_update_manager" on public.studios;
create policy "studios_update_manager" on public.studios for update to authenticated
  using (exists (
    select 1 from public.studio_members m
    where m.studio_id = studios.id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ))
  with check (exists (
    select 1 from public.studio_members m
    where m.studio_id = studios.id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ));

drop policy if exists "members_select_self_or_manager" on public.studio_members;
create policy "members_select_self_or_manager" on public.studio_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_studio_permission(studio_id, 'members.manage')
  );

drop policy if exists "snapshots_select_manager" on public.studio_snapshots;
drop policy if exists "snapshots_insert_manager" on public.studio_snapshots;
drop policy if exists "snapshots_update_manager" on public.studio_snapshots;
drop policy if exists "snapshots_delete_manager" on public.studio_snapshots;
create policy "snapshots_select_manager" on public.studio_snapshots for select to authenticated
  using (exists (
    select 1 from public.studio_members m
    where m.studio_id = studio_snapshots.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ));
create policy "snapshots_insert_manager" on public.studio_snapshots for insert to authenticated
  with check (exists (
    select 1 from public.studio_members m
    where m.studio_id = studio_snapshots.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ));
create policy "snapshots_update_manager" on public.studio_snapshots for update to authenticated
  using (exists (
    select 1 from public.studio_members m
    where m.studio_id = studio_snapshots.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ))
  with check (exists (
    select 1 from public.studio_members m
    where m.studio_id = studio_snapshots.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ));
create policy "snapshots_delete_manager" on public.studio_snapshots for delete to authenticated
  using (exists (
    select 1 from public.studio_members m
    where m.studio_id = studio_snapshots.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ));

drop policy if exists "contracts_insert_manager" on public.contracts;
drop policy if exists "contracts_update_manager" on public.contracts;
drop policy if exists "contracts_delete_manager" on public.contracts;
create policy "contracts_insert_manager" on public.contracts for insert to authenticated
  with check (exists (
    select 1 from public.studio_members m
    where m.studio_id = contracts.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ));
create policy "contracts_update_manager" on public.contracts for update to authenticated
  using (exists (
    select 1 from public.studio_members m
    where m.studio_id = contracts.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ))
  with check (exists (
    select 1 from public.studio_members m
    where m.studio_id = contracts.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ));
create policy "contracts_delete_manager" on public.contracts for delete to authenticated
  using (exists (
    select 1 from public.studio_members m
    where m.studio_id = contracts.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ));

drop policy if exists "sync_cursors_write_manager" on public.studio_sync_cursors;
create policy "sync_cursors_insert_manager" on public.studio_sync_cursors for insert to authenticated
  with check (exists (
    select 1 from public.studio_members m
    where m.studio_id = studio_sync_cursors.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ));
create policy "sync_cursors_update_manager" on public.studio_sync_cursors for update to authenticated
  using (exists (
    select 1 from public.studio_members m
    where m.studio_id = studio_sync_cursors.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ))
  with check (exists (
    select 1 from public.studio_members m
    where m.studio_id = studio_sync_cursors.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ));
create policy "sync_cursors_delete_manager" on public.studio_sync_cursors for delete to authenticated
  using (exists (
    select 1 from public.studio_members m
    where m.studio_id = studio_sync_cursors.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ));

drop policy if exists "entities_write_manager" on public.studio_entities;
create policy "entities_insert_manager" on public.studio_entities for insert to authenticated
  with check (exists (
    select 1 from public.studio_members m
    where m.studio_id = studio_entities.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ));
create policy "entities_update_manager" on public.studio_entities for update to authenticated
  using (exists (
    select 1 from public.studio_members m
    where m.studio_id = studio_entities.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ))
  with check (exists (
    select 1 from public.studio_members m
    where m.studio_id = studio_entities.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ));
create policy "entities_delete_manager" on public.studio_entities for delete to authenticated
  using (exists (
    select 1 from public.studio_members m
    where m.studio_id = studio_entities.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ));

drop policy if exists "sync_events_insert_manager" on public.studio_sync_events;
create policy "sync_events_insert_manager" on public.studio_sync_events for insert to authenticated
  with check (exists (
    select 1 from public.studio_members m
    where m.studio_id = studio_sync_events.studio_id and m.user_id = (select auth.uid())
      and 'studio_manager' = any(m.roles) and m.status = 'active'
  ));

drop policy if exists "studio_join_requests_manager_read" on public.studio_join_requests;
create policy "studio_join_requests_manager_read" on public.studio_join_requests for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_studio_permission(studio_id, 'members.manage')
  );


