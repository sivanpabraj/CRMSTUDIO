# پلتفرم چندمستأجری — ۸ ستون · اهداف · برنامه · وضعیت کد

شاخه: `eng/auth-login-fix-v1`  
هدف نهایی: هزاران استودیو · هزاران کاربر · منبع حقیقت Postgres

---

## ستون ۱ — مدل Multi-Tenant

**هدف:** هر استودیو یک `tenant`؛ هیچ داده‌ای بدون `studio_id`.

| گام | شرح | کد |
|-----|-----|-----|
| 1.1 | جدول studios | `server/schema/001_multi_tenant.sql` |
| 1.2 | memberships (user↔studio↔role) | همان |
| 1.3 | قرارداد نام‌گذاری tenant_key | `server/saas/tenant-context.mjs` |

**معیار پذیرش:** یک user بتواند عضو ۲ استودیو باشد بدون تداخل داده.

---

## ستون ۲ — دیتابیس حرفه‌ای

**هدف:** Postgres به‌جای JSON فایل در مقیاس.

| گام | شرح | کد |
|-----|-----|-----|
| 2.1 | Schema کامل دامنه | `001_multi_tenant.sql` |
| 2.2 | ایندکس‌های (studio_id, …) | همان |
| 2.3 | مسیر migrate | `server/schema/migrate.sh` |

**معیار پذیرش:** migrate روی Postgres خالی بدون خطا.

---

## ستون ۳ — هویت و Auth مقیاس

**هدف:** کاربر سراسری + OTP + انتخاب استودیو.

| گام | شرح | کد |
|-----|-----|-----|
| 3.1 | users سراسری | schema |
| 3.2 | سرویس auth | `server/saas/auth-service.mjs` |
| 3.3 | API register/login/memberships | `server/saas/http-api.mjs` |

**معیار پذیرش:** login برمی‌گرداند `memberships[]` و `accessToken`.

---

## ستون ۴ — API دامنه‌ای

**هدف:** به‌جای dump کل DB، endpointهای دامنه‌ای با `X-Studio-Id`.

| گام | شرح | کد |
|-----|-----|-----|
| 4.1 | Router SaaS | `http-api.mjs` |
| 4.2 | contracts list/create | همان |
| 4.3 | health + version | همان |

**معیار پذیرش:** `GET /api/v2/contracts` فقط داده همان studio.

---

## ستون ۵ — همگام‌سازی و آفلاین

**هدف:** IndexedDB فقط کش tenant فعلی.

| گام | شرح | کد |
|-----|-----|-----|
| 5.1 | StudioContext فرانت | `js/saas-studio-context.js` |
| 5.2 | هدر X-Studio-Id | همان |
| 5.3 | سازگاری با ServerSync قدیمی | تدریجی |

---

## ستون ۶ — فایل، SMS، صف

**هدف:** SMS و فایل خارج از request path اصلی.

| گام | شرح | وضعیت |
|-----|-----|--------|
| 6.1 | SMS از قبل در sync-server | موجود |
| 6.2 | presigned upload | فاز بعد |
| 6.3 | Redis queue | فاز بعد (env) |

---

## ستون ۷ — زیرساخت و امنیت

**هدف:** HTTPS، rate limit، backup، چند instance.

| گام | شرح | کد |
|-----|-----|-----|
| 7.1 | چک‌لیست production | `docs/SAAS_OPS.md` |
| 7.2 | rate limit در API v2 | http-api |
| 7.3 | متغیرهای محیطی | `.env.saas.example` |

---

## ستون ۸ — مهاجرت از سیستم فعلی

**هدف:** JSON tenant → Postgres بدون قطع سرویس ماندنی.

| گام | شرح | کد |
|-----|-----|-----|
| 8.1 | اسکریپت import | `server/saas/migrate-json-tenant.mjs` |
| 8.2 | dual-read اختیاری | فاز بعد |
| 8.3 | cutover | دستی پس از تست |

---

## ترتیب اجرا (اسپرینت)

1. Schema migrate  
2. Auth + memberships API  
3. Contracts API  
4. StudioContext در PWA  
5. Import یک استودیو واقعی  
6. قطع تدریجی JSON master  
