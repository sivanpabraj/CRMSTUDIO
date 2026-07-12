# فاز ۰ — امنیت فوری (چک‌لیست)

هدف: استفاده **داخلی تک‌استودیو** با حداقل سوراخ‌های بحرانی.

## ۱. Login Gate — Studio M Pro

| مورد | وضعیت | فایل |
|------|--------|------|
| `SM.guard()` قبل از render | ✅ | `studio-m/js/app.js` |
| Redirect به login با `?next=` | ✅ | `studio-m/js/core.js` |
| CSRF token بعد از ورود | ✅ | `core.js` → `Auth.getCsrfToken()` |
| Re-check هر ۵ دقیقه | ✅ | `app.js` interval |

**تست:** بدون login → `/studio-m/` → باید به `index.html?next=...` برود.

---

## ۲. Open Redirect

| مورد | وضعیت | فایل |
|------|--------|------|
| `?next=` فقط same-origin | ✅ | `js/app.js` |
| Login password/OTP redirect | ✅ | `Utils.safeAppRedirect()` |
| Helper تست‌پذیر | ✅ | `js/lib/security-paths.js` |

**تست:** `index.html?next=https://evil.com` → نباید redirect شود.

---

## ۳. CSRF + راه‌اندازی اول

| مورد | وضعیت | فایل |
|------|--------|------|
| Setup phase بدون CSRF | ✅ | `js/secure-db.js` |
| `start.html` + `secure-db.js` | ✅ | `start.html` |
| `join.html` + CSRF init | ✅ | `join.js` |
| `secureSet` در setup | ✅ | `js/db.js` |

**تست:** `start.html` → ساخت استودیو بدون خطای CSRF.

---

## ۴. Factory Reset

| مورد | وضعیت | فایل |
|------|--------|------|
| تأیید رمز مدیر (UI) | ✅ | `settings.js` |
| فقط مدیر (`canManageStudioOps`) | ✅ | `settings.js` |
| Guard در ماژول | ✅ | `factory-reset.js` |
| `?wipe=confirm` + رمز | ✅ | `js/app.js` (localhost only) |

---

## ۵. Cloud (Supabase)

| مورد | وضعیت | فایل |
|------|--------|------|
| Push error toast (throttle 30s) | ✅ | `js/cloud.js` |
| Pull error در bootstrap | ✅ | `js/cloud.js` |
| RLS snapshot فقط manager | ✅ | `002_snapshot_manager_rls.sql` |
| RPC `upsert_studio_snapshot` manager-only | ✅ | همان migration |

**SQL:** migration 002 را در Supabase اجرا کن (اگر نشده).

---

## ۶. تست خودکار

```bash
npm run test   # tests/security-paths.test.js
npm run build
```

---

## محدودیت‌های باقی‌مانده (فاز ۱+)

- Session محلی بدون امضای سرور
- CSRF بدون bind به userId
- Cloud sync = last-write-wins

→ فاز ۱: Vitest گسترده‌تر، CI، SMS proxy  
→ فاز ۲: Backend + session سرور

---

## ترتیب تست دستی پیشنهادی

1. `start.html` → ساخت استودیو
2. `index.html` → login مدیر
3. `/studio-m/` → dashboard باز شود
4. Logout → `/studio-m/` → redirect به login
5. تنظیمات → ابر → ثبت‌نام/ورود
6. تنظیمات → بازنشانی → رمز اشتباه → رد شود
