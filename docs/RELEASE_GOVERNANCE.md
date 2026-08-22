# سیاست شاخه و انتشار

## تنظیم الزامی شاخه main

در GitHub Settings → Rules → Rulesets برای `main` این موارد فعال شوند:

- حذف و force-push ممنوع
- Pull request اجباری
- حداقل یک تأیید
- رد شدن تأیید قبلی بعد از commit جدید
- CODEOWNERS اجباری
- حل همه review threadها
- موفقیت checkهای `quality`، `security`، `sast`، `e2e`، `container` و `database`
- شاخه باید قبل از merge به‌روز باشد

هیچ استقرار مستقیمی از شاخه‌های کاری مجاز نیست. خروجی نسخهٔ جاری فقط از tag دقیق `v1.0.1` ساخته می‌شود. Workflow انتشار artifact، SBOM و SHA-256 تولید می‌کند؛ deploy به staging/production باید مرحله‌ای جدا و نیازمند تأیید انسانی باشد.

## ترتیب migration

Migrationها فقط افزایشی هستند و نباید فایل قبلی ویرایش شود. ابتدا روی staging، سپس تست RLS و مالی، و در نهایت production اجرا می‌شوند. نسخه اپ فقط پس از تأیید migration منتشر می‌شود.

## دروازهٔ انتشار 1.0.1

- Node 22 مطابق `.nvmrc`
- تطابق نسخه با `node scripts/validate-release.mjs`
- بازسازی کامل local database و اجرای pgTAP
- E2E authenticated بدون skip در release workflow
- ساخت و boot واقعی image، سپس probe روی `/health.json`
- artifact به‌همراه `artifacts/sbom.spdx.json` و `SHA256SUMS`
- همهٔ GitHub Actionها با commit SHA کامل pin شده‌اند؛ tag شناور توسط `validate-repository.mjs` رد می‌شود
- CI علاوه بر release، secret scan و SBOM قابل دانلود را در job امنیتی تولید می‌کند
- coverage gate با threshold غیرقابل‌کاهش 80٪ برای core و 90٪ برای finance/security؛ artifact پوشش حتی هنگام شکست حفظ می‌شود
- rollback مستند و snapshot دیتابیس پیش از migration production
