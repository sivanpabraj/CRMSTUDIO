# Quality score ceilings — Studio M

Honest scoring for **public multi-tenant SaaS**.

Full audit: [`docs/AUDIT_REPORT.md`](./AUDIT_REPORT.md).

## Latest snapshot — SaaS (0–100)

| Category | Score |
|----------|------:|
| Architecture | 80 |
| Code Quality | 85 |
| Maintainability | 80 |
| Scalability | 62 |
| Performance | 77 |
| Security | 82 |
| UI/UX | 74 |
| Accessibility | 65 |
| Testing | 92 |
| Documentation | 91 |
| DevOps | 85 |
| Error Handling | 84 |
| Logging & Monitoring | 74 |
| API Design | 82 |
| Database Design | 76 |
| Project Structure | 81 |
| **Overall (SaaS)** | **74** |

## Still not 10/10

| Gap | Why |
|-----|-----|
| Security ~82 | Local session still client-HMAC; outbox can lead server briefly |
| Scalability ~62 | Thin ledger; load unproven at multi-tenant scale |
| Billing | Soft quotas only — no payment provider |
| Double-entry | Accept-log + version head, not full server balances |
