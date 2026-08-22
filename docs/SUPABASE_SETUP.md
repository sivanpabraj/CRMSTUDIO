# راه‌اندازی Supabase — Studio M MVP

## ۱. ساخت پروژه

1. [supabase.com](https://supabase.com) → New Project
2. از **Settings → API** کپی کنید:
   - Project URL
   - `anon` public key

## ۲. اجرای SQL

در **SQL Editor** محتوای فایل زیر را اجرا کنید:

```
supabase/migrations/001_studio_m_mvp.sql
supabase/migrations/002_snapshot_manager_rls.sql
supabase/migrations/003_structured_sync.sql
supabase/migrations/004_realtime_storage.sql
supabase/migrations/005_snapshot_select_manager.sql
```

این کار جداول `studios`, `studio_members`, `studio_snapshots`, `contracts`, `studio_entities` و RLS را می‌سازد. migration **005** دسترسی **خواندن snapshot** را فقط به `studio_manager` محدود می‌کند.

## ۳. تنظیم اپ

### روش A — فایل `.env` (توصیه dev)

```bash
cp .env.example .env
# مقادیر را پر کنید
npm run dev
```

### روش B — از UI

1. `studio-m/#settings` → تب **ابر Supabase**
2. URL و Anon Key را paste کنید
3. «فعال‌سازی همگام‌سازی» را بزنید

## ۴. ثبت‌نام مدیر

1. همان تب → **ثبت‌نام + ساخت استودیو**
2. رمز Supabase (حداقل ۸ کاراکتر) — جدا از رمز local
3. ایمیل auth: `u09121234567@studiom.app` (از روی موبایل مدیر)

> **Site URL:** `http://localhost:5173/studio-m/auth-callback.html`  
> **Redirect URLs:** `http://localhost:5173/**`  
> برای dev ساده‌تر: Authentication → Providers → Email → **Confirm email** را خاموش کنید.

## ۵. ورود با Google (OAuth)

1. در [Google Cloud Console](https://console.cloud.google.com/) یک OAuth Client (Web) بسازید.
2. Authorized redirect URI را روی callback سوپابیس بگذارید:
   `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
3. Supabase Dashboard → **Authentication → Providers → Google** را Enable کنید.
4. **Client ID** و **Client Secret** را فقط در Dashboard وارد کنید — در اپ، git، یا چت نگذارید.
5. Audience → Test users: ایمیل گوگل خودتان را اضافه کنید (حالت Testing).
6. Auth URL Configuration:
   - Site URL: `http://localhost:5173/studio-m/auth-callback.html` (یا دامنه پرود)
   - Redirect URLs: `http://localhost:5173/**` و دامنه پرود
7. در اپ: Settings → ابر → ذخیره URL/Anon Key → **ورود با Google**

## ۶. Sync

| عمل | زمان |
|-----|------|
| entity | ~۰.۷s بعد از ذخیره |
| snapshot | ۶۰ ثانیه (پشتیبان) |
| realtime | نزدیک لحظه‌ای |
| دستی | Settings → «ارسال کامل» / «دریافت کامل» |
| تعارض | Settings → ابر → انتخاب محلی/ابری |

## معماری

```
مرورگر (IndexedDB)  ←→  Supabase PostgreSQL
         offline-first      studio_entities (row-level)
                            studio_snapshots (JSON کامل)
                            studio-files (Storage bucket)
                            contracts (ساختاریافته)
                            auth.users + studio_members
```

## امنیت

- **Anon key** در client مجاز است (RLS محافظت می‌کند)
- **service_role key** را هرگز در frontend نگذارید
- SMS و secrets حساس → فقط Edge Function (فاز بعد)

## عیب‌یابی

| خطا | راه‌حل |
|-----|--------|
| `requested path is invalid` | Site URL در Supabase = آدرس اپ (نه URL پروژه). Confirm email را خاموش کنید یا Redirect URLs را تنظیم کنید |
| `email_address_invalid` | اپ را رفرش کنید — ایمیل auth به `u{phone}@studiom.app` تغییر کرد |
| `service_role` / Invalid API key | فقط **anon** key در اپ — نه service_role |
| `forbidden` | SQL migration و RLS را اجرا کنید |
| `not authenticated` | ابتدا «ورود» Supabase |
| pull تغییری نداد | local جدیدتر است — «ارسال به ابر» بزنید |
