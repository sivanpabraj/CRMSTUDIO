# Studio M — Architecture

## Overview

Studio M is an offline-first PWA (Vanilla JS + IndexedDB) with optional Supabase cloud sync.

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

- Password hashes, salts, API keys, SMS keys
- `securityState`, `apiKeys` collections
- Portal OTP codes

After pull, local secrets are merged back from the device.

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

Apply in order: `001` → `005` in Supabase SQL Editor.
