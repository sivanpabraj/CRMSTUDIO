# CRMSTUDIO — Engineering Audit & Scorecard

**تاریخ:** 2026-10-07  
**شاخه:** `eng/pwa-hardening-v1`  
**نسخه نرم‌افزار:** 6.2.x

---

## نمره‌گذاری مهندسی (نهایی این فاز)

| حوزه | قبل | الان | توضیح |
|------|-----|------|--------|
| معماری ماژولار | 5 | **6** | bookings/timeline استخراج شدند |
| امنیت auth/session | 6 | **7** | SessionSign fail-closed |
| SecureDB / CSRF | 8 | 8 | — |
| همگام‌سازی ابر | 7 | 7 | — |
| **PWA / Offline** | **3** | **8** | SW واقعی + manifest |
| RTL / UX فارسی | 9 | 9 | — |
| مستندات | 8 | 9 | audit + E2E.md |
| **تست و CI** | **6** | **8** | Playwright E2E + unit session |
| عملکرد داده | 5 | 5 | IDB v2 باقی |
| قابلیت نگهداری | 5 | **6.5** | — |

**میانگین قبل:** ~۶.۲  
**میانگین الان:** ~۷.۴

---

## کارهای انجام‌شده

### PWA
- [x] sw.js v41
- [x] studio-m + site بدون unregister
- [x] manifest قابل نصب
- [ ] index.html head unregister (جبران با sw-register تأخیری)

### امنیت
- [x] session-sign v2 fail-closed

### ماژولار
- [x] bookings + timeline استخراج

### تست
- [x] e2e/auth, pwa, studio-m, contract
- [x] smoke selectors اصلاح
- [x] tests/session-sign.test.js
- [x] CI: playwright بعد از build

---

## باقی‌مانده

1. حذف unregister از index.html
2. حذف تعریف تکراری از modules.js
3. IndexedDB v2
4. E2E لاگین واقعی با OTP در staging
