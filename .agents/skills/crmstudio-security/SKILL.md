---
name: crmstudio-security
description: >-
  Use this skill when auditing security, managing API keys, preventing data leaks,
  hardening Supabase RLS policies, auditing server sync endpoints, or reviewing
  authentication and CSRF controls.
---

# CRMSTUDIO Security & Hardening Guide

این اسکیل دستورالعمل‌های بازرسی امنیتی و سخت‌گیری سیستم CRMSTUDIO را پوشش می‌دهد.

## ۱. اصول مدیریت اسرار (Secrets Management)
- **کلیدهای کلاینت مجاز:** فقط `VITE_SUPABASE_ANON_KEY` مجاز است در فرانت‌اند بارگذاری شود.
- **ممنوعیت کلیدهای اختصاصی پیامک در کلاینت:**
  - هرگز کلیدهای وب‌سرویس ملی‌پیامک یا کاوه‌نگار در مقادیر پیش‌فرض فرانت‌اند قرار نگیرد.
  - فرانت‌اند باید به جای ارتباط مستقیم، درخواست‌ها را به مسیر امن Supabase Edge Function (`/functions/v1/send-sms`) یا پراکسی سرور ارسال کند.
- **کلیدهای سوپابیس:** کلید `service_role` هرگز نباید در کد سورس یا مخزن گیت قرار داشته باشد.

## ۲. بازرسی امنیتی سرور همگام‌سازی (`server/sync-server.mjs`)
در صورت استفاده از سرور مستقل نود برای همگام‌سازی:
1. **احراز هویت اندپوینت‌های دریافت و ارسال:**
   - اندپوینت `/api/sync/pull` و `/api/sync/push` باید نیازمند هدر `Authorization: Bearer <token>` باشند.
   - شناسه تننت (`tenantKey`) باید با هویت توکن تأیید شود تا هیچ استودیویی نتواند دیتابیس استودیوی دیگر را دریافت یا بازنویسی کند.
2. **سخت‌گیری اندپوینت به‌روزرسانی سیستم (`/api/system/update`):**
   - حذف رمزهای پیش‌فرض هاردکد شده (مانند کلیدهای فال‌بک).
   - محدود کردن دسترسی به IPهای معتبر لوکال هاست یا کلیدهای امنیتی تعریف‌شده در فایل محیطی `SYSTEM_UPDATE_KEY`.
3. **نرخ درخواست (Rate Limiting):**
   - اطمینان از عملکرد ریت‌لیمیتر کشویی برای اندپوینت‌های حساس نظیر ارسال پیامک و همگام‌سازی.

## ۳. حفاظت از داده‌ها در کلاد (Supabase RLS)
- تمامی جداول ابری از جمله `studio_snapshots`، `studio_entities` و `contracts` باید سیاست‌های سطح ردیف (Row Level Security - RLS) سخت‌گیرانه داشته باشند.
- دسترسی‌های نوشتن به جداول مالی و قراردادها صرفاً به نقش `studio_manager` محدود گردد.
- پیش از آپلود اسنپ‌شات به سرور، حتماً از تابع `sanitizeSnapshotForCloud` استفاده شود تا هیدرهای امنیتی، توکن‌ها و رمزهای عبور لوکال حذف شوند.
