# نگاشت حذف تست نمادین به شاهد رفتاری

این فایل مانع تفسیر اشتباه حذف تست‌های source-string به‌عنوان کاهش دامنه است.

| تست نمادین حذف‌شده | جایگزین رفتاری | محل اجرای اجباری |
|---|---|---|
| `tests/operations-readiness.test.js` | `scripts/ops-integrity.sql` روی DB production، `scripts/network-preflight.mjs` و `scripts/deployment-security-smoke.mjs` روی deployment | `.github/workflows/ops-check.yml` |
| بخش redirect در `tests/classic-removed.test.js` | navigation واقعی `/admin.html` و بررسی URL نهایی | `e2e/smoke.spec.js` |
| assertions ظاهری `tests/theme-system.test.js` | اجرای واقعی state machine تم در VM و dialog واقعی در browser | Vitest + `e2e/visual.spec.js` |
| assertions ظاهری `tests/dashboard-ste100.test.js` | محاسبات import/runtime در Vitest و headingهای renderشده در browser | Vitest + `e2e/visual.spec.js` |
| بخش integration در `tests/erp-runtime-ui.test.js` | اجرای واقعی `ErpRuntime.state()` داخل browser و اعتبارسنجی آرایه‌های typed | `e2e/visual.spec.js` |
| `tests/erp-contract-lifecycle.test.js` | اجرای RPCهای revision/photo-selection و بررسی rollback/transition روی PostgreSQL | `supabase/tests/contract_lifecycle_pgtap.sql` |
| `tests/erp-operational-core.test.js` | کاربران واقعی JWT، جداسازی tenant/role و دسترسی work-order | `supabase/tests/rls_role_resource_matrix.sql` |
| `tests/legacy-access-hardening.test.js` | manager/accountant/photographer/customer/expired membership روی جدول‌های واقعی | `supabase/tests/rls_role_resource_matrix.sql` |
| `tests/personnel-assignment-concurrency.test.js` | دو session هم‌زمان PostgreSQL و الزام commit شدن دقیقاً یک assignment | `scripts/test-assignment-concurrency.sh` |
| `customer-portal-security`، `erp-finance-reporting`، `erp-tenant-trigger-runtime`، `secure-invitations`، `security-blocker-closure` | verified phone و append-only portal؛ report view با RLS؛ trigger fail-closed؛ invitation create→request→approval؛ journal/storage/privilege؛ رد عضویت منقضی/لغوشده در `register_studio` | `supabase/tests/security_boundary_v2_pgtap.sql` با plan(52) و migrationهای اصلاحی 041 و 042 |

سه شاهد PostgreSQL فوق در job `database` از CI و job `verify-database` از release اجرا می‌شوند. تا وقتی اجرای واقعی آن jobها سبز نشده، این نگاشت فقط طراحی gate است و به معنی PASS نیست.
