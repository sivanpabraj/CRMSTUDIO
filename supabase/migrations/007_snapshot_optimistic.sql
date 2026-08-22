-- 007: optimistic concurrency for studio snapshots (reject stale LWW push)
-- Apply in SQL Editor after 001–006.

create or replace function public.upsert_studio_snapshot(
  p_studio_id uuid,
  p_data jsonb,
  p_db_version int default 20,
  p_app_version text default null,
  p_expected_updated_at timestamptz default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := now();
  v_current timestamptz;
begin
  if not exists (
    select 1 from public.studio_members
    where studio_id = p_studio_id and user_id = auth.uid() and status = 'active'
      and 'studio_manager' = any(roles)
  ) then
    raise exception 'forbidden';
  end if;

  select updated_at into v_current
  from public.studio_snapshots
  where studio_id = p_studio_id
  for update;

  if v_current is not null
     and p_expected_updated_at is not null
     and v_current is distinct from p_expected_updated_at then
    raise exception 'snapshot_conflict'
      using detail = format('expected %s got %s', p_expected_updated_at, v_current);
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

grant execute on function public.upsert_studio_snapshot(uuid, jsonb, int, text, timestamptz) to authenticated;
