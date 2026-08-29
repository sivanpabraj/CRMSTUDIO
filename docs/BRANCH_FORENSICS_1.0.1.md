# گزارش forensic شاخهٔ انتشار 1.0.1

تاریخ بررسی: ۱۴۰۵/۰۵/۳۱ (2026-08-22)

## مرجع بررسی

- checkout: `agent/erp-core-ste100`
- HEAD بررسی‌شده: `2762a01580337bec4af8bf7c195e423aba171b32`
- merge-base با `origin/main`: `08488beb2334e7b2332e0d44125a8679a92aa3c7`
- اختلاف commit با main: `0 15` از دستور `git rev-list --left-right --count origin/main...HEAD`
- اختلاف محتوا: 214 فایل، 14694 خط افزوده و 6207 خط حذف‌شده پیش از اصلاحات جاری

## نتیجه

شاخهٔ main نسخهٔ قابل انتشار نیست؛ 15 commit دامنه، امنیت، RLS، sync و تست فقط در شاخهٔ بررسی‌شده قرار دارند. تا وقتی این تغییرات از طریق PR کنترل‌شده و checkهای اجباری وارد main نشوند، tag زدن روی main ممنوع است.

وضعیت واقعی branch protection از این محیط قابل اثبات نبود، چون GitHub CLI نصب نیست و API احراز‌شده در دسترس نبود. وجود `CODEOWNERS` و workflow جایگزین اثبات فعال بودن Ruleset در GitHub نیست.

## دستورهای بازتولید

```bash
git rev-list --left-right --count origin/main...HEAD
git merge-base origin/main HEAD
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

## شرط بستن P0-09

1. PR از commitهای تأییدشدهٔ همین شاخه به main.
2. checkهای `quality`, `security`, `e2e`, `container`, `database` اجباری.
3. یک تأیید CODEOWNER، حل threadها و رد شدن approval قدیمی پس از push جدید.
4. منع force-push و delete روی main.
5. ثبت screenshot/export Ruleset و لینک اجرای سبز GitHub Actions در گزارش انتشار.

