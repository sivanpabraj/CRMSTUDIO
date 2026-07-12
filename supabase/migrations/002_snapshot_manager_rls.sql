-- Studio M — tighten snapshot RLS (managers only for write)
-- Run after 001_studio_m_mvp.sql

drop policy if exists "snapshots_upsert_member" on public.studio_snapshots;
drop policy if exists "snapshots_select_member" on public.studio_snapshots;

create policy "snapshots_select_member" on public.studio_snapshots for select
  using (studio_id in (select public.user_studio_ids()));

create policy "snapshots_insert_manager" on public.studio_snapshots for insert
  with check (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
  ));

create policy "snapshots_update_manager" on public.studio_snapshots for update
  using (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
  ))
  with check (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
  ));

create policy "snapshots_delete_manager" on public.studio_snapshots for delete
  using (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
  ));

-- upsert_studio_snapshot: managers only
create or replace function public.upsert_studio_snapshot(
  p_studio_id uuid,
  p_data jsonb,
  p_db_version int default 20,
  p_app_version text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := now();
begin
  if not exists (
    select 1 from public.studio_members
    where studio_id = p_studio_id and user_id = auth.uid() and status = 'active'
      and 'studio_manager' = any(roles)
  ) then
    raise exception 'forbidden';
  end if;

  insert into public.studio_snapshots (studio_id, data, db_version, app_version, updated_at, updated_by)
  values (p_studio_id, p_data, p_db_version, p_app_version, v_at, auth.uid())
  on conflict (studio_id) do update set
    data = excluded.data,
    db_version = excluded.db_version,
    app_version = excluded.app_version,
    updated_at = v_at,
    updated_by = auth.uid();

  update public.studios set updated_at = v_at where id = p_studio_id;
  return v_at;
end;
$$;
