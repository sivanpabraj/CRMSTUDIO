---
name: crmstudio-qa-testing
description: >-
  Use this skill when running unit tests, writing E2E Playwright test suites,
  running ESLint checks, verifying zero-warning policies, and validating builds.
---

# CRMSTUDIO QA & Testing Guide

این اسکیل راهنمای اجرای تست‌ها، تضمین کیفیت و ارزیابی استانداردهای کد در CRMSTUDIO است.

## ۱. ابزارهای تست پروژه
- **تست‌های واحد و منطقی (Unit Tests):** بر پایه Vitest در پوشه `tests/`.
- **تست‌های سرتاسری کاربری (E2E Tests):** بر پایه Playwright در پوشه `e2e/` و ریشه پروژه (`playwright.config.js`).
- **لینتر استاتیک (Linter):** ESLint با کانفیگ `eslint.config.js` و متغیرهای سراسری `eslint.globals.js`.

## ۲. دستورات کلیدی
- اجرای تست‌های سریع: `npm run test`
- اجرای تست در حالت پیوسته (Watch mode): `npm run test:watch`
- اعتبارسنجی صفر اخطار (Zero-Warnings Lint): `npm run lint`
- اجرای تست‌های E2E مرورگر: `npm run test:e2e`
- بیلد پروداکشن: `npm run build`

## ۳. الگوهای تست‌نویسی
- هنگام افزودن قابلیت جدید، تست متناظر در پوشه `tests/` ایجاد نمایید.
- ماک کردن (Mocking) محیط `indexedDB` و `localStorage` با استفاده از ساختار موجود در تست‌های دیگر (مانند `tests/secure-db.test.js`).
- تست سناریوهای مرزی: قطعی اینترنت، ریت‌لیمیت‌ها، کاراکترهای مخرب و تلاش‌های ناموفق لاگین.
