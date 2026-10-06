---
name: crmstudio-sync-engine
description: >-
  Use this skill when managing data synchronization between local IndexedDB and
  cloud backends (Supabase or Sync Server), handling realtime subscriptions,
  optimistic concurrency control, or running database migrations.
---

# CRMSTUDIO Hybrid Sync Engine Guide

این اسکیل راهنمای فنی موتور همگام‌سازی هیبریدی (ترکیبی) آفلاین/آنلاین در CRMSTUDIO است.

## ۱. مدل همگام‌سازی ۲ لایه (Hybrid Architecture)
1. **همگام‌سازی بلادرنگ موجودیت‌ها (Entity Sync):**
   - تعریف موجودیت‌های قابل همگام‌سازی در `js/sync/entities.js` (قراردادها، پرداخت‌ها، پرسنل، گردش‌کار و ...).
   - انتقال دوره‌ای تغییرات با بازه ۲.۵ ثانیه‌ای.
   - ثبت تاریخ آخرین تغییرات با فیلد `updated_at`.
2. **پشتیبان اسنپ‌شات کامل (Snapshot Fallback):**
   - تهیه اسنپ‌شات کلی دیتابیس هر ۶۰ ثانیه یک‌بار در صورت اتصال اینترنت.
   - فشرده‌سازی و فیلتر کردن اطلاعات حساس.

## ۲. کنترل همروندی و حل تعارضات (Conflict Resolution)
- استراتژی مبتنی بر نسخه (Revision-based OCC).
- در صورت وقوع تعارض، موجودیت به `conflict-store.js` ارسال شده و به کاربر در بخش تنظیمات یا نوار اعلان برای بررسی دستی نمایش داده می‌شود (`studioInfo.syncConflicts`).
- حل خودکار تعارضات مالی: فاکتورها و دریافت‌ها نباید بازنویسی شوند؛ بلکه به صورت رکوردهای تراکنشی تجمیعی ثبت گردند.

## ۳. اجرای مایگریشن‌ها در دیتابیس Supabase
مایگریشن‌های دیتابیس در پوشه `supabase/migrations/` به ترتیب شماره باید اجرا شوند:
- `001_studio_m_mvp.sql`: جداول پایه، مدیریت اعضا و تننت‌ها
- `002_snapshot_manager_rls.sql`: اعمال سیاست‌های RLS برای اسنپ‌شات‌ها
- `003_structured_sync.sql`: ساختار جدول `studio_entities`
- `004_realtime_storage.sql`: فعال‌سازی قابلیت‌های Realtime سوپابیس
- `005_snapshot_select_manager.sql`: محدودسازی خواندن اسنپ‌شات‌ها
- `006_contracts_manager_rls.sql`: سخت‌گیری مجوزهای دسترسی به قراردادها
- `008_tighten_select_rls.sql`: نهایی‌سازی فیلترهای امنیتی تننت‌ها
