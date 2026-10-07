# وقتی داخل اپ «به‌روزرسانی» می‌زنید

## مسیر استاندارد سرور

دکمه به‌روزرسانی در تنظیمات معمولاً `scripts/server-update.sh` را صدا می‌زند.

### برای دریافت این فاز (glass + PWA):

روی سرور یک‌بار شاخه را ثابت کنید:

```bash
cd /var/www/crmstudio   # مسیر واقعی
git fetch origin
git checkout eng/glass-pwa-ux-v2
git reset --hard origin/eng/glass-pwa-ux-v2
bash scripts/server-update.sh eng/glass-pwa-ux-v2
```

از این به بعد اگر `server-update.sh` بدون آرگومان اجرا شود، **همان شاخه فعلی** را pull می‌کند.

### اگر دکمه آپدیت فقط `git pull` می‌زند

قبلش سرور باید روی `eng/glass-pwa-ux-v2` باشد:

```bash
git checkout eng/glass-pwa-ux-v2
```

## بعد از آپدیت در مرورگر

1. یک‌بار Hard Refresh (Ctrl+Shift+R) یا Clear site data
2. Application → Service Worker باید فعال باشد
3. تم Dark Glass را از تنظیمات انتخاب کنید تا KPI شیشه‌ای دیده شود

## نسخه

`health.json` و `AppConfig.APP_VERSION` = **6.2.2**
