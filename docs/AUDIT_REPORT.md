# Studio M — Comprehensive Engineering Audit Report

**Date:** 2026-07-21  
**Branch:** `cursor/saas-p0-authority-66da`  
**Version:** 6.0.0  
**Product target:** Public multi-tenant B2B SaaS for studios  
**Overall (SaaS frame): 68 / 100** · Single-studio nostalgia: ~83 / 100

---

## 1. Executive Summary

Studio M is **no longer scored as a single-studio offline ERP**. The public product requires server authority for money, tenant isolation, and Pro-only production UX.

**SaaS P0 landed:**

1. `mutateRequiredWhenOnline` — FinanceSync awaits Edge before local money commit; fail-closed online/offline-without-session
2. Migration `008_studio_ledger_entries` + hardened `studio-mutate` (`roles[]`, tenant spoof guard, ledger write)
3. Classic removed from public operator paths (SignedProof break-glass only)
4. Gated Playwright finance auth (`E2E_LOGIN_*`) + ADR for deferred outbox
5. Honest SaaS rescore — **no vanity inflation**

### Hard-stop honesty

| Dimension | 10/10? | Why |
|-----------|--------|-----|
| Security | **No** (~7.8) | Offline money blocked not queued; local session still client-side |
| Scalability | **No** (~5.8) | Thin ledger; multi-tenant load unproven |
| Billing / onboarding polish | **No** | Out of P0 scope |

---

## 2. Scores (SaaS frame)

| Metric | Score |
|--------|------:|
| **Overall (SaaS)** | **68** |
| Production readiness (public SaaS) | 62 |
| Single-studio optional-cloud (legacy) | 83 |

See [`QUALITY_SCORES.md`](./QUALITY_SCORES.md) for category table.

---

## 3. Round log

| Round | Resolved |
|-------|----------|
| Finance cheque / integrity | FinanceSync sole writer, cheque pagination, bank metadata |
| Mutate client wiring | Cloud.client + resolvedConfig |
| **SaaS P0** | mutateRequired, ledger 008, classic public retire, finance e2e gate |

---

## 4. Residual risks

- Offline finance outbox not implemented ([ADR](./ADR_OFFLINE_FINANCE_OUTBOX.md))
- Ledger is accept-log, not double-entry balances on server
- Money LWW conflict policy across devices still incomplete
- Billing / plans / abuse quotas not started
- Classic HTML still in repo (quarantined) with weaker CSP

---

## 5. Ordered follow-ups

1. **P1** Finance outbox + flush  
2. **P1** RLS isolation proof tests + onboarding harden  
3. **P1** Server conflict / sequential ledger versions  
4. **P2** Billing + quotas + monitoring alerts  
5. **P2** Retire classic assets from production builds entirely  
