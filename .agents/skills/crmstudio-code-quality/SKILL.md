---
name: crmstudio-code-quality
description: >-
  Use when refactoring large modules, scoring engineering quality, splitting files,
  reducing globals, or improving maintainability of CRMSTUDIO. Senior modularization engineer.
---

# CRMSTUDIO Modularization & Code Quality (Senior)

## آستانه‌های اندازه فایل
| نوع | حداکثر توصیه‌شده |
|-----|------------------|
| ماژول UI تک‌مسئولیتی | ≤ 25 KB |
| لایه داده / auth | ≤ 30 KB |
| Registry مرکزی | ≤ 40 KB (ترجیحاً importهای lazy) |

فایل‌های فعلی بالاتر از آستانه:
- `studio-m/js/modules.js` (~91 KB) → split به `modules/*.js`
- `studio-m/js/settings.js` (~90 KB) → per-tab modules
- `js/app.js` (~81 KB) → extract routing/helpers
- `studio-m/js/dashboard.js` (~56 KB)
- `contract.js` (~50 KB)

## قوانین refactor
1. رفتار خارجی ماژول (`render` / `view` / `edit` / `destroy`) تغییر نکند.
2. همه writeها از `SecureDB` عبور کنند.
3. `npm run lint` باید zero-warnings بماند.
4. تست‌های موجود شکسته نشوند.
5. global جدید اضافه نکن؛ در صورت نیاز از `SM` یا namespace موجود استفاده کن.

## نمره‌گذاری (۱–۱۰)
قبل از merge هر PR بزرگ، این جدول را در توضیحات PR به‌روز کن:
- معماری ماژولار
- امنیت
- PWA/Offline
- تست
- عملکرد
- قابلیت نگهداری
