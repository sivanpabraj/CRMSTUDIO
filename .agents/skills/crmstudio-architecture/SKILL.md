---
name: crmstudio-architecture
description: >-
  Use this skill when developing, refactoring, or extending CRMSTUDIO ERP modules,
  working with IndexedDB collections, managing state and permissions, or modifying
  the Studio M Pro interface.
---

# CRMSTUDIO Architecture & Module Development Guide

این اسکیل راهنمای جامع معماری، مدیریت داده و چرخه حیات ماژول‌های CRMSTUDIO است.

## ۱. ساختار پایگاه داده آفلاین (IndexedDB)
داده‌های سیستم در دیتابیس محلی تحت عنوان `talar_studio_v5` نگهداری می‌شوند:
- شیء کلی داده‌ها در متغیر `DB` در دسترس است (`js/db.js`).
- خواندن داده‌ها: `DB.get('contracts')`, `DB.find('contracts', c => c.id === id)`, `DB.filter(...)`
- نوشتن داده‌ها: همیشه باید از گیت `SecureDB` استفاده شود:
  ```javascript
  await SecureDB.insert('contracts', newContract)
  await SecureDB.update('contracts', id, patch)
  await SecureDB.delete('contracts', id)
  ```
- تغییر اسکیمای دیتابیس نیازمند افزایش `DB_VERSION` در `js/db.js` و افزودن تابع در `DB_MIGRATIONS` است.

## ۲. اضافه کردن ماژول جدید به پنل Studio M Pro
برای افزودن یک ماژول جدید (مثلاً بورد کانبان یا گالری انتخاب عکس):
1. **ثبت ماژول در `studio-m/js/modules.js`:**
   ```javascript
   SMModules.myModule = {
     render(el) {
       // رندر ساختار اولیه ماژول
     },
     view(id) {
       // نمایش جزئیات آیتم با SM.pushSubView
     },
     edit(id) {
       // باز کردن فرم ویرایش با SMUI.modal
     }
   }
   ```
2. **ثبت مسیر (Route) در `studio-m/js/core.js`:**
   بررسی دسترسی کاربر با `SM.can('my_permission')` و افزودن دکمه منو یا مسیر در سیستم ناوبری.
3. **اعمال استایل‌های شیشه‌ای (Glassmorphism):**
   از کلاس‌های استاندارد `sm-card`, `sm-card-header`, `sm-card-body`, `sm-btn`, `sm-table`, و پالت رنگی `SM_CONTRACT_PALETTE` استفاده نمایید.

## ۳. سیستم کنترل دسترسی و مجوزها (RBAC)
- بررسی نقش‌ها از طریق متد `SM.can(perm)` یا `Access.can(user, perm)` صورت می‌گیرد.
- نقش‌های استاندارد:
  - `system_admin`: دسترسی کامل و نظارت سیستمی
  - `studio_manager`: مدیر آتلیه / شعبه
  - `editor`: تدوین‌گر و پرسنل بخش فنی
  - `photographer`: عکاس مراسم و استودیو
  - `finance`: امور مالی و صدور فاکتور
  - `reception`: پذیرش و هماهنگی
