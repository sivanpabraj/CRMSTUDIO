begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(30);

insert into auth.users (instance_id,id,aud,role,email,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','12000000-0000-4000-8000-000000000001',
  'authenticated','authenticated','manager-v3@test.invalid',now(),now()),
 ('00000000-0000-0000-0000-000000000000','12000000-0000-4000-8000-000000000002',
  'authenticated','authenticated','secretary-v3@test.invalid',now(),now());
insert into public.studios (id,name,slug) values
 ('22000000-0000-4000-8000-000000000001','Authority V3 A','authority-v3-a'),
 ('22000000-0000-4000-8000-000000000002','Authority V3 B','authority-v3-b');
insert into public.studio_members
 (studio_id,user_id,display_name,roles,status,valid_from,valid_until,revoked_at) values
 ('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
  'Manager V3',array['studio_manager'],'active',now()-interval '1 day',null,null),
 ('22000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001',
  'Manager V3',array['studio_manager'],'active',now()-interval '1 day',null,null),
 ('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002',
  'Secretary V3',array['office_secretary'],'active',now()-interval '1 day',null,null);
insert into public.contracts
 (id,studio_id,local_id,contract_num,groom,status,total,payload) values
 ('32000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001',
  'authority-contract','AUTH-1','Before','active',100000,
  '{"deposit":10000,"note":"before"}'::jsonb);

-- Historical generic rows are deliberately retained for reconciliation, but
-- the restrictive policy must hide the server-authoritative types.
insert into public.studio_entities
 (studio_id,entity_type,local_id,payload,revision,updated_seq,updated_by) values
 ('22000000-0000-4000-8000-000000000001','transactions','legacy-finance-v3',
  '{"id":"legacy-finance-v3","amount":999}'::jsonb,1,1,'12000000-0000-4000-8000-000000000001'),
 ('22000000-0000-4000-8000-000000000001','contracts','legacy-contract-v3',
  '{"id":"legacy-contract-v3"}'::jsonb,1,2,'12000000-0000-4000-8000-000000000001'),
 ('22000000-0000-4000-8000-000000000001','equipment','camera-v3',
  '{"id":"camera-v3"}'::jsonb,1,3,'12000000-0000-4000-8000-000000000001');

select is((select count(*) from public.studio_backup_archives where payload is not null),0::bigint,
  'migration leaves zero plaintext backup archives');
select ok(exists (
  select 1 from pg_catalog.pg_constraint
  where conrelid='public.studio_backup_archives'::regclass
    and conname='studio_backup_archive_payload_retired' and contype='c'
), 'backup table permanently requires a NULL plaintext payload');
select ok(exists (
  select 1 from pg_catalog.pg_constraint
  where conrelid='public.studio_backup_archives'::regclass
    and conname='studio_backup_archive_encrypted_envelope_required' and contype='c'
), 'backup table requires an authenticated-encryption envelope');
select ok(not has_table_privilege('authenticated','public.studio_backup_archives','SELECT'),
  'authenticated browser cannot directly enumerate backup archives');
select ok(not has_table_privilege('service_role','public.studio_backup_archives','SELECT'),
  'service role cannot bypass the audited backup RPC with direct SELECT');
select ok(to_regprocedure('public.create_studio_backup(uuid,jsonb,text,text,integer,text)') is null,
  'plaintext backup RPC no longer exists');
select ok(not has_function_privilege('authenticated',
  'public.store_encrypted_studio_backup(uuid,uuid,text,text,text,bigint,jsonb)','EXECUTE'),
  'browser cannot call encrypted backup storage RPC');
select ok(has_function_privilege('service_role',
  'public.store_encrypted_studio_backup(uuid,uuid,text,text,text,bigint,jsonb)','EXECUTE'),
  'service Edge role can store an encrypted envelope');
select ok(has_function_privilege('service_role',
  'public.read_encrypted_studio_backup(uuid,uuid)','EXECUTE'),
  'service Edge role can read one authorized encrypted envelope');
select ok(not has_function_privilege('authenticated',
  'public.list_encrypted_studio_backups(uuid,uuid,integer)','EXECUTE'),
  'browser cannot call the backup metadata listing RPC');
select ok(has_function_privilege('service_role',
  'public.list_encrypted_studio_backups(uuid,uuid,integer)','EXECUTE'),
  'service Edge role can call the authorized backup metadata listing RPC');
select throws_ok($$
  insert into public.studio_backup_archives
    (studio_id,payload,encrypted_payload,encryption_nonce,manifest,checksum,source,
     size_bytes,db_version,app_version,created_by)
  values
    ('22000000-0000-4000-8000-000000000001','{}'::jsonb,
     'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4','YWJjZGVmZ2hpamts',
     '{"format":"crmstudio-aes-gcm-v1","algorithm":"AES-256-GCM"}'::jsonb,
     repeat('a',64),'edge-aead',128,24,'1.0.1','12000000-0000-4000-8000-000000000001')
$$,'23514',null,'even the database owner cannot insert plaintext backup payload');

select public.store_encrypted_studio_backup(
  '22000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4',
  'YWJjZGVmZ2hpamts',
  repeat('b',64),128,
  '{"format":"crmstudio-aes-gcm-v1","algorithm":"AES-256-GCM","schemaVersion":24,"keyVersion":1,"appVersion":"1.0.1"}'::jsonb
);
select is(jsonb_array_length(public.list_encrypted_studio_backups(
  '22000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',20
)),1,'authorized manager receives encrypted backup metadata');
select ok(public.list_encrypted_studio_backups(
  '22000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',20
)::text !~ 'encrypted_payload|ciphertext|encryption_nonce|"nonce"',
  'backup listing never returns ciphertext or nonce');
select throws_ok($$
  select public.list_encrypted_studio_backups(
    '22000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000002',20)
$$,'42501','backup_permission_denied',
  'actor without backup-manager role cannot list tenant archives');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',true);
select throws_ok($$
  update public.contracts
  set studio_id='22000000-0000-4000-8000-000000000002'
  where id='32000000-0000-4000-8000-000000000001'
$$,'23514','contract_studio_immutable',
  'manager belonging to both tenants cannot transfer contract ownership');

select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000002',true);
select lives_ok($$
  update public.contracts set groom='Non-financial edit'
  where id='32000000-0000-4000-8000-000000000001'
$$,'crm.write can still update non-financial contract fields');
select throws_ok($$
  update public.contracts set total=200000
  where id='32000000-0000-4000-8000-000000000001'
$$,'42501','contract_finance_write_denied',
  'crm.write without finance.write cannot alter contract total');
select throws_ok($$
  update public.contracts set payload=jsonb_set(payload,'{deposit}','20000'::jsonb)
  where id='32000000-0000-4000-8000-000000000001'
$$,'42501','contract_finance_write_denied',
  'crm.write without finance.write cannot alter embedded deposit projection');

select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',true);
select lives_ok($$
  update public.contracts set total=200000
  where id='32000000-0000-4000-8000-000000000001'
$$,'manager with finance.write retains compatible financial maintenance access');
select throws_ok($$
  select public.apply_studio_entity_commands(
    '22000000-0000-4000-8000-000000000001','contracts',
    '[{"local_id":"c-v3","idempotency_key":"authority-contract-v3","op":"upsert","expected_revision":0,"payload":{"id":"c-v3"}}]'::jsonb)
$$,'42501','sync_server_authoritative_entity',
  'generic writer rejects contract aggregates even for a manager');
select throws_ok($$
  select public.apply_studio_entity_commands(
    '22000000-0000-4000-8000-000000000001','transactions',
    '[{"local_id":"tx-v3","idempotency_key":"authority-finance-v3","op":"upsert","expected_revision":0,"payload":{"amount":1}}]'::jsonb)
$$,'42501','sync_server_authoritative_entity',
  'generic writer rejects finance aggregates even for a manager');
select throws_ok($$
  select * from public.pull_studio_entity_deltas(
    '22000000-0000-4000-8000-000000000001','salaryPayments',0,
    '00000000-0000-0000-0000-000000000000',200)
$$,'42501','sync_server_authoritative_entity',
  'generic reader rejects payroll aggregates');

reset role;
select ok(not has_function_privilege('authenticated',
  'public.apply_studio_entity_commands_non_authoritative_internal(uuid,text,jsonb)','EXECUTE'),
  'authenticated cannot bypass the generic writer wrapper');
select ok(not has_function_privilege('authenticated',
  'public.pull_studio_entity_deltas_non_authoritative_internal(uuid,text,bigint,uuid,integer)','EXECUTE'),
  'authenticated cannot bypass the generic reader wrapper');
select ok(has_function_privilege('authenticated',
  'public.apply_studio_entity_commands(uuid,text,jsonb)','EXECUTE'),
  'authenticated retains the guarded non-authoritative writer');
select ok(has_function_privilege('authenticated',
  'public.pull_studio_entity_deltas(uuid,text,bigint,uuid,integer)','EXECUTE'),
  'authenticated retains the guarded non-authoritative reader');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.studio_entities where entity_type='transactions'),0::bigint,
  'Data API policy hides legacy finance rows');
select is((select count(*) from public.studio_entities where entity_type='contracts'),0::bigint,
  'Data API policy hides legacy contract rows');
select is((select count(*) from public.studio_entities where entity_type='equipment'),1::bigint,
  'Data API policy preserves authorized non-authoritative rows');

select * from finish();
rollback;
