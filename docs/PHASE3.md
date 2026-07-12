# فاز ۳ — Realtime · تعارض · Auth · فایل · CSRF

## خلاصه

فاز ۳ قابلیت‌های production-grade برای sync چنددستگاهی، امنیت session/CSRF، یکپارچه‌سازی رمز ابری، و ماژول فایل را تکمیل می‌کند.

## دسته‌بندی و راه‌حل

| # | دسته | مشکل | راه‌حل |
|---|------|------|--------|
| 1 | **Realtime** | pull فقط دستی/دوره‌ای | Supabase Realtime روی `studio_entities` |
| 2 | **Conflict** | LWW خاموشانه داده از دست می‌دهد | تشخیص تعارض + صف `syncConflicts` + UI در settings |
| 3 | **CSRF** | token به user bind نبود | regenerate در login + validate با `session.userId` |
| 4 | **Auth** | رمز local ≠ Supabase | `cloudUnifyPassword` + `AuthBridge.unifyPassword` |
| 5 | **Files** | ماژول غیرفعال، بدون storage | Supabase Storage + `fileAssets` entity sync |
| 6 | **Audit** | بدون log تغییرات ابری | `studio_sync_events` + trigger |

## فایل‌های جدید

```
supabase/migrations/004_realtime_storage.sql
js/lib/csrf.js
js/sync/conflict-store.js
js/sync/realtime.js
js/file-storage.js
tests/phase3.test.js
docs/PHASE3.md
```

## Migration 004

1. Realtime publication برای `studio_entities`
2. Bucket `studio-files` (حداکثر ۵۰MB)
3. RLS storage: مسیر `{studio_id}/{asset_id}/{filename}`
4. جدول `studio_sync_events` + trigger

**اجرا در Supabase SQL Editor:**

```bash
# فایل: supabase/migrations/004_realtime_storage.sql
```

## Realtime

- `RealtimeSync.start(cloud)` پس از login/bootstrap
- تغییر entity → debounced pull (۱.۲s)
- وضعیت: Settings → ابر → badge Realtime

## تعارض sync

وقتی دو نسخه همزمان ویرایش شده:
- در `studioInfo.syncConflicts` ذخیره می‌شود
- Settings → ابر → «نگه‌داشتن محلی / ابری»
- پس از resolve → push خودکار

## Auth یکپarچه

1. Settings → «یکسان‌سازی رمز محلی با Supabase»
2. تغییر رمز در پروفایل → `Cloud.updateAuthPassword`
3. Login محلی → `AuthBridge` تلاش sign-in ابری (اگر cloud فعال)

## ماژول فایل

- با cloud فعال: `files` از DISABLED خارج می‌شود
- آپلود → Supabase Storage + metadata در `fileAssets`
- sync metadata via entity (بدون binary در JSON)

## CSRF

- Token جدید در هر login/OTP login
- `validateCsrf` فقط اگر `token === session.csrf` و `user.id === session.userId`

## تست

```bash
npm run test   # 22+ tests شامل phase3.test.js
npm run build
```

## محدودیت‌های باقی‌مانده (فاز ۴)

- TypeScript migration
- E2E Playwright با Supabase test project
- Conflict merge سه‌طرفه (field-level)
- Realtime presence / cursors
- Penetration test قبل production
