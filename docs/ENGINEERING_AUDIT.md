# CRMSTUDIO — Engineering Audit & Scorecard

**تاریخ:** 2026-10-07  
**شاخه:** `eng/pwa-hardening-v1`  
**نسخه نرم‌افزار:** 6.2.x

---

## نمره‌گذاری مهندسی (به‌روز پس از فاز فعلی)

| حوزه | قبل | الان | هدف بعدی |
|------|-----|------|----------|
| معماری ماژولار | 5 | **6** | 8 (استخراج bookings/timeline شروع شد) |
| امنیت auth/session | 6 | **7** | 8 (fail-closed در production) |
| SecureDB / CSRF | 8 | 8 | 8 |
| همگام‌سازی ابر | 7 | 7 | 8 |
| **PWA / Offline** | **3** | **8** | 9 |
| RTL / UX فارسی | 9 | 9 | 9 |
| مستندات | 8 | 9 | 9 |
| تست و CI | 6 | 6 | 8 |
| عملکرد داده | 5 | 5 | 7 (IDB v2) |
| قابلیت نگهداری | 5 | **6.5** | 8 |

**میانگین قبل:** ~۶.۲  
**میانگین الان:** ~۷.۲  
**هدف فاز بعد:** ~۷.۸

---

## کارهای انجام‌شده در این شاخه

### PWA
- [x] `sw.js` v41 — shell cache + SWR assets + network-only API
- [x] حذف unregister از `studio-m/index.html` و `site.html`
- [x] `manifest.json` قابل نصب
- [x] `sw-register.js` مقاوم به race
- [ ] حذف unregister از `index.html` (هنوز باقی؛ register تأخیری جبران می‌کند)

### امنیت
- [x] `session-sign.js` v2 — fail-closed در production برای نشست بدون signature

### ماژولارسازی
- [x] استخراج `bookings` و `timeline` به `studio-m/js/modules/`
- [x] بارگذاری override در `studio-m/index.html`
- [ ] حذف تعریف تکراری از `modules.js` (۸۰KB باقی)
- [ ] استخراج `contracts` / `settings` tabs

---

## اهداف باقی‌مانده (اولویت)

1. **index.html** — حذف بلوک unregister در head (راهنما: `docs/PWA_INDEX_HTML_FIX.md`)
2. حذف bookings/timeline از داخل `modules.js` برای کاهش حجم
3. IndexedDB v2 (store-per-collection)
4. E2E: OTP + contract + workflow status

---

## ایجنت‌های مهندسی

| ایجنت | skill |
|-------|-------|
| PWA Engineer | `.agents/skills/crmstudio-pwa/` |
| Code Quality | `.agents/skills/crmstudio-code-quality/` |
| Architecture | `.agents/skills/crmstudio-architecture/` |
| Security | `.agents/skills/crmstudio-security/` |
| Sync | `.agents/skills/crmstudio-sync-engine/` |
