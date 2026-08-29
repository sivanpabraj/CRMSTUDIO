-- Advisor hardening for customer portal foreign keys and contract reads.

create index if not exists customer_portal_access_studio_idx
  on public.customer_portal_access (studio_id);

create index if not exists customer_portal_messages_sender_idx
  on public.customer_portal_messages (sender_id);

-- One permissive SELECT policy is cheaper than evaluating two policies per row.
drop policy if exists contracts_select_member on public.contracts;
drop policy if exists customer_contract_read on public.contracts;
drop policy if exists contracts_read_authorized on public.contracts;
create policy contracts_read_authorized
  on public.contracts for select to authenticated
  using (
    studio_id in (select public.user_studio_ids())
    or exists (
      select 1 from public.customer_portal_access a
      where a.contract_id = contracts.id
        and a.user_id = (select auth.uid())
    )
  );
