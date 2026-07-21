# ADR: Offline finance outbox

## Status

**Accepted (implemented P1)** — `js/lib/finance-outbox.js`

## Decision

When `mutateRequiredWhenOnline` and Edge cannot be reached authoritatively
(offline / no cloud session / network / missing endpoint):

1. Allow local FinanceSync commit
2. Enqueue durable `financeOutbox` row with stable idempotency key
3. Mark transaction `mutateStatus: pending`
4. Flush on `online`, Cloud.signIn, Cloud.bootstrap, and periodic timer
5. Permanent 4xx (except 401/429) → `status: failed` (no silent drop; no auto-reverse)

Online session with server 5xx/409 ledger conflict → **fail closed** (no local commit).

## Consequences

- Local balances may briefly lead server until flush succeeds
- Failed flush requires manager reconciliation
- Ledger sequential version (`claim_ledger_version`) reduces multi-device silent LWW for money
