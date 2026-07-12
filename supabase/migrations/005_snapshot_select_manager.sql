-- Studio M — Restrict snapshot SELECT to studio managers only
-- Run after 004_realtime_storage.sql

drop policy if exists "snapshots_select_member" on public.studio_snapshots;
drop policy if exists "snapshots_select_manager" on public.studio_snapshots;

create policy "snapshots_select_manager" on public.studio_snapshots for select
  using (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid()
      and 'studio_manager' = any(roles)
      and status = 'active'
  ));
