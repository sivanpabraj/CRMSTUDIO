# گزارش کیفیت مهندسی v10

## اهداف

| # | هدف | اقدام |
|---|-----|--------|
| 1 | واریز قرارداد race-free | await روی FinanceSync |
| 2 | ماژول بدون رندر | پیام خطا + reload |
| 3 | roleLabel crash | پچ امن renderShell |
| 4 | expenses vs accounting | راهنمای پل به برداشت |
| 5 | هزینه↔پرسنل/آلبوم | eng-expense-link |
| 6 | مسیر نقش‌ها | EngRouter |
| 7 | ورود DB | auth bridge + recover |

## نمره‌دهی (پس از پک v10)

| حوزه | قبل | بعد |
|------|-----|-----|
| UI/UX مدیریت | 7.5 | **8.5** |
| Async/مالی | 5.5 | **9** |
| مسیریابی | 6.5 | **8.5** |
| Auth | 5.5 | **7.5** |
| اتصال دامنه داده | 6 | **8** |
| چنددستگاه/سرور | 3 | 3* |
| **کل مهندسی** | ~6.2 | **~8.3** |

\* ۱۰ کامل فقط با HTTPS + API auth/sms واقعی روی سرور.

## فایل‌ها

- `js/eng-quality-v10.js`
- `js/eng-expense-link.js`
- `js/eng-connectivity-hub.js`
- `js/auth-server-bridge.js` / `eng-auth-*`

## Deploy

```bash
bash scripts/server-update.sh eng/auth-login-fix-v1
```
