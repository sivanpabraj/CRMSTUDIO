-- Migration 008: Tighten SELECT policies on contracts and financial entities (D6, D7, D8)
-- Prevents data leakage of contracts, customer financial PII, and financial entities to non-manager staff

-- 1. Tighten contracts SELECT to managers only
drop policy if exists "contracts_select_member" on public.contracts;

create policy "contracts_select_manager" on public.contracts for select
  using (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
  ));

-- 2. Tighten financial entities SELECT in studio_entities (banks, cheques, expenses, transactions)
drop policy if exists "entities_select_member" on public.studio_entities;

create policy "entities_select_scoped" on public.studio_entities for select
  using (
    studio_id in (select public.user_studio_ids())
    and (
      -- Non-financial entities are readable by all members
      entity_type not in ('banks', 'cheques', 'expenses', 'transactions', 'invoices')
      -- Financial entities require studio_manager role
      or studio_id in (
        select studio_id from public.studio_members
        where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
      )
    )
  );
