#!/usr/bin/env bash
set -euo pipefail

db_url="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
tmp_dir="$(mktemp -d)"
studio_id="70000000-0000-4000-8000-000000000001"
user_id="70000000-0000-4000-8000-000000000002"
work_a="70000000-0000-4000-8000-000000000003"
work_b="70000000-0000-4000-8000-000000000004"

cleanup() {
  psql "$db_url" --no-psqlrc --quiet --command \
    "delete from public.studios where id = '$studio_id'; delete from auth.users where id = '$user_id';" \
    >/dev/null 2>&1 || true
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

psql "$db_url" --no-psqlrc --set ON_ERROR_STOP=1 <<SQL
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '$user_id', 'authenticated', 'authenticated',
  'concurrency@erp.test', now(), now());
insert into public.studios (id, name, join_code)
values ('$studio_id', 'Concurrency fixture', 'CONCUR');
insert into public.studio_members
  (studio_id, user_id, roles, status, valid_from)
values ('$studio_id', '$user_id', array['studio_manager'], 'active', now() - interval '1 hour');
insert into public.erp_work_orders (id, studio_id, title, created_by)
values
  ('$work_a', '$studio_id', 'Concurrent A', '$user_id'),
  ('$work_b', '$studio_id', 'Concurrent B', '$user_id');
SQL

psql "$db_url" --no-psqlrc --set ON_ERROR_STOP=1 >"$tmp_dir/session-a.log" 2>&1 <<SQL &
begin;
insert into public.erp_work_order_assignments
  (studio_id, work_order_id, user_id, assignment_role,
   scheduled_start_at, scheduled_end_at, assignment_status)
values
  ('$studio_id', '$work_a', '$user_id', 'photographer',
   '2030-01-01 10:00:00+00', '2030-01-01 12:00:00+00', 'active');
select pg_sleep(3);
commit;
SQL
session_a_pid=$!

sleep 0.5
set +e
psql "$db_url" --no-psqlrc --set ON_ERROR_STOP=1 >"$tmp_dir/session-b.log" 2>&1 <<SQL
begin;
insert into public.erp_work_order_assignments
  (studio_id, work_order_id, user_id, assignment_role,
   scheduled_start_at, scheduled_end_at, assignment_status)
values
  ('$studio_id', '$work_b', '$user_id', 'photographer_clip',
   '2030-01-01 11:00:00+00', '2030-01-01 13:00:00+00', 'active');
commit;
SQL
session_b_status=$?
set -e
wait "$session_a_pid"

if [[ "$session_b_status" -eq 0 ]]; then
  echo "overlapping concurrent assignment unexpectedly committed" >&2
  exit 1
fi

if ! grep -q 'erp_assignment_no_personnel_overlap' "$tmp_dir/session-b.log"; then
  sed -n '1,160p' "$tmp_dir/session-b.log" >&2
  echo "second session failed for an unexpected reason" >&2
  exit 1
fi

count="$(psql "$db_url" --no-psqlrc --tuples-only --no-align --command \
  "select count(*) from public.erp_work_order_assignments where studio_id = '$studio_id' and assignment_status = 'active';")"
if [[ "$count" != "1" ]]; then
  echo "expected exactly one committed assignment, found $count" >&2
  exit 1
fi

echo "concurrent overlap rejected; exactly one assignment committed"
