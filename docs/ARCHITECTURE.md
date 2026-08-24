# معماری Studio M

## مرزهای اصلی

- `studio-m/` تنها پنل مدیریت است.
- IndexedDB حافظه موقت رابط کاربر و داده‌های غیرمالی آفلاین است.
- PostgreSQL و تابع `post_finance_command` تنها مرجع معتبر عملیات مالی هستند.
- Edge Function فقط درخواست احراز‌شده را به فرمان اتمیک دیتابیس منتقل می‌کند.
- مجوزها در دیتابیس و بر اساس قابلیت بررسی می‌شوند؛ مخفی‌کردن دکمه مجوز محسوب نمی‌شود.

## مسیر عملیات مالی

`FinanceSync → StudioMutateClient → studio-mutate → post_finance_command → finance_transactions + finance_journal_lines`

واریز، برداشت، انتقال، ویرایش و حذف در یک تراکنش دیتابیس ثبت می‌شوند. ویرایش و حذف، سطر قبلی دفترکل را تغییر نمی‌دهند؛ یک ثبت برگشتی ایجاد می‌شود. اگر اتصال یا نشست ابری وجود نداشته باشد، موجودی محلی تغییر نمی‌کند.

## Sync model (Phase 2–3 + live multi-device)

1. **Entity sync** (primary, ~0.7s debounce) — فقط aggregateهای غیرحساس → `studio_entities`؛ contract/finance/payroll/bank در migration 044 از generic sync حذف شده‌اند.
2. **Realtime** — `postgres_changes` on `studio_entities` (+ `studio_sync_events`) → pull (~0.4s)
3. **UI live refresh** — Pro re-renders current module on `sm-sync-pull` (skips open modals)
4. **Snapshot** (fallback, 60s) — sanitized JSON → `studio_snapshots`
5. **Tab hide** — flushes pending entity push so peers see changes sooner

**Requirement:** Cloud enabled + Supabase session on **each** device, same studio.

## عضویت

عضویت مستقیم با کد عمومی حذف شده است:

1. مدیر دعوت‌نامه زمان‌دار و هش‌شده می‌سازد.
2. کاربر درخواست عضویت ثبت می‌کند.
3. مدیر درخواست را تأیید یا رد می‌کند.
4. نقش ممتاز مدیر از طریق دعوت‌نامه قابل واگذاری نیست.

## Migration

Migrationها به‌ترتیب `001` تا `044` اجرا می‌شوند و فایل قدیمی هرگز ویرایش نمی‌شود. Migration 044 آخرین مرز امنیتی نسخه 1.0.1 است: backup plaintext را بازنشسته، tenant قرارداد را immutable و generic sync را از aggregateهای server-authoritative جدا می‌کند.

## انتشار

شاخه `main` باید توسط Ruleset محافظت شود. CI شامل کیفیت، امنیت، تست مرورگر و ساخت Container است. نسخه قابل انتشار فقط از tag نسخه و پس از اجرای migration روی staging ساخته می‌شود.

مستندات عملیاتی: [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md) و [RELEASE_GOVERNANCE.md](./RELEASE_GOVERNANCE.md).
