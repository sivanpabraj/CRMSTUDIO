# ADR: Offline money outbox deferred

## Status

Accepted for P0 — **outbox not shipped**; offline money writes are **blocked** when `mutateRequiredWhenOnline`.

## Context

Public multi-tenant SaaS requires Postgres/Edge as finance SoR when online.
A durable offline outbox (local commit → sync flush with idempotency) is desirable but unsafe to rush:

- Risk of dual SoR windows (IDB ahead of ledger)
- Partial bank/contract paid updates without server accept
- Conflict policy for multi-device not finalized

## Decision

P0 ships **A+C only**:

1. Online + cloud session → await `studio-mutate` before local money commit
2. Offline / no session / mutate failure → **fail closed** (no local money write)
3. Optional audit-only mode remains when required flag is explicitly off

## Consequences

- Studios with cloud enabled cannot record money while offline until outbox lands
- UX must surface Persian error from FinanceSync / StudioMutateClient
- P1 follow-up: `finance_outbox` collection + flush on reconnect + ledger reconcile

## Follow-up checklist

- [ ] `finance_outbox` IDB collection with stable idempotency keys
- [ ] Flush worker on `online` + cloud session restore
- [ ] Server reject → surface conflict; never silent drop
- [ ] Playwright offline→online finance resume test
