# Quality score ceilings — Studio M

Honest production scoring (vanilla JS · IndexedDB SoR · optional Supabase).

Full audit: [`docs/AUDIT_REPORT.md`](./AUDIT_REPORT.md) — **Overall 83/100**.

## Why not every dimension can be 10/10

| Dimension | Realistic ceiling | Why |
|-----------|------------------:|-----|
| Security | ~74–76 | Browser authority until `studio-mutate` is SoR + classic retired |
| Scalability | ~55–60 | Single-studio document DB |
| Architecture (SaaS) | ~70–75 | Offline-first monolith is intentional |

## Latest snapshot (0–100)

| Category | Score |
|----------|------:|
| Architecture | 80 |
| Code Quality | 85 |
| Maintainability | 79 |
| Scalability | 55 |
| Performance | 77 |
| Security | 74 |
| UI/UX | 74 |
| Accessibility | 65 |
| Testing | 88 |
| Documentation | 88 |
| DevOps | 82 |
| Error Handling | 80 |
| Logging & Monitoring | 70 |
| API Design | 77 |
| Database Design | 68 |
| Project Structure | 80 |
| **Overall** | **83** |
