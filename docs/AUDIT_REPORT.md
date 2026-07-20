# Studio M — Comprehensive Engineering Audit Report

**Date:** 2026-07-20  
**Branch:** `cursor/finance-cheque-p0-66da`  
**Version:** 6.0.0  
**Overall Score: 74 / 100** (was 73; edit/delete FinanceSync + a11y focus + rollback observability)

---

## 1. Executive Summary

Studio M is a production-credible **offline-first single-studio ERP/CRM** (Vanilla JS, IndexedDB system-of-record, optional Supabase sync). Hardening now includes a full FinanceSync write contract for **create, edit, delete, transfer, and cheque pass**, module split, SMS secret sanitization, coalesced persistence, ledger pagination, nav `data-sm-fn` delegation, main-region focus for keyboard users, and **86+ unit tests**.

The product is suitable for a **trusted single studio with many staff and customers**. It is **not** yet a multi-tenant SaaS with server-authoritative mutations. Client-held auth/RBAC and a document IDB store impose honest ceilings on Security (~70–75) and Scalability (~54–58).

---

## 2. Overall Project Score

| Metric | Score |
|--------|------:|
| **Overall** | **74 / 100** |
| Production readiness (single studio) | 80 |
| SaaS / multi-tenant readiness | 42 |

---

## 3. Category Scores

| Category | Score | Risk | Priority | Strengths | Weaknesses |
|----------|------:|------|----------|-----------|------------|
| Architecture | 72 | Med | P1 | Layered Pro shell; full FinanceSync CRUD contract | Global script graph; dual Pro/classic surfaces |
| Code Quality | 77 | Med | P1 | Lint clean; pure libs; atomic finance writers | Large settings/accounting files; string UI |
| Maintainability | 73 | Med | P1 | `modules-*.js` split; eslint globals | Script-order coupling; legacy admin writers |
| Scalability | 55 | High | P0 | Sync cursors; tombstones; RLS | Full collections in memory; LWW money |
| Performance | 72 | Med | P2 | Coalesced IDB; ledger page size 40 | No virtualization; innerHTML rebuilds |
| Security | 70 | High | P0 | CSRF, HMAC session, SMS proxy sanitize, CSP headers | Browser authority; `unsafe-inline` residual |
| UI/UX | 73 | Low | P2 | RTL Pro shell; Estedad/gold brand | Dense ERP; uneven polish |
| Accessibility | 60 | Med | P2 | Modal focus trap; route focus on `#sm-content` | Incomplete keyboard; no axe CI |
| Testing | 77 | Med | P1 | 86+ Vitest; edit/delete ledger math | Thin Playwright; little UI finance e2e |
| Documentation | 86 | Low | P3 | ARCHITECTURE/SECURITY/QUALITY_SCORES honest | Phase docs partially stale |
| DevOps & Deployment | 76 | Med | P2 | CI lint/test/build/audit/Docker | No deploy pipeline / staging |
| Error Handling | 74 | Med | P1 | Finance create/edit/delete/transfer rollback | Classic admin still dual-writes |
| Logging & Monitoring | 60 | High | P1 | SMObservability + rollback capture + remote sink | No default APM/alerts |
| API Design | 68 | Med | P1 | FinanceSync domain API (CRUD + transfer) | No server mutation API |
| Database Design | 66 | High | P0 | Migrations; soft-delete; field normalize | Blob SoR; denormalized balances |
| Project Structure | 78 | Low | P2 | Clear folders; multi-entry Vite | Legacy root admin coexists |

---

## 4. Critical Issues

| # | Problem | Root cause | Severity | Files |
|---|---------|------------|----------|-------|
| 1 | Browser-as-authority for auth & finance | Offline-first SoR choice | Critical | `auth.js`, `secure-db.js`, `db.js` |
| 2 | Residual classic-admin money writers | Incremental migration | High | `admin-photo-house.js` |
| 3 | XSS surface via `innerHTML` + residual `onclick` | Vanilla string UI | High | `ui.js`, `settings.js`, `nginx.conf` |
| 4 | Multi-device money under LWW | Sync conflict model | High | `sync/conflict.js`, denormalized banks |

---

## 5. High-Priority Improvements (this pass)

1. **`FinanceSync.updateTransaction` / `deleteTransaction`** — bank queue + snapshot rollback
2. **Accounting edit/delete routed through FinanceSync** — removed dead create fallback
3. **Profile user writes → `SecureDB.update`** (CSRF path)
4. **Nav → `data-sm-fn`**; **`#sm-content` focus** after navigate
5. **Rollback failures → `SMObservability.captureError`** (finance + cheques)

---

## 6. Recommended New Features

| Feature | Impact | Complexity |
|---------|--------|------------|
| Server mutation API for finance | High | XL |
| Playwright authenticated finance suite | High | M |
| Ledger virtualization + archival | Medium | M |
| axe a11y in CI | Medium | S |
| Preview deploys + auto migrations | Medium | M |
| TypeScript for `js/lib` + finance | Medium | L |
| Retire classic admin entirely | Medium | M |

---

## 7. Security Findings

- **Good:** PBKDF2, HMAC sessions (prod rejects unsigned), CSRF, finance RBAC, SMS proxy + secret strip, snapshot sanitize, nginx CSP/headers, classic admin quarantine, profile updates via SecureDB.
- **Gaps:** Client authority; CSP `unsafe-inline`; local backups retain secrets by design; XSS risk via string templates.
- **npm audit:** 0 high+ vulnerabilities (as of audit date).

---

## 8. Performance Findings

- Coalesced SecureDB→IDB writes + serialized persist chain reduce write amplification.
- Ledger pagination reduces DOM size for large histories.
- Remaining bottleneck: full-collection scans and full-route `innerHTML` re-renders.

---

## 9. Architecture Review

```
Presentation: studio-m/ (Pro) · contract · customer · site · admin(legacy)
Application:  Auth · Access · SecureDB · FinanceSync · Cloud/SyncEngine
Data:         IndexedDB (SoR) · Supabase entities/snapshots (optional)
```

**Finance write contract (Pro):** all bank-linked creates, edits, deletes, transfers, and cheque passes go through `FinanceSync` (serialized bank queue + compensating rollback).

Decision that is correct for the product: offline-first for Iranian studio ops with unreliable connectivity.  
Decision that must change for SaaS: move mutation authority to the server.

---

## 10. Technical Debt Analysis

Primary debt is **architectural honesty vs incremental hardening**. FinanceSync CRUD, policy libs, SMS sanitize, module splits, and tests raised quality materially. Remaining tax: megafiles (`settings.js`, `accounting.js`), incomplete event delegation, classic admin writers, LWW money conflicts.

---

## 11. Refactoring Roadmap

### P0 — Integrity
- Retire classic-admin dual finance writers or quarantine permanently
- Finance Playwright: deposit / edit / transfer / cheque pass / delete reverse
- Enforce SMS proxy-only in production UI (done for save)

### P1 — Hardening
- Complete `data-sm-fn` migration → drop CSP `unsafe-inline`
- Wire default observability endpoint in deploy docs
- Split `settings.js`; ES modules for finance/auth
- IndexedDB integration tests for FinanceSync

### P2 — Scale path
- Server-authoritative finance; IDB as cache
- Virtualization + archival
- Stronger conflict rules or single-writer finance
- Preview deploys

### P3 — Polish
- a11y CI; retire classic admin; optional TypeScript at `js/lib`

---

## 12. Final Recommendations

1. **Ship** current branch for single-studio production with ops checklist (migrations 001–006, SMS Edge proxy, manager device as sync hub).
2. **Do not claim** multi-tenant SaaS readiness or vanity 10/10 scores — Security/Scalability cannot honestly exceed ~70–75 / ~55–60 while the browser is system of record.
3. **Next strategic investment:** server mutation gateway — the only way to break Security/Scalability ceilings.
4. Continue incremental integrity work (classic admin retirement + e2e) every sprint.

---

*Report generated by continuous Principal Engineering audit. Scores are honest relative to industry production standards, not vanity metrics.*
