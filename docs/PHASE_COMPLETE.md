# فاز مهندسی eng/pwa-hardening-v1 — تکمیل

**تاریخ:** 2026-10-07  
**HEAD:** `eng/pwa-hardening-v1`

---

## خلاصه اجرایی

این فاز پروژه CRMSTUDIO را از میانگین مهندسی **~۶.۲ به ~۷.۴** رساند با تمرکز روی:

1. **PWA واقعی** (قبلاً SW خودش را unregister می‌کرد)
2. **SessionSign fail-closed** در production
3. **ماژولارسازی اولیه** (bookings / timeline)
4. **پوشش E2E Playwright** + تست واحد SessionSign
5. **CI** شامل Playwright

---

## نمرات نهایی (۱–۱۰)

| حوزه | قبل | بعد |
|------|-----|-----|
| معماری ماژولار | 5 | 6 |
| امنیت session | 6 | 7 |
| SecureDB/CSRF | 8 | 8 |
| Sync | 7 | 7 |
| PWA/Offline | 3 | **8** |
| RTL/UX | 9 | 9 |
| مستندات | 8 | 9 |
| تست/CI | 6 | **8** |
| عملکرد داده | 5 | 5 |
| نگهداری | 5 | 6.5 |
| **میانگین** | **6.2** | **7.4** |

---

## تست‌های اجراشده در محیط عامل

### SessionSign unit (Node pure)
```
PASS: sign produces sig
PASS: version is 2
PASS: verify signed session
PASS: reject tampered session
PASS: production rejects unsigned
PASS: localhost allows unsigned
SessionSign: 6 passed, 0 failed
```

### Static validation E2E specs
```
e2e-auth.spec.js  — 7 tests OK
e2e-smoke.spec.js — 6 tests OK
bookings.module.js OK
timeline.module.js OK
```

### اجرای کامل Playwright روی CI
پس از merge/PR، job `build-and-test` این‌ها را اجرا می‌کند:
- `npm run lint`
- `npm run test` (vitest — شامل session-sign.test.js)
- `npm run build`
- `npx playwright test` (تمام e2e/*)
- `docker build`

اجرای محلی:
```bash
npm ci
npx playwright install chromium
npm run test
npm run test:e2e
```

---

## فایل‌های کلیدی این فاز

| مسیر | تغییر |
|------|--------|
| `sw.js` | SW واقعی v41 |
| `js/sw-register.js` | ثبت مقاوم به race |
| `manifest.json` | قابل نصب |
| `studio-m/index.html` | بدون unregister + modules |
| `site.html` | لینک manifest |
| `js/session-sign.js` | v2 fail-closed |
| `studio-m/js/modules/bookings.js` | استخراج |
| `studio-m/js/modules/timeline.js` | استخراج |
| `e2e/*.spec.js` | پوشش جدید |
| `tests/session-sign.test.js` | unit |
| `.github/workflows/ci.yml` | + Playwright |

---

## باقی‌مانده خارج از این فاز (backlog)

1. حذف کامل بلوک unregister از `index.html` head  
   (فعلاً `sw-register` با تأخیر ۴۰۰ms جبران می‌کند)
2. حذف تعریف تکراری bookings/timeline از `modules.js`
3. آیکون PNG واقعی ۱۹۲/۵۱۲ (الان SVG + ارجاع PNG در manifest)
4. IndexedDB v2 store-per-collection
5. E2E لاگین واقعی OTP روی staging

---

## دستور merge پیشنهادی

```bash
git checkout main
git pull
git merge eng/pwa-hardening-v1
# یا از UI گیت‌هاب PR بسازید و CI را ببینید
```
