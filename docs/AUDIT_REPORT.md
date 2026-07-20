# Studio M — Comprehensive Engineering Audit Report

**Date:** 2026-07-20  
**Branch:** `cursor/finance-cheque-p0-66da`  
**Version:** 6.0.0  
**Overall Score: 77 / 100** (was 76; purged remaining dual finance writers + allowlist regression test)

---

## 1. Executive Summary

Studio M is a production-credible **offline-first single-studio ERP/CRM**. Finance mutations (Pro + classic photo-house + classic finance modal) route through **FinanceSync** only — enforced by an allowlist regression test. Session handling **fail-closes** on unsigned production sessions; Playwright smoke runs in CI; **92 unit tests**.

Suitable for a **trusted single studio**. Not multi-tenant SaaS. Honest ceilings: Security ~70–75, Scalability ~55–60 while browser IDB is system of record.

---

## 2. Overall Project Score

| Metric | Score |
|--------|------:|
| **Overall** | **77 / 100** |
| Production readiness (single studio) | 83 |
| SaaS / multi-tenant readiness | 42 |

---

## 3. Category Scores

| Category | Score | Risk | Priority | Strengths | Weaknesses |
|----------|------:|------|----------|-----------|------------|
| Architecture | 74 | Med | P1 | FinanceSync sole `insert(transactions)` (allowlist CI) | Global scripts; classic surface still exists |
| Code Quality | 79 | Med | P1 | Lint clean; legacy cheque/admin writers removed | Megafiles remain |
| Maintainability | 74 | Med | P1 | Clear finance contract in ARCHITECTURE | settings/accounting size |
| Scalability | 55 | High | P0 | Sync cursors; tombstones | In-memory collections; LWW money |
| Performance | 72 | Med | P2 | Coalesced IDB; ledger page | Full re-renders |
| Security | 71 | High | P0 | Unsigned prod sessions rejected sync+async; CSRF; SMS sanitize | Browser authority; CSP unsafe-inline |
| UI/UX | 73 | Low | P2 | RTL Pro; Estedad brand | Dense ERP |
| Accessibility | 60 | Med | P2 | Modal trap; route focus | No axe CI |
| Testing | 81 | Med | P1 | 92 Vitest + allowlist guard + CI Playwright | Thin authenticated finance e2e |
| Documentation | 86 | Low | P3 | Honest scores + write contract | Some phase docs stale |
| DevOps & Deployment | 80 | Med | P2 | CI lint/test/build/audit/e2e/Docker | No staging deploys |
| Error Handling | 77 | Med | P1 | Cheque compensate via deleteTransaction | Storage catches still quiet |
| Logging & Monitoring | 61 | High | P1 | Rollback + session verify capture | No default APM |
| API Design | 71 | Med | P1 | FinanceSync mandatory for money mutations | No server mutation API |
| Database Design | 66 | High | P0 | Soft-delete; migrations | Blob SoR |
| Project Structure | 78 | Low | P2 | Clear folders | Legacy admin coexists |

---

## 4. Critical Issues

| # | Problem | Root cause | Severity | Status |
|---|---------|------------|----------|--------|
| 1 | Browser-as-authority | Offline-first SoR | Critical | Architectural (needs server API) |
| 2 | Multi-device money under LWW | Sync conflict model | High | Open |
| 3 | XSS via string `innerHTML` | Vanilla UI | High | Mitigated (escape/safeImg); residual |
| 4 | CSP `unsafe-inline` | Inline handlers | High | In progress (`data-sm-fn`) |

**Resolved this pass:** classic photo-house dual finance writer; invoice/expense/payroll/cheque-revert dual writers; unsigned session sync trust; silent finance rollback catches; missing CRUD tests; CI without e2e.

---

## 5. High-Priority Improvements (this pass)

1. Photo-house deposits → `FinanceSync.recordDeposit` (`admin.html` loads finance-sync)
2. Invoice/expense delete → `FinanceSync.deleteTransaction`
3. Payroll requires FinanceSync (removed `_createLedger` fallback)
4. Cheque `revertPass` → `deleteTransaction`
5. Production `getUser()` rejects unsigned sessions; bootstrap logs verify failures
6. Logo rendering via `Utils.safeImgHtml`
7. `tests/finance-sync-crud.test.js` in-memory harness (5 tests)
8. CI Playwright smoke (8 pass, 1 optional skip)

---

## 6. Recommended New Features

| Feature | Impact | Complexity |
|---------|--------|------------|
| Server mutation API for finance | High | XL |
| Authenticated Playwright finance suite | High | M |
| Complete `data-sm-fn` → drop `unsafe-inline` | High | M |
| Split settings.js / accounting.js | Medium | M |
| axe a11y in CI | Medium | S |
| Retire classic admin HTML entirely | Medium | M |

---

## 7. Security Findings

- **Good:** PBKDF2, HMAC sessions, prod unsigned reject (sync+async), CSRF, finance RBAC, SMS proxy sanitize, snapshot sanitize, safeImg for logos, nginx CSP/headers.
- **Gaps:** Client authority; CSP `unsafe-inline`; local backups retain secrets by design; residual string-HTML XSS surface.
- **npm audit:** gate at high+ in CI.

---

## 8. Performance Findings

Unchanged: coalesced persist + ledger pagination help; full-collection scans and route `innerHTML` rebuilds remain the bottleneck.

---

## 9. Architecture Review

**Finance write contract:** create / update / delete / transfer / cheque pass / cheque revert / photo-house deposit / payroll / expense ledger / invoice ledger → **FinanceSync only**.

---

## 10. Technical Debt Analysis

Debt shifted from “finance integrity holes” to “UI event migration + SaaS authority.” Megafiles and classic admin quarantine remain.

---

## 11. Refactoring Roadmap

### P0
- Server mutation gateway design spike
- Authenticated finance Playwright
- Finish `data-sm-fn` on settings/accounting

### P1
- Split megafiles; observability default endpoint
- Stronger sync conflict rules for banks

### P2
- Virtualization; preview deploys; retire classic admin

### P3
- axe CI; optional TypeScript at `js/lib`

---

## 12. Final Recommendations

1. Ship for single-studio production with ops checklist.
2. Do not claim SaaS readiness or vanity 10/10.
3. Next strategic investment: **server mutation gateway**.

---

*Honest scores relative to industry production standards.*
