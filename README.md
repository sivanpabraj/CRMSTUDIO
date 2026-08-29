# Studio M — پلتفرم مدیریت استودیو

نسخه **1.1.0** — ERP/CRM استودیو عکاسی و فیلمبرداری (RTL / فارسی)

## اجرا

```bash
npm install
npm run dev      # http://localhost:5173/site.html (LAN: 0.0.0.0)
npm run build    # خروجی در dist/
npm run test     # Vitest unit tests (83+)
npm run lint     # ESLint (zero warnings policy)
npm run test:e2e # Playwright smoke (نیاز به build)
```

### Docker

```bash
docker build -t studio-m .
docker run -p 8080:80 studio-m
```

مستندات: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · [docs/SECURITY.md](docs/SECURITY.md) · [docs/QUALITY_SCORES.md](docs/QUALITY_SCORES.md) · [docs/AUDIT_REPORT.md](docs/AUDIT_REPORT.md)

## ساختار

| مسیر | توضیح |
|------|--------|
| `studio-m/` | پنل Pro (ERP اصلی) |
| `studio-m/js/modules-*.js` | ماژول‌های شکستهٔ Pro (bookings, contracts, invoices, …) |
| `js/` | لایه داده، auth، FinanceSync، sync |
| `js/lib/` | توابع خالص قابل‌تست (ledger, sanitize, policy, …) |
| `contract.html` | قرارداد و فاکتور |
| `customer.html` | پورتال مشتری |

### ماژول‌های Studio M Pro

- داشبورد، رزرو، تقویم، قرارداد، پکیج، فاکتور، حسابداری، هزینه، گزارش
- پرسنل، حضور، حقوق، تجهیزات، امانات، گردش کار، فایل، پیامک، پرتال، تنظیمات

## ذخیره‌سازی

- **IndexedDB** (`talar_studio_v5`) — داده اصلی (offline-first)
- **sessionStorage** — نشست امضاشده + CSRF

> برای **cloud sync** → [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)

## قرارداد مالی (مهم)

همهٔ تغییرات موجودی بانک / `paid` قرارداد باید از **`FinanceSync`** عبور کنند:

- `recordDeposit` / `recordWithdrawal` / `transferBetweenBanks`
- پاس چک از `ChequeManager` (با rollback)

مستقیم `SecureDB.insert('transactions')` + `applyBankDelta` در مسیرهای جدید ممنوع است.

## امنیت

- Snapshot ابری sanitize می‌شود
- SMS در production فقط از طریق Edge proxy؛ کلید API روی دستگاه ذخیره نمی‌شود اگر proxy ست باشد
- Session در production بدون امضا رد می‌شود
- بازیابی بکاپ و عملیات مخرب نیاز به تأیید مدیر + رمز دارند

## مجوز

Private — Studio M
