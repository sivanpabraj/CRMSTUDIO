# به‌روزرسانی دستی سرور / مک (Apple)

شاخه: **`eng/glass-pwa-ux-v2`**

## روی سرور Linux

```bash
cd /path/to/CRMSTUDIO   # مسیر واقعی پروژه روی سرور
git fetch origin
git checkout eng/glass-pwa-ux-v2
git pull origin eng/glass-pwa-ux-v2

# اگر از Vite build استفاده می‌کنید:
npm ci
npm run build

# ریستارت سرویس (نمونه)
# systemctl restart nginx
# یا pm2 restart crmstudio
```

## روی مک (توسعه محلی)

```bash
cd ~/path/to/CRMSTUDIO
git fetch origin
git checkout eng/glass-pwa-ux-v2
git pull
npm ci
npm run dev
# یا
npm run build && npm run preview
```

## بعد از deploy — چک PWA
1. Chrome DevTools → Application → Manifest (باید بدون خطا باشد)
2. Service Workers → باید `sw.js` فعال باشد (نه unregister)
3. اگر کش قدیمی ماند: Application → Clear storage یک‌بار

## اسکریپت کمکی
اگر `scripts/server-update.sh` دارید:
```bash
bash scripts/server-update.sh eng/glass-pwa-ux-v2
```

## نکات امنیتی
- `.env` و کلید Supabase را commit نکنید
- بعد از pull فقط static/build را سرو کنید
