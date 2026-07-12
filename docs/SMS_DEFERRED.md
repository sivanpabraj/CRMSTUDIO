# تا فردا — بدون API پیامک

وقتی SMS در دسترس نیست، این مسیرها کار می‌کنند:

## ورود

| نقش | روش |
|-----|-----|
| مدیر | **رمز عبور** در `index.html` (تب رمز) |
| پرسنل | رمز عبور (اگر مدیر تنظیم کرده) |
| مشتری | فعلاً نیاز به SMS — **فردا** بعد از deploy `send-sms` |

## محلی (localhost)

```bash
npm run dev
```

- مدیر dev (اگر seed شده): `09121000000` / `12345678` — فقط localhost
- یا رمزی که در `start.html` ساختید

## دعوت پرتال

- **ایجاد کاربر** در Studio M → پرتال → + ادمین/پرسنل → OK
- **ارسال SMS** فردا بعد از:
  ```bash
  supabase secrets set SMS_PROVIDER=kavenegar SMS_API_KEY=... SMS_LINE_NUMBER=...
  supabase functions deploy send-sms
  ```
- تا آن موقع: رمز اولیه را **دستی** به کاربر بدهید + لینک `studio-m/` یا `index.html?view=portal`

## تست E2E (بدون SMS)

```bash
npm run test:e2e
```

ورود با رمز (اختیاری):

```bash
E2E_LOGIN_PHONE=0912xxxxxxx E2E_LOGIN_PASSWORD=yourpw npm run test:e2e
```

## فردا — checklist SMS

1. `supabase link --project-ref gfzfmecglamyxevvttji`
2. Secrets واقعی Kavenegar
3. `supabase functions deploy send-sms`
4. Studio M Pro → تنظیمات → `smsProxyUrl`:
   `https://gfzfmecglamyxevvttji.supabase.co/functions/v1/send-sms`
5. تست: دعوت پرتال + OTP ورود یکپارچه
