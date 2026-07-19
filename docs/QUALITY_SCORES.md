# Quality score ceilings — Studio M

Honest production scoring for the current architecture
(vanilla JS · IndexedDB system-of-record · optional Supabase sync).

## Why not every dimension can be 10/10

| Dimension | Realistic ceiling | Why |
|-----------|------------------:|-----|
| Security | ~7–8 | Auth/RBAC/HMAC live in the browser. True 10 needs server sessions + server authorization on every mutation. |
| Scalability | ~6 | Single-studio document DB. True 10 needs multi-tenant server ledger + horizontal scale. |
| Architecture (SaaS) | ~7.5 | Offline-first monolith is intentional; not a clean multi-tenant service boundary. |
| Performance (huge datasets) | ~7.5 | Full-collection in-memory + `innerHTML` re-render; needs virtualization + store sharding for 10. |
| Reliability (strong consistency) | ~8 | Client LWW sync is studio-grade, not linearizable multi-writer accounting. |

## Dimensions that can approach 9–10 with incremental work

Design · Maintainability · Readability · Testability · UI/UX · Code Quality · single-studio Reliability.

## Current target after this hardening track

Raise every *reachable* dimension toward its ceiling; never claim 10 where the architecture forbids it.

### Snapshot after module split + persist coalesce (honest)

| Dimension | Score | Notes |
|-----------|------:|-------|
| Architecture | 7 | Pro shell split; classic admin quarantined |
| Design | 7.5 | Estedad + gold brand atmosphere |
| Maintainability | 7 | `modules.js` split into 6 files |
| Readability | 7 | Smaller modules; delegation path started |
| Security | 6.5 | Client-authoritative ceiling ~7–8 |
| Performance | 6.5 | Coalesced SecureDB→IDB writes |
| Reliability | 7.5 | Soft-delete + finance rollback paths |
| Scalability | 4.5 | Single-studio document DB |
| Testability | 7 | 74+ unit tests on pure + lib paths |
| UI/UX | 7 | Brand-aligned shell |
| Code Quality | 7 | Lint clean; less monolith |

See `docs/SECURITY.md` and `docs/ARCHITECTURE.md` for remaining limits.
