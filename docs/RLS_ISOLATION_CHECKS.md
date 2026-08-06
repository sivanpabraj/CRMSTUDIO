# RLS isolation checks (manual / staging)

Run as authenticated user A while studio B is a foreign tenant.

```sql
-- 0 rows
select * from studio_snapshots where studio_id = '<studio_b>';

-- policy violation
insert into studio_mutation_audit (
  studio_id, user_id, op, idempotency_key, payload, result
) values (
  '<studio_b>', auth.uid(), 'record_deposit', 'probe', '{}'::jsonb, '{}'::jsonb
);

-- exception forbidden
select claim_ledger_version('<studio_b>'::uuid, null);

-- false
select rls_can_select_studio('<studio_b>'::uuid);
```

Predicate mirror covered by `tests/rls-isolation-policy.test.js`.
