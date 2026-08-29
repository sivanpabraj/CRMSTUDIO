begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(29);

insert into auth.users(instance_id,id,aud,role,email,phone,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','13000000-0000-4000-8000-000000000001','authenticated','authenticated','portal-manager@test.invalid','09121111111',now(),now()),
('00000000-0000-0000-0000-000000000000','13000000-0000-4000-8000-000000000002','authenticated','authenticated','portal-staff@test.invalid','09122222222',now(),now()),
('00000000-0000-0000-0000-000000000000','13000000-0000-4000-8000-000000000003','authenticated','authenticated','portal-outsider@test.invalid','09123333333',now(),now());
insert into public.studios(id,name,slug) values
('23000000-0000-4000-8000-000000000001','Portal Authority A','portal-authority-a'),
('23000000-0000-4000-8000-000000000002','Portal Authority B','portal-authority-b');
insert into public.studio_members(studio_id,user_id,display_name,roles,status,valid_from,valid_until,revoked_at) values
('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','Manager',array['studio_manager'],'active',now()-interval '1 day',null,null),
('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000002','Staff',array['photographer'],'active',now()-interval '1 day',null,null);
insert into public.erp_personnel_contracts(id,studio_id,personnel_user_id,starts_on,compensation,terms,status,created_by) values
('33000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000002',current_date,'{}','{}','offered','13000000-0000-4000-8000-000000000001'),
('33000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000003',current_date,'{}','{}','offered','13000000-0000-4000-8000-000000000003');
insert into public.erp_work_orders(id,studio_id,title,status,created_by) values
('43000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','Portal assignment','planned','13000000-0000-4000-8000-000000000001');
insert into public.erp_work_order_assignments(id,studio_id,work_order_id,user_id,assignment_role,
 valid_from,valid_until,scheduled_start_at,scheduled_end_at,assignment_status) values
('53000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001',
 '13000000-0000-4000-8000-000000000002','photographer',now()+interval '1 day',now()+interval '1 day 2 hours',
 now()+interval '1 day',now()+interval '1 day 2 hours','offered');
insert into public.erp_attendance_entries(studio_id,personnel_user_id,check_in_at,check_out_at,source,created_by) values
('23000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000003',now()-interval '2 hours',now()-interval '1 hour','manager','13000000-0000-4000-8000-000000000003');

create temp table _personnel_otp(result jsonb);
grant select on _personnel_otp to authenticated;
set local role service_role;
insert into _personnel_otp select public.issue_personnel_contract_otp_service(
 '33000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000002');
reset role;

select ok(not has_table_privilege('authenticated','public.erp_personnel_contract_otp_challenges','SELECT'),'browser cannot read personnel OTP hashes');
select ok(has_function_privilege('service_role','public.issue_personnel_contract_otp_service(uuid,uuid)','EXECUTE'),'Edge service can issue personnel OTP');
select ok(not has_function_privilege('authenticated','public.issue_personnel_contract_otp_service(uuid,uuid)','EXECUTE'),'browser cannot issue OTP through service RPC');
select ok(has_function_privilege('authenticated','public.accept_personnel_contract_with_otp(uuid,bigint,uuid,text)','EXECUTE'),'authenticated owner can submit OTP response');
select ok(not has_table_privilege('authenticated','public.erp_personnel_contracts','UPDATE'),'personnel contracts have no direct browser update grant');
select ok(not has_table_privilege('authenticated','public.erp_work_order_assignments','UPDATE'),'assignments have no direct browser update grant');
select ok(not has_table_privilege('authenticated','public.erp_attendance_entries','INSERT'),'attendance has no direct browser insert grant');
select ok(has_table_privilege('authenticated','public.erp_attendance_entries','SELECT'),'attendance projection has an explicit read grant');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.erp_personnel_contracts),1::bigint,'RLS exposes only the personnel own contract');
select is((select count(*) from public.erp_personnel_contracts where studio_id='23000000-0000-4000-8000-000000000002'),0::bigint,'RLS hides another tenant personnel contract');
select throws_ok($$update public.erp_personnel_contracts set status='accepted' where id='33000000-0000-4000-8000-000000000001'$$,
 '42501',null,'direct personnel contract update is rejected');
select throws_ok($$select public.respond_work_order_assignment('53000000-0000-4000-8000-000000000001',9,true)$$,
 '40001','assignment_version_conflict','assignment optimistic version is enforced');
select is((public.respond_work_order_assignment('53000000-0000-4000-8000-000000000001',1,true)->>'status'),'active','personnel accepts own offered assignment');
select is((select assignment_status from public.erp_work_order_assignments where id='53000000-0000-4000-8000-000000000001'),'active','accepted assignment persists as active');
select throws_ok($$select public.respond_work_order_assignment('53000000-0000-4000-8000-000000000001',2,true)$$,
 '22023','invalid_assignment_transition','assignment response cannot be replayed');
select is((public.record_attendance_action('23000000-0000-4000-8000-000000000001','check_in',null)->>'status'),'open','check-in uses the authenticated server command');
select is((select count(*) from public.erp_attendance_entries where check_out_at is null),1::bigint,'one open shift is visible to its owner');
select throws_ok($$select public.record_attendance_action('23000000-0000-4000-8000-000000000001','check_in',null)$$,
 '23505','attendance_already_open','duplicate open shift is rejected');
select throws_ok($$select public.record_attendance_action('23000000-0000-4000-8000-000000000001','check_out',8)$$,
 '40001','attendance_version_conflict','check-out optimistic version is enforced');
select is((public.record_attendance_action('23000000-0000-4000-8000-000000000001','check_out',1)->>'status'),'completed','check-out closes the shift');
select is((select count(*) from public.erp_attendance_entries where check_out_at is not null),1::bigint,'completed own shift persists while foreign row remains hidden');
select is((select count(*) from public.erp_attendance_entries where studio_id='23000000-0000-4000-8000-000000000002'),0::bigint,'attendance RLS hides another tenant row');
select is((public.accept_personnel_contract_with_otp(
 '33000000-0000-4000-8000-000000000001',1,
 (select (result->>'challengeId')::uuid from _personnel_otp),'000000')->>'ok')::boolean,false,
 'wrong OTP returns a typed failure so its attempt can commit');
reset role;
select is((select attempts from public.erp_personnel_contract_otp_challenges
 where id=(select (result->>'challengeId')::uuid from _personnel_otp)),1::smallint,'wrong OTP attempt persists outside the function');
select is((select status from public.erp_personnel_contracts where id='33000000-0000-4000-8000-000000000001'),'offered','wrong OTP leaves contract unchanged');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000002',true);
select is((public.accept_personnel_contract_with_otp(
 '33000000-0000-4000-8000-000000000001',1,
 (select (result->>'challengeId')::uuid from _personnel_otp),(select result->>'code' from _personnel_otp))->>'status'),
 'accepted','correct OTP atomically accepts the personnel contract');
reset role;
select is((select status from public.erp_personnel_contracts where id='33000000-0000-4000-8000-000000000001'),'accepted','accepted contract state persists');
select ok((select consumed_at is not null from public.erp_personnel_contract_otp_challenges
 where id=(select (result->>'challengeId')::uuid from _personnel_otp)),'accepted OTP is consumed exactly once');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.complete_own_work_order_assignment('53000000-0000-4000-8000-000000000001',2)$$,
 'P0002','assignment_not_found','another user cannot mutate the assignment');

select * from finish();
rollback;
