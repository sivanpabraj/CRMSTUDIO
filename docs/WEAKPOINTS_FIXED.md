# نقاط ضعف — بررسی و حل

| ضعف | حل |
|-----|-----|
| پچ‌های روی‌هم Auth (bridge + db-fix) | حذف از loader؛ login سرور در خود auth.js است |
| `_clearFailedAttempts` تعریف‌نشده | alias به `_clearAttempts` |
| `CURRENT_USER_KEY` نبود | تعریف شد |
| تطبیق شماره چندفرمته | harden قبل از login |
| `roleLabel` ReferenceError در shell | مقدار امن + retry |
| ماژول خالی = پازل خاموش | پیام خطا + reload |

شاخه: `eng/auth-login-fix-v1`
