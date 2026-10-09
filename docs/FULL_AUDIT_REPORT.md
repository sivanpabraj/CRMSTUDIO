# گزارش ممیزی کامل CRMSTUDIO

**شاخه:** `eng/auth-login-fix-v1`  
**نسخه پیکربندی:** ~6.2.5  
**نوع بررسی:** ایستا (کد + معماری) — تست runtime روی سرور کاربر جداگانه لازم است

---

## ۱. نقشه درگاه‌ها

| درگاه | فایل | نقش | وضعیت سلامت |
|--------|------|-----|-------------|
| ورود / ثبت‌نام | `index.html` | همه نقش‌ها | ⚠️ شکننده (auth چندلایه) |
| مدیریت | `studio-m/` | مدیر / منشی | ✅ اسکلت قوی، وابستگی به ماژول‌ها |
| پرتال پرسنل | `index.html?view=portal` | پرسنل | ⚠️ وابسته به users+personnel |
| مشتری | `customer.html` | عروس/داماد | ✅ با پک pro |
| عضویت پرسنل | `join.html` | دعوت | ⚠️ اسکریپت حداقلی |
| قرارداد دیجیتال | `contract.html` | صدور | 🔗 لینک از ماژول contracts |

---

## ۲. منوی studio-m (مسیرها vs رندر)

مسیرها در `studio-m/js/core.js` → `getRoutes()`:

| id | گروه | رندر از | ریسک |
|----|------|---------|------|
| dashboard | main | SMDashboard / modules | کم |
| bookings | main | modules.js | کم |
| calendar | main | calendar.js | متوسط — فایل جدا |
| timeline | main | modules.js | کم |
| contracts | business | modules.js | متوسط — لینک contract.html |
| signatures | business | modules.js | متوسط |
| packages | business | modules.js | کم |
| invoices | finance | modules.js | کم |
| accounting | finance | accounting.js | **بالا** — فرم هزینه/پرسنل |
| expenses | finance | modules.js | **تداخل** با accounting |
| reports | finance | reports.js | متوسط |
| employees | hr | employees.js | متوسط |
| attendance | hr | attendance.js | متوسط |
| payroll | hr | payroll.js | متوسط |
| equipment | assets | equipment.js | کم |
| custody | assets | custody.js | کم |
| files | assets | وابسته Cloud | بالا اگر Cloud خاموش |
| media | assets | modules.js | کم |
| workflow | assets | workflow.js | متوسط |
| notifications | comms | modules.js | کم |
| inbox | comms | inbox.js | متوسط |
| messaging | comms | messaging.js | متوسط |
| portal | comms | portal-mgmt.js | متوسط |
| settings | system | settings.js | **بالا** — SMS کلید |
| audit | system | modules.js | کم |
| users | system | modules.js | نیاز manage_users |
| api | system | modules.js | فقط system_admin |

**باگ ساختاری:** اگر `SMModules[route]` تعریف نشده باشد، فقط آیکون puzzle خالی نشان داده می‌شود — خطای واضح به کاربر نمی‌دهد.

---

## ۳. باگ‌ها و مشکلات (اولویت‌دار)

### P0 — بحرانی (ورود / داده)

| # | مشکل | اثر | وضعیت اصلاح |
|---|------|-----|-------------|
| 1 | تشخیص شماره از lookup ولی `Auth.login` فقط users محلی | «شماره ثبت نشده» بعد از ثبت‌نام | تا حدی: auth-server-bridge + eng-auth-db-fix + recover |
| 2 | دیتابیس چنددستگاه بدون API سرور | داده روی یک گوشی، روی دیگری خالی | معماری — نیاز backend |
| 3 | دامنه HTTP (Not Secure) | محدودیت SMS/API/PWA | زیرساخت سرور |
| 4 | کش Service Worker نسخه کهنه | بعد از آپدیت صفحه قدیمی | APP_VERSION + Hard Refresh |

### P1 — عملکرد بخش‌ها

| # | مشکل | محل | جزئیات |
|---|------|-----|--------|
| 5 | فرم هزینه: پرسنل بدون کارت مشخصات | accounting | eng-expense-link اضافه شد |
| 6 | چاپ بدون contractId اگر source≠customer | accounting save | eng-expense-link enrich |
| 7 | `recordContractPayment` async بدون await در UI | contracts.addPayment | ممکن است toast قبل از اتمام |
| 8 | دو سیستم سرچ (global-search.js + eng-global-search) | studio-m | FAB حذف شد؛ هنوز دو موتور |
| 9 | دو پچ روی `Auth.login` | bridge + eng-auth-db-fix | ترتیب لود حساس |
| 10 | Bootstrap `Promise.race` ۲٫۵ثانیه روی initFn | bootstrap.js | ممکن است init نصفه بماند |
| 11 | expenses و accounting هر دو هزینه | منو finance | کاربر گیج می‌شود |
| 12 | آفیش خودکار فقط اگر team/staff روی قرارداد باشد | eng-contract-afish | فرم قرارداد باید فیلد تیم پر کند |

### P2 — کیفیت / UX

| # | مورد |
|---|------|
| 13 | index.html سینما UI ساده‌شده؛ با phone-first جایگزین می‌شود |
| 14 | join.html بدون sms/auth-bridge کامل |
| 15 | مطالبات تراز از paidAmount/prepayment — ممکن با StudioFinance یکی نباشد |
| 16 | roleLabel در core قبل از تعریف در یک شاخه ممکن ReferenceError (باگ بالقوه) |
| 17 | چند استودیو / چند نقش روی یک موبایل هنوز مدل membership کامل ندارد |

---

## ۴. بخش‌به‌بخش — چک‌لیست سلامت

### ۴.۱ ورود و احراز
- [ ] ثبت‌نام با ایمیل اجباری
- [ ] ورود رمز بعد از ثبت‌نام همان دستگاه
- [ ] OTP پیامکی (نیاز SMS تنظیم‌شده)
- [ ] فراموشی رمز
- [ ] کد دعوت پرسنل بدون نام استودیو
- [ ] هدایت مدیر → studio-m ، پرسنل → portal

**ریسک باقی:** اگر users در IndexedDB نوشته نشود ولی studioInfo باشد.

### ۴.۲ داشبورد مدیر
- KPI و کارت‌ها وابسته SMDashboard
- اگر فایل نباشد empty state

### ۴.۳ قراردادها
- لیست + تب پرسنل
- دکمه قرارداد جدید → `../contract.html`
- ثبت واریز از جزئیات قرارداد → FinanceSync (async/await ناقص)

### ۴.۴ حسابداری
- بانک، دفتر، چک، تراز
- واریز/برداشت با دسته‌ها
- **بهبود اخیر:** لینک پرسنل/آلبوم/قرارداد

### ۴.۵ هزینه‌ها (expenses)
- ماژول جدا — احتمال تکرار با برداشت accounting

### ۴.۶ پرسنل / حضور / حقوق
- employees.js منبع لیست
- اتصال به پرتال از طریق personnel + users + invite

### ۴.۷ پرتال پرسنل
- آفیش از persProjects
- بنر آفیش جدید + بریف صبح
- اگر personnel لینک نشده: صفحه خالی تاریخی

### ۴.۸ مشتری
- session + سه کارت pro + فیش + AI
- مالی از StudioFinance

### ۴.۹ پیامک و تنظیمات
- SmsProvider از studioInfo
- بدون کلید: OTP کار نمی‌کند

### ۴.۱۰ AI
- studio-ai-brain / gemini — کلید نباید در فرانت عمومی بماند

---

## ۵. مشکلات داخلی / معماری

1. **Local-first بدون منبع حقیقت واحد** → سینک شکننده  
2. **لایه‌های eng-* روی کد اصلی** → تعمیر سریع اما deb کردن سخت  
3. **نام‌گذاری دوگانه:** employees vs personnel، gallery vs media  
4. **APIهای `/api/auth/*` و `/api/sms/*`** در کلاینت فرض شده؛ اگر روی سرور نباشند silent fail  
5. **SecureDB + DB موازی** — خطر race در flush  

---

## ۶. تست دستی پیشنهادی (دود)

1. Clear site data دامنه  
2. ثبت‌نام مدیر با ایمیل + ورود مجدد  
3. ساخت بانک + قرارداد + واریز  
4. برداشت پرسنل → کارت مشخصات  
5. برداشت چاپ → قرارداد + آلبوم  
6. دعوت پرسنل → پرتال و آفیش  
7. customer.html با شماره قرارداد  
8. Ctrl+K / سرچ بالای پنل  
9. خروج و ورود دوباره بعد از Hard Refresh  

---

## ۷. جمع نمره مهندسی (تخمینی ۱–۱۰)

| حوزه | نمره | توضیح |
|------|------|--------|
| UI/تم | 7.5 | شیشه‌ای نسبتاً یکدست |
| مسیریابی نقش‌ها | 6.5 | EngRouter کمک کرد |
| Auth پایدار | 5.5 | هنوز وابسته دستگاه/کش |
| مالی یکپارچه | 6.5 | FinanceSync خوب؛ فرم‌ها ناقص بودند |
| اتصال پرسنل↔آفیش | 6 | هوک هست؛ فرم تیم قرارداد |
| SMS/OTP | 5 | کد هست؛ تنظیم/HTTPS |
| چنداستودیو/سرور | 3 | نیاز backend واقعی |
| **کل** | **~6.2** | قابل کار برای تک‌استودیو با مراقبت deploy |

---

## ۸. اولویت اصلاح بعدی

1. await کردن FinanceSync در UI قرارداد  
2. یکی کردن expenses با accounting یا برچسب واضح  
3. یک پچ واحد Auth.login  
4. endpointهای auth/sms روی سرور + HTTPS  
5. تست E2E خودکار سه نقش  
