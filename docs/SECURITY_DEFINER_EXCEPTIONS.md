# استثناهای مهندسی `SECURITY DEFINER`

این RPCها عمداً از `SECURITY DEFINER` استفاده می‌کنند چون باید عملیات محدود و اتمیک را پشت RLS انجام دهند. هشدار Supabase Advisor برای قابل‌فراخوانی‌بودن آن‌ها توسط نقش `authenticated` پذیرفته شده، اما عمومی یا بدون کنترل نیستند.

## کنترل‌های مشترک

- `search_path` برای همهٔ توابع حساس خالی یا ثابت است و اشیاء با نام schema کامل فراخوانی می‌شوند.
- اجرا از `public` و `anon` سلب شده و فقط به نقش لازم اعطا شده است.
- شناسهٔ کاربر از `auth.uid()` گرفته می‌شود؛ ورودی مرورگر به‌عنوان هویت پذیرفته نمی‌شود.
- مجوز استودیو/نقش در خود تابع دوباره بررسی می‌شود.
- عملیات مالی idempotent و ثبت حسابرسی آن append-only است.
- تست‌های امنیتی migrationها و مسیرهای نویسنده در CI اجرا می‌شوند.

## `claim_customer_contracts()`

این تابع endpoint عمومیِ احراز‌شدهٔ پرتال مشتری است. دسترسی قرارداد را فقط از شمارهٔ تأییدشدهٔ `auth.users.phone` همان کاربر استخراج می‌کند، شمارهٔ ارسال‌شده از کلاینت نمی‌پذیرد، قرارداد لغوشده را رد می‌کند و اتصال را با قفل تراکنشی و کلید یکتای `(contract_id, user_id)` ثبت می‌کند.

## `store_encrypted_studio_backup(...)`، `read_encrypted_studio_backup(...)` و `list_encrypted_studio_backups(...)`

این سه تابع فقط برای `service_role` مربوط به Edge Function قابل اجرا هستند. مرورگر نه `SELECT` مستقیم جدول دارد و نه مجوز اجرای RPC. تابع store فقط envelope رمزنگاری‌شدهٔ AES-256-GCM را می‌پذیرد، تابع read پس از بررسی عضویت فعال actor همان tenant فقط همان envelope را برمی‌گرداند، و تابع list حداکثر ۱۰۰ ردیف metadata را بدون ciphertext یا nonce برمی‌گرداند. فیلد قدیمی `payload` با constraint برای همیشه `NULL` است و `create_studio_backup(...)` از schema حذف شده است. Migration 044 در حضور هر archive plaintext به‌جای حذف خاموش داده fail می‌شود.

## wrapperهای generic sync

`apply_studio_entity_commands(...)` و `pull_studio_entity_deltas(...)` فقط wrapperهای احراز‌شده برای aggregateهای غیرحساس‌اند. contract، finance، payroll و bank در این مرز صریحاً رد می‌شوند. implementation داخلی sequence/tombstone از `public`، `anon`، `authenticated` و `service_role` سلب اجرا شده و فقط wrapper می‌تواند آن را فراخوانی کند.

## سایر RPCهای احراز‌شده

`register_studio`، دعوت/عضویت، همگام‌سازی غیرحساس، رزرو پیامک و فرمان‌های مالی endpointهای عمدی برنامه هستند. حذف `EXECUTE` برنامه را از کار می‌اندازد؛ تبدیل مستقیم آن‌ها به `SECURITY INVOKER` نیز عملیات اتمیک لازم را می‌شکند. هر تغییر در این فهرست باید همراه با بازبینی migration، grantها، `search_path`، بررسی `auth.uid()` و تست منفی RLS باشد.

مرجع هشدار: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
