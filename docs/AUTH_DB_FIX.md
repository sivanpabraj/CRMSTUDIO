# رفع ورود: شماره شناخته می‌شود ولی «ثبت نشده»

## علت
1. `GET /api/auth/lookup` روی **سرور** کاربر/استودیو را پیدا می‌کند → UI «ماندنی (مدیر استودیو)» نشان می‌دهد.
2. `Auth.login` فقط جدول `users` در **IndexedDB/localStorage همان مرورگر** را می‌گردد.
3. اگر ثبت‌نام روی دستگاه دیگر بوده، یا کش پاک شده، یا همگام‌سازی سرور ناقص → `not_found`.

## اصلاح (auth-server-bridge.js)
- بعد از lookup، در صورت امکان user را hydrate می‌کند
- اگر محلی نبود → `POST /api/auth/login`
- نتیجه موفق → user در DB محلی نوشته + session
- چندفرمت شماره (09 / 9 / 98)
- OTP از SmsProvider یا `/api/auth/otp/*`
- ایمیل اجباری در ثبت‌نام

## سرور لازم
- `POST /api/auth/login` { phone|email, password } → { ok, user, studioInfo }
- `POST /api/auth/register` برای استودیو جدید
- اختیاری: `/api/auth/otp/send` و `verify`

اگر این routeها روی andani.ir نیستند، باید روی سرور Node/Nginx اضافه شوند یا از Supabase Auth استفاده شود.
