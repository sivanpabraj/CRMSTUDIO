# معماری اتصال CRMSTUDIO

## سه درگاه

| نقش | ورود | مقصد |
|-----|------|------|
| مدیر استودیو | `index.html` | `studio-m/` |
| پرسنل | `index.html` یا کد دعوت | `index.html?view=portal` |
| مشتری | شماره روی قرارداد | `customer.html` |
| عضویت پرسنل | `join.html` | بعداً پرتال |

## جریان داده

```
ثبت‌نام مدیر → users + studioInfo (+ سرور /api/auth/register)
ورود → Auth.login → local users یا /api/auth/login → session
قرارداد + تیم → eng-contract-afish → persProjects → پرتال پرسنل
مالی → StudioFinance.forContract → مدیر / مشتری / AI
پیامک → SmsProvider ← studioInfo.sms*
```

## اسکریپت‌های پل

| فایل | نقش |
|------|-----|
| `js/eng-connectivity-hub.js` | مسیریابی یکسان + گارد |
| `js/auth-server-bridge.js` | login/register سرور |
| `js/studio-core-finance.js` | مانده واحد |
| `js/eng-contract-afish.js` | قرارداد → آفیش |

## مسیر نسبی

از `studio-m/` همهٔ `../js/...` و لینک‌های پرتال با `EngRouter.url()` ساخته شوند.
