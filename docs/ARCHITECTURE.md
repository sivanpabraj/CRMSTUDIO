# Studio M — Architecture

## Overview

Studio M is a **public multi-tenant B2B SaaS** foundation for studios.

- **Pro shell** (`studio-m/`) is the only public production UI.
- **IndexedDB** is local cache + offline finance outbox; **Postgres/Edge** is finance SoR when cloud is enabled.
- Classic `admin.html` is **excluded from public production builds** (redirect stub); break-glass only with `VITE_ALLOW_CLASSIC=1` + SignedProof.

```
┌─────────────────────────────────────────────────────────────┐
│ Presentation: studio-m/ (public) · admin stub → Pro         │
├─────────────────────────────────────────────────────────────┤
│ FinanceSync → StudioMutateClient → Edge studio-mutate       │
│            ↘ FinanceOutbox (offline / no session)           │
├─────────────────────────────────────────────────────────────┤
│ IDB cache · financeOutbox · Supabase tenants + ledger       │
└─────────────────────────────────────────────────────────────┘
```

## Finance SoR policy

| Condition | Behavior |
|-----------|----------|
| Online + cloud session | Await Edge accept **before** local commit; bump `claim_ledger_version` |
| Ledger version conflict (409) | Fail closed — no local write |
| Offline / no session / network | Local commit + `financeOutbox` queue; flush on reconnect |
| Server 5xx while session online | Fail closed |
| `mutateRequiredWhenOnline=false` | Optional post-commit audit if `mutateEnabled` |

## Tenancy

- `register_studio`: join by `join_code` **or** create studio; re-signup reuses existing membership (no duplicate tenant)
- Mutate rejects foreign `studioId`
- Soft plan quotas: `js/lib/plan-limits.js` (trial/starter/pro) — payment gateway still out of band

## Migrations

`001` → `009` (`008` ledger entries, `009` ledger heads + register harden).

```bash
supabase db push
supabase functions deploy studio-mutate
```

## Module map

| Path | Role |
|------|------|
| `js/finance-sync.js` | Sole local money façade |
| `js/lib/studio-mutate-client.js` | Authorize / queueable reasons |
| `js/lib/finance-outbox.js` | Offline queue + flush |
| `js/lib/plan-limits.js` | Soft SaaS quotas |
| `supabase/functions/studio-mutate` | Audit + ledger + version claim |

See also: [ADR_OFFLINE_FINANCE_OUTBOX.md](./ADR_OFFLINE_FINANCE_OUTBOX.md), [RLS_ISOLATION_CHECKS.md](./RLS_ISOLATION_CHECKS.md).
