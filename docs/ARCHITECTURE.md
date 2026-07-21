# Studio M — Architecture

## Overview

Studio M is an offline-first PWA (Vanilla JS + IndexedDB) with optional Supabase cloud sync.

Pro shell modules live under `studio-m/js/` (registry in `modules.js`, split feature files
`modules-*.js`, plus dedicated `accounting.js` / `payroll.js` / `settings.js`).

```
┌─────────────────────────────────────────────────────────────┐
│ Presentation                                                │
│  studio-m/ (Pro ERP) · index.html · admin.html (legacy)     │
│  customer.html · contract.html · site.html                    │
├─────────────────────────────────────────────────────────────┤
│ Application                                                 │
│  Auth · UnifiedLogin · PortalInvite · Access · SecureDB     │
│  Cloud · SyncEngine · RealtimeSync · FinanceSync            │
├─────────────────────────────────────────────────────────────┤
│ Data                                                        │
│  IndexedDB (talar_studio_v5) — 44 logical collections     │
│  Supabase PostgreSQL — tenants, entities, snapshots         │
└─────────────────────────────────────────────────────────────┘
```

## Sync model (Phase 2–3)

1. **Entity sync** (primary, ~2.5s) — 15 entity types → `studio_entities`
2. **Snapshot** (fallback, 60s) — sanitized JSON → `studio_snapshots`
3. **Realtime** — postgres changes → pull entities

### Snapshot security

Before cloud push, `js/lib/snapshot-sanitize.js` removes:

- Password hashes, salts
- SMS credentials (`smsApiKey`, `smsUsername`) and license keys
- Supabase URL / anon / service keys from `studioInfo`
- `securityState`, `apiKeys` collections
- Portal OTP codes/hashes (keeps verification metadata only)

After pull, local secrets are merged back from the device.

Local file backups (`DB.exportJSON`) intentionally retain secrets so offline restore works; restore in Studio M requires manager re-authentication.

## Finance write contract

**All bank balance and contract `paid` mutations must go through `FinanceSync`:**

| API | Use |
|-----|-----|
| `recordDeposit` | Customer deposits / payments (atomic + rollback) |
| `recordWithdrawal` | Expenses, payroll, outbound (atomic + rollback) |
| `updateTransaction` | Edit existing non-transfer txs (bank queue + snapshot rollback) |
| `deleteTransaction` | Soft-delete + reverse bank/paid (atomic + rollback); used by accounting, invoices, expenses, cheque revert |
| `transferBetweenBanks` | Inter-account transfers |
| `applyBankDelta` | Only inside FinanceSync / ChequeManager with compensating rollback |
| `applyContractPaid` / `reverseContractPaid` | Installments only (`contract_payment`) |

Pro UI entry points: accounting, invoices, expenses, payroll, cheques.  
Classic photo-house deposits also call `recordDeposit` (admin.html loads `finance-sync.js`).  
Transfers are not edited/deleted via the single-tx form.  
Bank **metadata** edits must not overwrite `balance` (ledger-owned); opening balance only on create.

### Optional online audit path

When `studioInfo.mutateEnabled` or `window.__SM_MUTATE_ENABLED` is set, FinanceSync fire-and-forgets ops to Edge Function `studio-mutate` (`js/lib/studio-mutate-client.js`). Local IDB remains SoR until server ledger is authoritative.

## Authentication

| Layer | Mechanism |
|-------|-----------|
| Local | PBKDF2 + HMAC-signed session + CSRF |
| Cloud | Supabase Auth (separate password via AuthBridge) |
| OTP | Unified SMS login + separate portal invite code |
| Customer | CustomerSession (contract-bound) |

## Multi-tenancy (Supabase)

- `studios` — tenant
- `studio_members` — user ↔ studio + roles
- RLS via `user_studio_ids()`
- Migration 005: snapshot SELECT limited to `studio_manager`

## Module map

| Path | Role |
|------|------|
| `js/db.js` | IndexedDB blob + migrations |
| `js/secure-db.js` | CSRF write gate |
| `js/cloud.js` | Supabase client + sync orchestration |
| `js/sync/*` | Entity engine, conflict, realtime |
| `studio-m/js/core.js` | Pro shell routing |
| `studio-m/js/modules.js` | Feature modules registry |

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md).

## Migrations

Apply in order: `001` → `006` in Supabase SQL Editor (includes manager RLS on contracts).
