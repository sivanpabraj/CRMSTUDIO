begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

-- Deterministic fixtures. The transaction rollback leaves local/staging clean.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'manager-a@rls.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'accountant-a@rls.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'photographer-a@rls.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'expired-a@rls.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'customer-a@rls.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'manager-b@rls.test', now(), now())
on conflict (id) do nothing;

insert into public.studios (id, name, join_code)
values
  ('20000000-0000-4000-8000-000000000001', 'RLS Studio A', 'RLS-A'),
  ('20000000-0000-4000-8000-000000000002', 'RLS Studio B', 'RLS-B')
on conflict (id) do nothing;

insert into public.studio_members
  (studio_id, user_id, display_name, roles, status, valid_from, valid_until, revoked_at)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Manager A', array['studio_manager'], 'active', now() - interval '1 day', null, null),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Accountant A', array['accountant'], 'active', now() - interval '1 day', null, null),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'Photographer A', array['photographer'], 'active', now() - interval '1 day', null, null),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'Expired A', array['studio_manager'], 'active', now() - interval '2 days', now() - interval '1 day', null),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000006', 'Manager B', array['studio_manager'], 'active', now() - interval '1 day', null, null)
on conflict (studio_id, user_id) do update set
  roles = excluded.roles, status = excluded.status, valid_from = excluded.valid_from,
  valid_until = excluded.valid_until, revoked_at = excluded.revoked_at;

insert into public.contracts
  (id, studio_id, local_id, contract_num, groom, bride, total, payload)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'rls-contract-a', 'A-1', 'A', 'A', 100, '{}'::jsonb),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'rls-contract-b', 'B-1', 'B', 'B', 200, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.studio_snapshots (studio_id, data, updated_by)
values ('20000000-0000-4000-8000-000000000001', '{"fixture":true}', '10000000-0000-4000-8000-000000000001')
on conflict (studio_id) do update set data = excluded.data;

insert into public.finance_commands
  (id, studio_id, user_id, idempotency_key, operation, payload, status, result, completed_at)
values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'rls-fixture-command-a', 'record_deposit', '{}'::jsonb, 'accepted', '{"ok":true}', now()
)
on conflict (id) do nothing;

insert into public.erp_work_orders
  (id, studio_id, contract_id, title, status, created_by)
values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Assigned A', 'planned', '10000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Unassigned A', 'planned', '10000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.erp_work_order_assignments
  (id, studio_id, work_order_id, user_id, assignment_role,
   valid_from, valid_until, scheduled_start_at, scheduled_end_at, assignment_status)
values (
  '60000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003', 'photographer',
  now() - interval '1 hour', now() + interval '1 day',
  now() + interval '2 days', now() + interval '2 days 2 hours', 'active'
)
on conflict (id) do nothing;

insert into public.customer_portal_access (studio_id, contract_id, user_id)
values (
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000005'
)
on conflict (contract_id, user_id) do nothing;

-- Cross-tenant integrity is independent from RLS and must reject bad links.
select throws_ok(
  $$insert into public.erp_work_order_assignments
      (studio_id, work_order_id, user_id, assignment_role,
       scheduled_start_at, scheduled_end_at, assignment_status)
    values (
      '20000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000006', 'photographer',
      now() + interval '3 days', now() + interval '3 days 1 hour', 'active'
    )$$,
  '23514', 'erp_work_order_studio_mismatch',
  'cross-tenant work-order assignment is rejected'
);

-- The exclusion constraint, not an application pre-check, rejects overlaps.
select throws_ok(
  $$insert into public.erp_work_order_assignments
      (studio_id, work_order_id, user_id, assignment_role,
       scheduled_start_at, scheduled_end_at, assignment_status)
    values (
      '20000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003', 'photographer_clip',
      now() + interval '2 days 1 hour', now() + interval '2 days 3 hours', 'active'
    )$$,
  '23P01', null,
  'overlapping personnel assignment is rejected by PostgreSQL'
);

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.contracts), 1::bigint, 'manager reads only own-tenant contract');
select is((select count(*) from public.finance_commands), 1::bigint, 'manager reads own finance');
select is((select count(*) from public.erp_work_orders), 2::bigint, 'manager reads all own operational work');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.finance_commands), 1::bigint, 'accountant reads finance');
select is((select count(*) from public.erp_work_orders), 0::bigint, 'accountant does not inherit operations access');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.contracts), 0::bigint, 'photographer cannot read contract PII/finance');
select is((select count(*) from public.finance_commands), 0::bigint, 'photographer cannot read finance');
select is((select count(*) from public.erp_work_orders), 1::bigint, 'photographer reads assigned work only');
select is((select count(*) from public.erp_work_orders where id = '50000000-0000-4000-8000-000000000002'), 0::bigint, 'photographer cannot IDOR an unassigned work order');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.studio_snapshots), 0::bigint, 'expired manager cannot read snapshot');
select is((select count(*) from public.finance_commands), 0::bigint, 'expired manager cannot read finance');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select is((select count(*) from public.contracts), 1::bigint, 'customer reads own contract');
select is((select count(*) from public.contracts where studio_id = '20000000-0000-4000-8000-000000000002'), 0::bigint, 'customer cannot IDOR a foreign contract');
select is((select count(*) from public.finance_commands), 0::bigint, 'customer cannot read studio finance');

select * from finish();
rollback;
