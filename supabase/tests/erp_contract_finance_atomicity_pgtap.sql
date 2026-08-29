begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(26);

insert into auth.users(instance_id,id,aud,role,email,phone,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','14000000-0000-4000-8000-000000000001','authenticated','authenticated','atomic-manager@test.invalid','09121111111',now(),now()),
('00000000-0000-0000-0000-000000000000','14000000-0000-4000-8000-000000000002','authenticated','authenticated','atomic-secretary@test.invalid','09122222222',now(),now()),
('00000000-0000-0000-0000-000000000000','14000000-0000-4000-8000-000000000003','authenticated','authenticated','atomic-staff@test.invalid','09123333333',now(),now());
insert into public.studios(id,name,slug) values
('24000000-0000-4000-8000-000000000001','Atomic ERP','atomic-erp');
insert into public.studio_members(studio_id,user_id,display_name,roles,status,valid_from,valid_until,revoked_at) values
('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','Manager',array['studio_manager'],'active',now()-interval '1 day',null,null),
('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000002','Secretary',array['office_secretary'],'active',now()-interval '1 day',null,null),
('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000003','Staff',array['photographer'],'active',now()-interval '1 day',null,null);

create temp table _contract_otp(result jsonb);
grant select on _contract_otp to authenticated;
grant insert on _contract_otp to service_role;
set local role service_role;
insert into _contract_otp select public.issue_contract_otp_service(
 '24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','groom','09121111111');
reset role;

select ok(has_function_privilege('authenticated','public.create_contract_with_deposit(uuid,text,jsonb,jsonb,uuid,uuid)','EXECUTE'),'authenticated command boundary is explicit');
select ok(not has_table_privilege('authenticated','public.contracts','INSERT'),'browser cannot insert contract rows directly');
select ok(has_function_privilege('service_role','public.issue_contract_otp_service(uuid,uuid,text,text)','EXECUTE'),'Edge service alone can issue customer contract OTP');
select ok(not has_table_privilege('authenticated','public.erp_contract_otp_challenges','SELECT'),'browser cannot read contract OTP hashes');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000001',true);
select is((public.verify_contract_otp((select (result->>'challengeId')::uuid from _contract_otp),'000000')->>'ok')::boolean,false,
 'wrong customer OTP returns a typed failure');
reset role;
select is((select attempts from public.erp_contract_otp_challenges where id=(select (result->>'challengeId')::uuid from _contract_otp)),1::smallint,
 'wrong customer OTP attempt persists');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000001',true);
select is((public.verify_contract_otp((select (result->>'challengeId')::uuid from _contract_otp),(select result->>'code' from _contract_otp))->>'verified')::boolean,true,
 'correct customer OTP verifies on the server');
reset role;
select ok((select verified_at is not null from public.erp_contract_otp_challenges where id=(select (result->>'challengeId')::uuid from _contract_otp)),
 'customer OTP verification timestamp persists');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000001',true);
create temp table _contract_result as select public.create_contract_with_deposit(
 '24000000-0000-4000-8000-000000000001','atomic-contract-command-1',
 '{"localId":"atomic-local","eventDate":"1477/06/01","eventStartsAt":"2099-08-23T05:00:00Z","eventEndsAt":"2099-08-23T10:00:00Z","groom":"A","groomPhone":"09121111111","bride":"B","total":100000,"assignments":[{"userId":"14000000-0000-4000-8000-000000000003","roleKey":"photographer"}]}'::jsonb,
 '{"amount":20000,"bankId":"bank-main"}'::jsonb,
 (select (result->>'challengeId')::uuid from _contract_otp),null) result;
select is((select result->>'ok' from _contract_result),'true','contract command succeeds as one server transaction');
select is((select count(*) from public.contracts where studio_id='24000000-0000-4000-8000-000000000001'),1::bigint,'atomic command creates one contract');
select is((select count(*) from public.erp_work_orders where studio_id='24000000-0000-4000-8000-000000000001'),1::bigint,'atomic command creates its work order');
select is((select count(*) from public.erp_work_order_assignments where studio_id='24000000-0000-4000-8000-000000000001' and assignment_status='offered'),1::bigint,'atomic command creates an offered typed assignment');
select is((select count(*) from public.finance_transactions where studio_id='24000000-0000-4000-8000-000000000001'),1::bigint,'atomic command posts one deposit transaction');
select is((select count(*) from public.finance_journal_lines where studio_id='24000000-0000-4000-8000-000000000001'),2::bigint,'deposit creates exactly two journal lines');
select is((select sum(debit_irr) from public.finance_journal_lines where studio_id='24000000-0000-4000-8000-000000000001'),
 (select sum(credit_irr) from public.finance_journal_lines where studio_id='24000000-0000-4000-8000-000000000001'),'deposit journal is balanced');
select is((select version from public.studio_ledger_heads where studio_id='24000000-0000-4000-8000-000000000001'),1::bigint,'deposit increments the authoritative ledger version once');
reset role;
select ok((select consumed_at is not null from public.erp_contract_otp_challenges where id=(select (result->>'challengeId')::uuid from _contract_otp)),
 'contract creation consumes its verified OTP');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000001',true);
select is((public.create_contract_with_deposit(
 '24000000-0000-4000-8000-000000000001','atomic-contract-command-1',
 '{"eventDate":"1405/06/01","total":100000}'::jsonb,'{}'::jsonb,null,null)->>'deduped')::boolean,true,
 'repeated idempotency key returns the original receipt');
select is((select count(*) from public.contracts where studio_id='24000000-0000-4000-8000-000000000001'),1::bigint,'idempotent retry creates no second contract');
select is((select count(*) from public.finance_transactions where studio_id='24000000-0000-4000-8000-000000000001'),1::bigint,'idempotent retry creates no second deposit');

select set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.create_contract_with_deposit(
 '24000000-0000-4000-8000-000000000001','secretary-deposit-command',
 '{"localId":"must-rollback","eventDate":"1477/06/02","eventStartsAt":"2099-08-24T05:00:00Z","eventEndsAt":"2099-08-24T10:00:00Z","groom":"C","bride":"D","total":50000}'::jsonb,
 '{"amount":10000,"bankId":"bank-main"}'::jsonb,null,null)$$,
 '42501','finance_permission_denied','deposit permission failure rolls back the aggregate');
reset role;
select is((select count(*) from public.contracts where local_id='must-rollback'),0::bigint,'failed deposit leaves no partial contract');
select is((select count(*) from public.erp_contract_commands where idempotency_key='secretary-deposit-command'),0::bigint,'failed deposit leaves no accepted command receipt');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.create_contract_with_deposit(
 '24000000-0000-4000-8000-000000000001','missing-bank-command',
 '{"localId":"missing-bank","eventDate":"1477/06/03","eventStartsAt":"2099-08-25T05:00:00Z","eventEndsAt":"2099-08-25T10:00:00Z","groom":"E","bride":"F","total":50000}'::jsonb,
 '{"amount":10000}'::jsonb,null,null)$$,
 '22023','deposit_bank_required','deposit without bank is rejected inside the transaction');
reset role;
select is((select count(*) from public.contracts where local_id='missing-bank'),0::bigint,'invalid deposit leaves no partial contract');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000001',true);
select throws_ok($$insert into public.contracts(studio_id,local_id,contract_num,status,total,payload)
 values('24000000-0000-4000-8000-000000000001','browser-write','BROWSER-1','active',1,'{}')$$,
 '42501',null,'direct browser contract creation stays revoked');

select * from finish();
rollback;
