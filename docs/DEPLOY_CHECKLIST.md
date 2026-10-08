# چک‌لیست Deploy — CRMSTUDIO

## قبل از آپدیت سرور
1. شاخه مشخص: `eng/auth-login-fix-v1` (یا `main` وقتی merge شد)
2. `APP_VERSION` در `js/config.js` را ببینید

## دستور
```bash
bash scripts/server-update.sh eng/auth-login-fix-v1
```

## بعد از آپدیت
1. Hard Refresh موبایل/دسکتاپ (یا Clear site data برای PWA)
2. ورود **مدیر** → داشبورد studio-m باز شود
3. ورود **پرسنل** → پرتال با منوی پایین (نه صفحه خالی)
4. ورود **مشتری** → سه کارت + دستیار AI
5. Ctrl+K یا ذره‌بین → سرچ سراسری مدیر
6. ساخت/ویرایش قرارداد با نقش پرسنل → آفیش در پرتال پرسنل

## اگر صفحه خالی بود
- کش SW: Application → Service Workers → Unregister
- دوباره `server-update.sh`
