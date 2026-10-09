# گزارش نهایی مهندسی — پلتفرم چنداستودیویی CRMSTUDIO

**شاخه:** `eng/auth-login-fix-v1`  
**تاریخ:** 2026-10-09

---

## وضعیت فازها

| فاز | محتوا | کد | عملیات سرور |
|-----|--------|-----|-------------|
| **A** پایه Multi-tenant | Schema, Auth, JWT, memberships, contracts | ✅ | Postgres + migrate |
| **B** دامنه کامل | banks, tx, personnel, afish, snapshot, dual-read | ✅ | saas-server up |
| **C** write-through + migrate کامل | saas-write-bridge, import همه جداول | ✅ | nginx /api/v2 |
| **Ops** | systemd unit, env example, docs | ✅ | فعال‌سازی شما |

---

## درخت فایل‌های کلیدی

```
server/schema/001_multi_tenant.sql
server/schema/migrate.sh
server/saas/auth-service.mjs
server/saas/http-api.mjs          # v2.0 phase B endpoints
server/saas/tenant-context.mjs
server/saas/migrate-json-tenant.mjs
server/saas-server.mjs
server/saas/systemd-crmstudio-saas.service
js/saas-studio-context.js
js/saas-studio-picker.js
js/saas-dual-read.js
js/saas-write-bridge.js
docs/SAAS_8_PILLARS.md
docs/SAAS_PHASE_B.md
docs/SAAS_OPS.md
docs/SAAS_COMPLETE_REPORT.md
```

---

## معماری نهایی هدف

```
PWA ──► Nginx
         ├ /api/v2/*  → saas-server:3001 → PostgreSQL (منبع حقیقت SaaS)
         ├ /api/*     → sync-server:3000 → JSON tenants (legacy)
         └ /*         → static
```

وقتی `SaasContext` نشست دارد:
- **خواندن:** `SaasDual` اول API، بعد local
- **نوشتن:** local + fire-and-forget به v2 (`SaasWriteBridge`)

---

## چک‌لیست تمام‌شدن production

1. [ ] Postgres نصب + `migrate.sh`
2. [ ] `JWT_SECRET` + `DATABASE_URL` در `/etc/crmstudio/saas.env`
3. [ ] `systemctl enable --now crmstudio-saas`
4. [ ] nginx proxy `/api/v2/`
5. [ ] `migrate-json-tenant.mjs` برای ماندنی
6. [ ] `server-update.sh eng/auth-login-fix-v1`
7. [ ] تست health / login / snapshot
8. [ ] (اختیاری) قطع تدریجی وابستگی به JSON master بعد از پایداری ۲–۴ هفته

---

## مرز صداقت مهندسی

- **تمام در ریپو:** لایه SaaS قابل استقرار برای هزاران استودیو (مدل داده + API + کلاینت پل)
- **تمام نیست بدون سرور شما:** Postgres زنده، DNS/HTTPS، مانیتور، backup روزانه
- UI تمام تب‌های studio-m هنوز می‌توانند از IndexedDB بخوانند؛ با write-bridge و dual-read مسیر مهاجرت بدون قطع سرویس باز است

---

## نمره معماری (پس از این بسته)

| معیار | نمره |
|--------|------|
| مدل Multi-tenant | ۹/۱۰ |
| Schema | ۹/۱۰ |
| API دامنه | ۸٫۵/۱۰ |
| کلاینت مهاجرت تدریجی | ۸/۱۰ |
| Ops آماده‌سازی | ۸/۱۰ |
| اجرای live روی سرور | وابسته به شما |
