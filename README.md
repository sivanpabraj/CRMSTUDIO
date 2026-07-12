# Studio M — پلتفرم مدیریت استودیو

نسخه **6.0.0** — ERP/CRM استودیو عکاسی و فیلمبرداری (RTL / فارسی)

## اجرا

```bash
npm install
npm run dev      # http://localhost:5173/site.html
npm run build    # خروجی در dist/
npm run test     # 42+ unit tests
npm run lint     # ESLint (zero warnings policy)
```

### Docker

```bash
docker build -t studio-m .
docker run -p 8080:80 studio-m
```

مستندات: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · [docs/SMS_DEFERRED.md](docs/SMS_DEFERRED.md) (بدون SMS تا فردا)

## ساختار

| مسیر | توضیح |
|------|--------|
| `studio-m/` | پنل Pro (ERP اصلی) |
| `js/` | لایه داده، auth، ماژول‌های مشترک |
| `admin.html` | پنل کلاسیک (legacy) |
| `contract.html` | قرارداد و فاکتور |
| `customer.html` | پورتال مشتری |

### ماژول‌های Studio M Pro

- **گردش کار تدوین** (`studio-m/#workflow`) — خط تولید ingest → تحویل، لینک قرارداد، ادیتور، اولویت، تب فعال/معلق/تمام‌شده
- **مدیریت فایل** — به‌زودی

## ذخیره‌سازی

- **IndexedDB** (`talar_studio_v5`) — داده اصلی
- **sessionStorage** — نشست کاربر

> ⚠️ این نسخه **offline-first** است. برای **cloud sync** → [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)

## Cloud (Supabase MVP)

- Auth سرور-side (Supabase Auth)
- Snapshot sync کل دیتابیس
- جدول contracts ساختاریافته
- RLS multi-tenant آماده

## راه‌اندازی اول

1. `start.html` — ساخت استودیو و مدیر
2. یا ورود از `index.html`

در **production** (غیر localhost) رمز مدیر اولیه **تصادفی** است و یک‌بار در صفحه ورود نشان داده می‌شود.

## حالت demo

فقط روی `localhost` با `?demo=1` فعال است.

## امنیت

- Snapshot ابری قبل از آپلود **sanitize** می‌شود (بدون رمز/کلید SMS)
- دعوت پرتال: کد SMS جداگانه — بدون bypass در ورود یکپارچه
- Session در production نیاز به امضای HMAC دارد
- کلید SMS را فقط از طریق **Edge Function** (`send-sms`) در production استفاده کنید
- migration **005** را روی Supabase اعمال کنید

## مجوز

Private — Studio M
