# سیاست شاخه و انتشار

## تنظیم الزامی شاخه main

در GitHub Settings → Rules → Rulesets برای `main` این موارد فعال شوند:

- حذف و force-push ممنوع
- Pull request اجباری
- حداقل یک تأیید
- رد شدن تأیید قبلی بعد از commit جدید
- CODEOWNERS اجباری
- حل همه review threadها
- موفقیت checkهای `quality`، `security`، `e2e` و `container`
- شاخه باید قبل از merge به‌روز باشد

هیچ استقرار مستقیمی از شاخه‌های کاری مجاز نیست. خروجی قابل انتشار فقط از tag نسخه مانند `v6.1.0` ساخته می‌شود. Workflow انتشار فعلاً artifact کنترل‌شده تولید می‌کند؛ اتصال به سرور باید بعد از تعیین محیط staging و production اضافه شود.

## ترتیب migration

Migrationها فقط افزایشی هستند و نباید فایل قبلی ویرایش شود. ابتدا روی staging، سپس تست RLS و مالی، و در نهایت production اجرا می‌شوند. نسخه اپ فقط پس از تأیید migration منتشر می‌شود.
