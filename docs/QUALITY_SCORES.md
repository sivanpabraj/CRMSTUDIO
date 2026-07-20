# Quality score ceilings — Studio M

Honest production scoring for the current architecture
(vanilla JS · IndexedDB system-of-record · optional Supabase sync).

## Why not every dimension can be 10/10

| Dimension | Realistic ceiling | Why |
|-----------|------------------:|-----|
| Security | ~7.5–8 | Auth/RBAC/HMAC live in the browser. True 10 needs server sessions + server authorization on every mutation. |
| Scalability | ~6 | Single-studio document DB. True 10 needs multi-tenant server ledger + horizontal scale. |
| Architecture (SaaS) | ~7.5 | Offline-first monolith is intentional; not a clean multi-tenant service boundary. |
| Performance (huge datasets) | ~7.5 | Full-collection in-memory; pagination helps but not virtualization. |
| Reliability (strong consistency) | ~8 | Client LWW sync is studio-grade, not linearizable multi-writer accounting. |

## Snapshot — after continuous improvement loop (honest)

| Category | Score | Notes |
|----------|------:|-------|
| Code Quality | 7.5 | Finance via FinanceSync; pure policy libs |
| Security | 7.0 | SMS secrets stripped with proxy; CSP still needs unsafe-inline for residual onclick |
| Performance | 7.0 | Coalesced IDB + ledger pagination |
| Architecture | 7.0 | Module split + documented finance contract |
| Testing | 7.5 | 80+ tests including real policy/sms/list modules |
| Documentation | 8.5 | README + ARCHITECTURE + QUALITY_SCORES aligned |
| Readability | 7.5 | Split modules; settings still large |
| **Overall** | **~7.3** | Weighted; Security ceiling prevents honest 10 |

**Cannot claim overall 10/10** without leaving browser-as-authority. Next step for true 10 Security: server sessions + mutation APIs.
