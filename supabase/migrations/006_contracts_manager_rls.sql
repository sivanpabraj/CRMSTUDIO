-- Studio M — tighten contracts RLS (managers only for write)
-- Run after 001_studio_m_mvp.sql

drop policy if exists "contracts_write_member" on public.contracts;

create policy "contracts_insert_manager" on public.contracts for insert
  with check (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
  ));

create policy "contracts_update_manager" on public.contracts for update
  using (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
  ))
  with check (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
  ));

create policy "contracts_delete_manager" on public.contracts for delete
  using (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
  ));
