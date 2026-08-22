begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(54);

insert into auth.users (instance_id,id,aud,role,email,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000001','authenticated','authenticated','manager-v2@test.invalid',now(),now()),
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000002','authenticated','authenticated','photographer-v2@test.invalid',now(),now()),
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000003','authenticated','authenticated','expired-v2@test.invalid',now(),now()),
 ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000004','authenticated','authenticated','revoked-v2@test.invalid',now(),now());
insert into public.studios (id,name,join_code) values
 ('21000000-0000-4000-8000-000000000001','Security V2','SEC-V2'),
 ('21000000-0000-4000-8000-000000000002','Expired V2','EXP-V2'),
 ('21000000-0000-4000-8000-000000000003','Revoked V2','REV-V2');
insert into public.studio_members
 (studio_id,user_id,display_name,roles,status,valid_from,valid_until,revoked_at) values
 ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Manager',array['studio_manager'],'active',now()-interval '1 day',null,null),
 ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','Photo',array['photographer'],'active',now()-interval '1 day',null,null),
 ('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000003','Expired',array['studio_manager'],'active',now()-interval '2 days',now()-interval '1 day',null),
 ('21000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000004','Revoked',array['studio_manager'],'active',now()-interval '2 days',null,now()-interval '1 day');
insert into public.contracts (id,studio_id,local_id,contract_num,status,payload) values
 ('31000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','contract-security-1','SEC-1','active','{}');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.register_studio('Bypass','09120000003','Expired',null)$$,
  'P0001','membership_not_active','expired membership cannot create a replacement tenant');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000004',true);
select throws_ok($$select public.register_studio('Bypass','09120000004','Revoked',null)$$,
  'P0001','membership_not_active','revoked membership cannot create a replacement tenant');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);

select lives_ok($$
  select public.apply_studio_entity_commands(
    '21000000-0000-4000-8000-000000000001','bookings',
    '[{"local_id":"booking-1","idempotency_key":"sync-create-0001","op":"upsert","expected_revision":0,"payload":{"id":"booking-1","title":"اول"}}]'::jsonb)
$$,'manager creates a sequenced entity');
select is((select count(*) from public.studio_entities where local_id='booking-1'),1::bigint,
  'first command creates exactly one row');
select is((public.apply_studio_entity_commands(
  '21000000-0000-4000-8000-000000000001','bookings',
  '[{"local_id":"booking-1","idempotency_key":"sync-create-0001","op":"upsert","expected_revision":0,"payload":{"id":"booking-1","title":"اول"}}]'::jsonb
)->'results'->0->>'deduped')::boolean,true,'retry is deduplicated');
select throws_ok($$
  select public.apply_studio_entity_commands(
    '21000000-0000-4000-8000-000000000001','bookings',
    '[{"local_id":"booking-1","idempotency_key":"sync-stale-00001","op":"upsert","expected_revision":0,"payload":{"id":"booking-1"}}]'::jsonb)
$$,'40001','sync_revision_conflict','stale concurrent edit is rejected');
select lives_ok($$
  select public.apply_studio_entity_commands(
    '21000000-0000-4000-8000-000000000001','bookings',
    '[{"local_id":"booking-1","idempotency_key":"sync-update-0001","op":"upsert","expected_revision":1,"payload":{"id":"booking-1","title":"دوم"}}]'::jsonb)
$$,'matching revision updates');
select lives_ok($$
  select public.apply_studio_entity_commands(
    '21000000-0000-4000-8000-000000000001','bookings',
    '[{"local_id":"booking-1","idempotency_key":"sync-delete-0001","op":"delete","expected_revision":2}]'::jsonb)
$$,'delete creates a tombstone');
select ok((select deleted_at is not null and payload->>'_deleted'='true'
  from public.studio_entities where local_id='booking-1'),'tombstone is durable');
select is((select updated_seq from public.studio_entities where local_id='booking-1'),3::bigint,
  'server sequence advances independent of client clock');
select is((select count(*) from public.pull_studio_entity_deltas(
  '21000000-0000-4000-8000-000000000001','bookings',0,
  '00000000-0000-0000-0000-000000000000',200)),1::bigint,
  'fresh device receives the latest tombstone');
select throws_ok($$update public.studio_entities set payload='{}' where local_id='booking-1'$$,
  '42501',null,'direct Data API mutation is denied');

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select throws_ok($$
  select public.apply_studio_entity_commands(
    '21000000-0000-4000-8000-000000000001','transactions',
    '[{"local_id":"tx-1","idempotency_key":"sync-finance-001","op":"upsert","expected_revision":0,"payload":{"amount":1}}]'::jsonb)
$$,'42501','sync_permission_denied','photographer cannot sync finance payloads');
select throws_ok($$
  select public.apply_studio_entity_commands(
    '21000000-0000-4000-8000-000000000001','equipment',
    '[{"local_id":"camera-1","idempotency_key":"sync-camera-001","op":"upsert","expected_revision":0,"payload":{"id":"camera-1"}}]'::jsonb)
$$,'42501','sync_permission_denied','read-only operational role cannot write equipment payloads');
select throws_ok($$
  select * from public.pull_studio_entity_deltas(
    '21000000-0000-4000-8000-000000000001','transactions',0,
    '00000000-0000-0000-0000-000000000000',200)
$$,'42501','sync_permission_denied','photographer cannot pull finance payloads');
select throws_ok($$
  select * from public.pull_studio_entity_deltas(
    '21000000-0000-4000-8000-000000000001','salaryPayments',0,
    '00000000-0000-0000-0000-000000000000',200)
$$,'42501','sync_permission_denied','photographer cannot pull payroll payloads');
select throws_ok($$
  select public.reserve_sms_dispatch('21000000-0000-4000-8000-000000000001','generic',1,'sms-photo-0001')
$$,'42501','sms_permission_denied','photographer cannot send generic SMS');
select lives_ok($$select * from public.erp_finance_actual_monthly$$,
  'RLS-aware actual finance report is queryable by an authenticated member');
select lives_ok($$select * from public.erp_finance_forecast_monthly$$,
  'RLS-aware forecast report is queryable by an authenticated member');
select lives_ok($$select * from public.erp_finance_actual_vs_forecast$$,
  'RLS-aware actual-versus-forecast report is queryable by an authenticated member');
select lives_ok($$
  select * from public.pull_studio_entity_deltas(
    '21000000-0000-4000-8000-000000000001','equipment',0,
    '00000000-0000-0000-0000-000000000000',200)
$$,'photographer can pull non-sensitive operational payloads');

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.claim_customer_contracts()$$,
  '22023','verified_phone_required','customer portal claim requires a server-verified phone');
select throws_ok($$
  insert into public.customer_portal_messages
    (studio_id,contract_id,contract_local_id,request_key,sender_id,sender_kind,body)
  values
    ('21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000099',
     'missing','portal-contract-mismatch','11000000-0000-4000-8000-000000000001','manager','x')
$$,'23514','customer_message_contract_studio_mismatch',
  'portal message cannot reference a contract outside the same studio');
select throws_ok($$
  insert into public.customer_portal_messages
    (studio_id,contract_id,contract_local_id,request_key,sender_id,sender_kind,body,attachment_path)
  values
    ('21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',
     'contract-security-1','portal-path-mismatch','11000000-0000-4000-8000-000000000001','manager','x',
     '21000000-0000-4000-8000-000000000001/customer/wrong-contract/file.jpg')
$$,'23514','customer_attachment_path_mismatch',
  'portal attachment path is bound to its exact contract');
select lives_ok($$
  select public.reserve_sms_dispatch('21000000-0000-4000-8000-000000000001','portal_invite',1,'sms-manager-001')
$$,'manager can reserve invitation SMS');
select throws_ok($$
  select public.reserve_sms_dispatch('21000000-0000-4000-8000-000000000001','otp_login',1,'sms-fake-otp01')
$$,'22023','sms_purpose_not_allowed','application endpoint cannot impersonate Auth OTP');
select is((public.reserve_sms_dispatch(
  '21000000-0000-4000-8000-000000000001','portal_invite',1,'sms-manager-001'
)->>'deduped')::boolean,true,'SMS retry is deduplicated');

select lives_ok($$
  select public.post_finance_command(
    '21000000-0000-4000-8000-000000000001','record_deposit','finance-version-0001',
    '{"transactionId":"finance-logical-1","bankId":"bank-1","amount":100,"purposeCategory":"other","_expectedLedgerVersion":0}'::jsonb)
$$,'finance command accepts the matching authoritative ledger version');
select is((public.post_finance_command(
  '21000000-0000-4000-8000-000000000001','record_deposit','finance-version-0001',
  '{"transactionId":"finance-logical-1","bankId":"bank-1","amount":100,"purposeCategory":"other","_expectedLedgerVersion":0}'::jsonb
)->>'deduped')::boolean,true,'accepted finance retry deduplicates before stale-version validation');
select throws_ok($$
  select public.post_finance_command(
    '21000000-0000-4000-8000-000000000001','record_deposit','finance-version-0002',
    '{"transactionId":"finance-logical-2","bankId":"bank-1","amount":100,"purposeCategory":"other","_expectedLedgerVersion":0}'::jsonb)
$$,'40001',null,'new finance command with stale ledger version is rejected');
select throws_ok($$
  select public.post_finance_command(
    '21000000-0000-4000-8000-000000000001','record_deposit','finance-version-0003',
    '{"transactionId":"finance-logical-3","bankId":"bank-1","amount":100,"purposeCategory":"other"}'::jsonb)
$$,'22023','expected_ledger_version_required','new finance command cannot omit optimistic ledger version');

create temporary table invitation_probe (token text, request_id uuid);
insert into invitation_probe(token)
select public.create_studio_invitation(
  '21000000-0000-4000-8000-000000000001',array['office_secretary'],60,1);
select ok((select length(token) >= 32 from invitation_probe),
  'manager receives a high-entropy invitation token while only its digest is stored');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select lives_ok($$
  update invitation_probe
  set request_id=public.request_studio_join(token,'Invited User','09120000000')
$$,'valid invitation creates a join request');
select is((select r.status from public.studio_join_requests r
  join invitation_probe p on p.request_id=r.id),'pending','join request starts pending');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select lives_ok($$
  select public.review_studio_join((select request_id from invitation_probe),true)
$$,'manager can explicitly approve the pending join request');
select is((select r.status from public.studio_join_requests r
  join invitation_probe p on p.request_id=r.id),'approved','review records approved lifecycle state');
select is((select roles from public.studio_members
  where studio_id='21000000-0000-4000-8000-000000000001'
    and user_id='11000000-0000-4000-8000-000000000002'),
  array['office_secretary']::text[],'approved invitation applies only the requested non-privileged role');

reset role;
select ok(not has_table_privilege('anon','public.customer_portal_messages','SELECT'),
  'anonymous role cannot read customer portal messages');
select ok(not has_table_privilege('authenticated','public.customer_portal_messages','UPDATE'),
  'portal messages are append-only for authenticated users');
select ok(not has_table_privilege('anon','public.erp_finance_actual_monthly','SELECT'),
  'anonymous role cannot read finance actual reports');
select ok(not has_table_privilege('authenticated','public.studio_members','INSERT'),
  'authenticated users cannot directly enroll themselves as studio members');
select ok(has_function_privilege('authenticated',
  'public.request_studio_join(text,text,text)','EXECUTE'),
  'authenticated users must use the reviewed join-request lifecycle');
select ok(not has_function_privilege('anon',
  'public.register_studio(text,text,text,text)','EXECUTE'),
  'anonymous users cannot call tenant registration');
select ok(has_function_privilege('authenticated',
  'public.register_studio(text,text,text,text)','EXECUTE'),
  'authenticated users can call guarded tenant registration');

create temporary table unsupported_erp_trigger_probe (id integer);
create trigger unsupported_erp_probe before insert on unsupported_erp_trigger_probe
for each row execute function public.enforce_erp_tenant_links();
select throws_ok($$insert into unsupported_erp_trigger_probe values (1)$$,
  '55000',null,'ERP tenant trigger fails closed on an unsupported table');

create temporary table unsupported_contract_trigger_probe (id integer);
create trigger unsupported_contract_probe before insert on unsupported_contract_trigger_probe
for each row execute function public.enforce_contract_child_tenant();
select throws_ok($$insert into unsupported_contract_trigger_probe values (1)$$,
  '55000',null,'contract-child tenant trigger fails closed on an unsupported table');

select ok(not has_function_privilege('authenticated',
  'public.store_encrypted_studio_backup(uuid,uuid,text,text,text,bigint,jsonb)','EXECUTE'),
  'browser role cannot store arbitrary backup ciphertext');
select ok(has_function_privilege('service_role',
  'public.store_encrypted_studio_backup(uuid,uuid,text,text,text,bigint,jsonb)','EXECUTE'),
  'only service role has encrypted backup storage capability');
select ok(not has_function_privilege('authenticated',
  'public.create_studio_backup(uuid,jsonb,text,text,integer,text)','EXECUTE'),
  'plaintext backup RPC is retired');

select ok(not has_table_privilege('service_role','public.finance_journal_lines','INSERT'),
  'service role cannot bypass the finance command boundary with direct journal inserts');
select ok(not has_table_privilege('service_role','public.studio_backup_archives','SELECT'),
  'service role cannot enumerate encrypted backup archives directly');

-- The database owner deliberately attempts the strongest possible direct
-- tamper. Passing proves the deferred accounting invariant survives RLS bypass;
-- service_role is separately proven to lack direct table privileges above.
create function pg_temp.attempt_unbalanced_journal() returns void
language plpgsql as $$
begin
  insert into public.finance_journal_lines
    (studio_id,transaction_id,account_ref,debit_irr,credit_irr)
  select studio_id,id,'asset:bank:tamper',1,0
  from public.finance_transactions
  where studio_id='21000000-0000-4000-8000-000000000001'
  limit 1;
  set constraints all immediate;
end;
$$;
select throws_ok($$select pg_temp.attempt_unbalanced_journal()$$,
  '23514','finance_journal_unbalanced','deferred journal invariant rejects an unbalanced tamper at commit boundary');

set local role service_role;
select lives_ok($$
  select public.store_encrypted_studio_backup(
    '21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
    'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4','YWJjZGVmZ2hpamts',
    repeat('a',64),128,
    '{"format":"crmstudio-aes-gcm-v1","algorithm":"AES-256-GCM","schemaVersion":23,"keyVersion":1,"appVersion":"1.0.1","aad":"test"}'::jsonb)
$$,'service stores an encrypted envelope for an active manager');
reset role;
select is((select count(*) from public.studio_backup_archives
  where encrypted_payload is not null and payload is null),1::bigint,
  'database stores ciphertext and no plaintext payload');

select * from finish();
rollback;
