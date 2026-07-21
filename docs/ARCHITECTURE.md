# Studio M — Architecture

## Overview

Studio M is pivoting toward a **public multi-tenant B2B SaaS** for studios.

- **Pro shell** (`studio-m/`) is the only public production UI.
- **IndexedDB** is a local cache (+ offline non-money sync); **not** the SaaS finance ledger of record when cloud is enabled.
- **Supabase Postgres + Edge `studio-mutate`** accept finance mutations online (`studio_mutation_audit` + `studio_ledger_entries`).

```
┌─────────────────────────────────────────────────────────────┐
│ Presentation                                                │
│  studio-m/ (Pro ERP — public) · admin.html (break-glass)    │
│  customer.html · contract.html · site.html                    │
├─────────────────────────────────────────────────────────────┤
│ Application                                                 │
│  Auth · UnifiedLogin · PortalInvite · Access · SecureDB     │
│  Cloud · SyncEngine · RealtimeSync · FinanceSync            │
│  StudioMutateClient (authorize before money when required)  │
├─────────────────────────────────────────────────────────────┤
│ Data                                                        │
│  IndexedDB (talar_studio_v5) — cache / offline non-money    │
│  Supabase — tenants, entities, snapshots, finance ledger    │
└─────────────────────────────────────────────────────────────┘
```

## Finance SoR policy (SaaS)

When `mutateRequiredWhenOnline` is active (default if `cloudEnabled` + Supabase URL):

| Condition | Behavior |
|-----------|----------|
| Online + cloud session | Await Edge `studio-mutate` **before** local FinanceSync commit |
| Mutate 4xx/5xx / network fail | **Fail closed** — no local money write |
| Offline / no cloud session | **Blocked** (outbox deferred — see [ADR_OFFLINE_FINANCE_OUTBOX.md](./ADR_OFFLINE_FINANCE_OUTBOX.md)) |
| Kill-switch `mutateRequiredWhenOnline=false` | Optional post-commit audit if `mutateEnabled` |

Kill-switches: `studioInfo.mutateRequiredWhenOnline === false` or `window.__SM_MUTATE_REQUIRED = false`.

## Sync model (non-money)

1. **Entity sync** (primary, ~2.5s) — 15 entity types → `studio_entities`
2. **Snapshot** (fallback, 60s) — sanitized JSON → `studio_snapshots`
3. **Realtime** — postgres changes → pull entities

### Snapshot security

Before cloud push, `js/lib/snapshot-sanitize.js` removes password hashes, SMS credentials, license keys, Supabase secrets, `securityState` / `apiKeys`, and portal OTP secrets.

## Finance write contract

**All bank balance and contract `paid` mutations must go through `FinanceSync`:**

| API | Use |
|-----|-----|
| `recordDeposit` | Customer deposits / payments (atomic + rollback) |
| `recordWithdrawal` | Expenses, payroll, outbound (atomic + rollback) |
| `updateTransaction` | Edit existing non-transfer txs |
| `deleteTransaction` | Soft-delete + reverse bank/paid |
| `transferBetweenBanks` | Inter-account transfers |
| `applyBankDelta` | Only inside FinanceSync / ChequeManager |

Bank **metadata** edits must not overwrite `balance` (ledger-owned).

## Classic admin (not public)

- Default routes leave `admin.html` → `studio-m/`
- Break-glass: manager Settings → SignedProof `sm_classic_unlock` (2h) + `?classic=1`
- No operator deep-links from Pro portal UI
- Legacy `sm_allow_classic` only in local dev after SignedProof path

## Authentication

| Layer | Mechanism |
|-------|-----------|
| Local | PBKDF2 + HMAC-signed session + CSRF |
| Cloud | Supabase Auth (AuthBridge) |
| OTP | Unified SMS login + portal invite |
| Customer | CustomerSession (contract-bound) |

## Multi-tenancy (Supabase)

- `studios` — tenant
- `studio_members` — user ↔ studio + `roles text[]`
- RLS via `user_studio_ids()`
- Mutate rejects cross-tenant `studioId` spoofing (membership check)
- `register_studio` RPC for signup

## Module map

| Path | Role |
|------|------|
| `js/db.js` | IndexedDB blob + migrations |
| `js/secure-db.js` | CSRF write gate |
| `js/finance-sync.js` | Sole local money façade + mutate gate |
| `js/lib/studio-mutate-client.js` | Edge authorize / optional audit |
| `js/cloud.js` | Supabase client + sync |
| `studio-m/js/core.js` | Pro shell routing |

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md).

## Migrations

Apply in order: `001` → `008` (includes `007` audit + `008` ledger entries).

```bash
supabase db push
# or SQL Editor: 007_studio_mutation_audit.sql then 008_studio_ledger_entries.sql
supabase functions deploy studio-mutate
```
