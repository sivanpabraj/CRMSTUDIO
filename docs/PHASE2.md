# فاز ۲ — همگام‌سازی ساخت‌یافته + امنیت session

## خلاصه

فاز ۲ معماری sync را از **snapshot کامل LWW** به **همگام row-level (entity-first)** ارتقا داده و snapshot را به‌عنوان پشتیبان ۶۰ ثانیه‌ای نگه داشته است.

## تغییرات

### ۱. دیتابیس (Migration 003)

- `studio_entities` — ذخیره JSON هر رکورد با `entity_type` + `local_id`
- `studio_sync_cursors` — cursor per entity
- RPC `upsert_studio_entities` — batch upsert (فقط manager)
- RLS: خواندن برای اعضا، نوشتن برای manager

فایل: `supabase/migrations/003_structured_sync.sql`

### ۲. موتور sync

| فایل | نقش |
|------|-----|
| `js/sync/entities.js` | رجیstry entityها + strip حساس |
| `js/sync/conflict.js` | merge LWW بر اساس `updated_at` |
| `js/sync/engine.js` | push/pull entity + debounce |

**Entityهای sync‌شده:** contracts, transactions, invoices, bookings, personnel, equipment, workflows, packages, expenses, leads, banks, cheques, appointments, customerRequests

**Excluded (فقط snapshot):** users, securityState, logs, apiKeys, studioInfo

### ۳. cloud.js (بازنویسی hybrid)

- `schedulePush()` → entity (۲.۵s) + snapshot (۶۰s)
- `pushAll()` / `pullAll()` — دستی از settings
- `bootstrap()` — ابتدا entity pull، سپس snapshot

### ۴. امنیت session

- `js/session-sign.js` — HMAC-SHA256 روی session محلی
- `Auth.verifySessionSignature()` در bootstrap
- `js/auth-bridge.js` — تلاش خودکار sign-in Supabase پس از login محلی (اگر cloud فعال)

### ۵. db.js

- `updatedAtIso` + `_syncRev` روی insert/update مجموعه‌های sync

### ۶. Admin کلاسیک

- مدیر بدون `?classic=1` → redirect به `studio-m/`
- بنر منسوخ‌شدن در پنل کلاسیک

## جریان sync

```
IndexedDB (source of truth)
  │ debounce 2.5s
  ▼
upsert_studio_entities (per type)
  │ debounce 60s
  ▼
upsert_studio_snapshot (full backup)
```

Pull در bootstrap: entity → snapshot (اگر entity خالی بود)

## راه‌اندازی

1. Migration 003 را در Supabase اجرا کنید (Dashboard SQL یا `apply_migration`)
2. `.env` با `VITE_SUPABASE_URL` و anon key
3. Settings → ابر → ورود Supabase + فعال‌سازی sync
4. «ارسال کامل» برای اولین push

## محدودیت‌های باقی‌مانده (فاز ۳+)

پیاده‌سازی شده در [`docs/PHASE3.md`](PHASE3.md): Realtime، Conflict UI، CSRF bind، Auth unify، File storage.

### فاز ۴

- TypeScript migration
- E2E Playwright
- Field-level conflict merge

## تست

```bash
npm run test   # شامل tests/sync-engine.test.js
npm run build
```
