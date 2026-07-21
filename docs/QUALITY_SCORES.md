# Quality score ceilings — Studio M

Honest scoring under **two frames**: legacy single-studio vs **public multi-tenant SaaS**.

Full audit: [`docs/AUDIT_REPORT.md`](./AUDIT_REPORT.md).

## Dual frame (do not mix)

| Frame | Overall | Notes |
|-------|--------:|-------|
| Single-studio / optional cloud | ~83 | Prior ceiling; IDB can be practical SoR |
| **Public SaaS (current target)** | **~68** | Server finance SoR started; tenancy/billing/outbox incomplete |

## Why SaaS is not 10/10

| Dimension | SaaS ceiling now | Why |
|-----------|-----------------:|-----|
| Security | ~78–82 | Online money gated; offline outbox missing; local session still client-side |
| Scalability | ~58–65 | Per-tenant IDB cache + thin ledger; not horizontally proven |
| Architecture | ~72–78 | Hybrid cache+Edge; full double-entry + conflict policy pending |
| Database Design | ~70–75 | `008` ledger accept-log ≠ full accounting schema |

## Latest snapshot — SaaS target (0–100)

| Category | Score |
|----------|------:|
| Architecture | 76 |
| Code Quality | 85 |
| Maintainability | 79 |
| Scalability | 58 |
| Performance | 77 |
| Security | 78 |
| UI/UX | 74 |
| Accessibility | 65 |
| Testing | 90 |
| Documentation | 90 |
| DevOps | 84 |
| Error Handling | 82 |
| Logging & Monitoring | 72 |
| API Design | 80 |
| Database Design | 72 |
| Project Structure | 80 |
| **Overall (SaaS)** | **68** |

Single-studio nostalgia score remains ~83 if cloud is off and mutate is not required — that mode is **not** the public product path.
