begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(14);

insert into auth.users (instance_id,id,aud,role,email,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000001',
  'authenticated','authenticated','manager-lifecycle@example.test',now(),now()),
 ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000002',
  'authenticated','authenticated','customer-lifecycle@example.test',now(),now());
insert into public.studios (id,name,slug) values
 ('20000000-0000-4000-8000-000000000001','Lifecycle test studio','lifecycle-test-studio'),
 ('20000000-0000-4000-8000-000000000002','Foreign lifecycle studio','foreign-lifecycle-studio');
insert into public.studio_members
 (studio_id,user_id,display_name,roles,status,valid_from,valid_until,revoked_at) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'Lifecycle manager',array['studio_manager'],'active',now() - interval '1 day',null,null);
insert into public.contracts
 (id,studio_id,local_id,contract_num,status,event_date,event_starts_at,event_ends_at,total,payload)
values
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  'lifecycle-contract','LC-0001','active','1405-06-20',
  '2026-09-11 08:00:00+00','2026-09-11 16:00:00+00',100000000,'{}'::jsonb);
insert into public.customer_portal_access (studio_id,contract_id,user_id) values
 ('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002');
insert into public.erp_contract_revision_policies
 (studio_id,contract_id,included_revisions,extra_revision_price_irr,created_by) values
 ('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',1,null,
 '10000000-0000-4000-8000-000000000001');
insert into public.erp_work_orders
 (id,studio_id,contract_id,title,created_by) values
 ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,
  'Unrelated work order','10000000-0000-4000-8000-000000000001');

select throws_ok($$
  insert into public.erp_contract_lifecycle_events
    (studio_id,contract_id,event_type,reason,idempotency_key,actor_id)
  values
    ('20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001',
     'rescheduled','cross tenant probe','cross-tenant-event-probe',
     '10000000-0000-4000-8000-000000000001')
$$,'23514','contract_studio_mismatch',
  'common child trigger rejects a lifecycle event assigned to another tenant');
select throws_ok($$
  insert into public.erp_contract_revision_requests
    (studio_id,contract_id,work_order_id,sequence_no,included,charge_irr,note,requested_by)
  values
    ('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
     '50000000-0000-4000-8000-000000000001',1,true,0,'mismatched work order probe',
     '10000000-0000-4000-8000-000000000001')
$$,'23514','revision_work_order_mismatch',
  'revision-specific trigger rejects a work order not bound to the contract');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select lives_ok(
 $$select public.request_contract_revision('40000000-0000-4000-8000-000000000001',null,'اصلاح رنگ انتخاب‌های نهایی')$$,
 'customer can consume the included revision');
select throws_ok(
 $$select public.request_contract_revision('40000000-0000-4000-8000-000000000001',null,'اصلاح دوم خارج از سقف')$$,
 'P0001','revision_limit_exceeded','second revision is rejected without an extra price');
select is((select count(*)::bigint from public.erp_contract_revision_requests
 where contract_id='40000000-0000-4000-8000-000000000001'),1::bigint,
 'over-limit request leaves no partial row');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select lives_ok(
 $$select public.create_photo_selection_session('40000000-0000-4000-8000-000000000001',1,1)$$,
 'manager creates one-photo selection session');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select lives_ok(
 $$select public.set_photo_selection_item((select id from public.erp_photo_selection_sessions
 where contract_id='40000000-0000-4000-8000-000000000001'),'asset-001',true)$$,
 'customer selects while open');
select throws_ok(
 $$select public.set_photo_selection_item((select id from public.erp_photo_selection_sessions
 where contract_id='40000000-0000-4000-8000-000000000001'),'asset-002',true)$$,
 'P0001','photo_selection_limit_exceeded','selection cannot exceed cap');
select lives_ok(
 $$select public.transition_photo_selection((select id from public.erp_photo_selection_sessions
 where contract_id='40000000-0000-4000-8000-000000000001'),'submit')$$,
 'customer submits non-empty selection');
select throws_ok(
 $$select public.set_photo_selection_item((select id from public.erp_photo_selection_sessions
 where contract_id='40000000-0000-4000-8000-000000000001'),'asset-001',false)$$,
 '55000','selection_session_locked','submitted selection cannot mutate');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select lives_ok(
 $$select public.transition_photo_selection((select id from public.erp_photo_selection_sessions
 where contract_id='40000000-0000-4000-8000-000000000001'),'approve')$$,
 'manager approves submitted selection');
select lives_ok(
 $$select public.transition_photo_selection((select id from public.erp_photo_selection_sessions
 where contract_id='40000000-0000-4000-8000-000000000001'),'lock')$$,
 'manager locks approved selection');
select lives_ok(
 $$select public.transition_photo_selection((select id from public.erp_photo_selection_sessions
 where contract_id='40000000-0000-4000-8000-000000000001'),'deliver')$$,
 'manager delivers locked selection');
select throws_ok(
 $$update public.contracts set event_date='1405-06-21'
 where id='40000000-0000-4000-8000-000000000001'$$,
 '42501','contract_lifecycle_rpc_required','direct event-date mutation is blocked');

select * from finish();
rollback;
