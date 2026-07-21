# Quality score ceilings — Studio M

Honest production scoring (vanilla JS · IndexedDB SoR · optional Supabase).

Full audit: [`docs/AUDIT_REPORT.md`](./AUDIT_REPORT.md) — **Overall 81/100**.

## Why not every dimension can be 10/10

| Dimension | Realistic ceiling | Why (unfixable without architecture change) |
|-----------|------------------:|-----------------------------------------------|
| Security | ~73–75 | Browser authority until `studio-mutate` is SoR + classic retired |
| Scalability | ~55–60 | Single-studio document DB |
| Architecture (SaaS) | ~70–75 | Offline-first monolith is intentional |

## Latest snapshot (0–100)

| Category | Score |
|----------|------:|
| Architecture | 78 |
| Code Quality | 84 |
| Maintainability | 78 |
| Scalability | 55 |
| Performance | 76 |
| Security | 73 |
| UI/UX | 74 |
| Accessibility | 65 |
| Testing | 86 |
| Documentation | 88 |
| DevOps | 82 |
| Error Handling | 79 |
| Logging & Monitoring | 66 |
| API Design | 75 |
| Database Design | 68 |
| Project Structure | 80 |
| **Overall** | **81** |
