اطلاعات پروژه برای ساخت README.md:

هویت
فیلد	مقدار
نام
Studio M (پلتفرم مدیریت استودیو MAN)
نسخه
6.0.0 (package.json)
نوع
ERP/CRM استودیو عکاسی و فیلمبرداری
زبان UI
فارسی، RTL
معماری
Offline-first PWA — Vanilla JS + IndexedDB + اختیاری Supabase
مجوز
Private
هدف محصول
مدیریت استودیو: قرارداد، تقویم، مالی، پرسنل، تجهیزات، تدوین، پیامک، پورتال مشتری — کار آفلاین، همگام‌سازی ابری اختیاری.

صفحات ورود / خروجی
فایل	نقش
site.html
لندینگ
start.html
راه‌اندازی اول (ساخت استودیو + مدیر)
index.html
ورود یکپارچه
studio-m/index.html
پنل Pro (ERP اصلی)
admin.html
پنل کلاسیک (legacy)
contract.html
قرارداد / فاکتور
customer.html + customer-login.html
پورتال مشتری
join.html
پیوستن با کد استودیو
dist/
خروجی build برای سرو استاتیک
ماژول‌های Studio M Pro
اصلی: داشبورد، رزرو، تقویم، تایم‌لاین
کسب‌وکار: قراردادها، پکیج‌ها
مالی: فاکتور، حسابداری، هزینه، گزارش
منابع انسانی: پرسنل، حضور، حقوق
دارایی: تجهیزات، امانت، فایل، گردش کار تدوین
ارتباطات: اعلان، اینباکس، پیامک، پرتال
سیستم: تنظیمات، ممیزی، کاربران، API
داده و ابر
محلی: IndexedDB talar_studio_v5 (~۴۴ کالکشن)
نشست: sessionStorage + امضای HMAC در production
ابر: Supabase Auth + entity sync + snapshot + Realtime + RLS چندمستأجری
SMS: Edge Function send-sms — پشتیبانی melipayamak (کنسول/کلاسیک)، kavenegar، sms.ir، farazsms
اجرا
npm install
npm run dev       # Vite → معمولاً http://localhost:5173/site.html
npm run build     # خروجی dist/
npm run preview
npm run test      # Vitest
npm run lint
npm run test:e2e  # Playwright
Docker:

docker build -t studio-m .
docker run -p 8080:80 studio-m
جایگزین محلی بدون Vite: سرو dist/ روی پورت ۸۰۸۰.

متغیرهای محیطی (بدون مقدار واقعی)
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SMS_PROXY_URL
Secrets سرور: SMS_PROVIDER, SMS_API_KEY, SMS_LINE_NUMBER, اختیاری SMS_USERNAME, ALLOWED_ORIGINS
نمونه: .env.example

ساختار پوشه‌ها
مسیر	توضیح
studio-m/
پنل Pro
js/
DB، auth، cloud، SMS، sync
css/, icons/
استایل و آیکون
supabase/
migrations + Edge Functions
docs/
ARCHITECTURE، DEPLOYMENT، SUPABASE_SETUP، SECURITY، PHASE*
scripts/
build/copy + deploy SMS
tests/, e2e/
تست
نکات امنیتی مهم برای README
کلید SMS فقط روی سرور (Edge Secret)، نه در UI کلاینت production
Snapshot قبل از آپلود sanitize می‌شود
ورود محلی ≠ ورود Supabase Auth (برای SMS پراکسی هر دو لازم است)
demo فقط روی localhost با ?demo=1
مستندات موجود
docs/ARCHITECTURE.md
docs/DEPLOYMENT.md
docs/SUPABASE_SETUP.md
docs/SECURITY.md
docs/SMS_DEFERRED.md (قدیمی‌تر؛ SMS الان فعال‌تر شده)
