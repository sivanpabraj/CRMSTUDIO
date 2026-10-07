# گزارش ساده — eng/glass-pwa-ux-v2

## شاخه
`eng/glass-pwa-ux-v2` (از روی `eng/pwa-hardening-v1`)

## چه کار شد

1. **اهداف** در `docs/GOALS_GLASS_PWA_V2.md`
2. **تم شیشه‌ای** ارتقا: `studio-m/css/glass-upgrade.css`
3. **KPI کارت‌ها**: `studio-m/js/glass-stats.js` (مدیر / پرسنل / مشتری)
4. **داشبورد نقش‌محور**: `studio-m/js/role-dash.js`
5. **ارسال قرارداد + لاگ**: `js/dispatch-share-log.js` → `contract.shareLog`
6. **PWA**: چک‌لیست + اسکریپت `scripts/patch-index-pwa.sh`
7. **آپدیت سرور**: `docs/SERVER_UPDATE.md`
8. **ایجنت**: `.agents/skills/crmstudio-glass-ux/`

## آپدیت دستی سرور / مک

```bash
git fetch origin
git checkout eng/glass-pwa-ux-v2
git pull origin eng/glass-pwa-ux-v2
npm ci && npm run build   # اگر build لازم است
# یک‌بار برای index.html:
bash scripts/patch-index-pwa.sh .
```

## تم شیشه‌ای
در تنظیمات تم، **Dark Glass** را انتخاب کنید تا `glass-upgrade` روی کارت‌ها دیده شود.

## محدودیت صادقانه
بازنویسی کامل همه تب‌ها (۹۱KB modules + ۵۶KB dashboard) در یک جلسه ممکن نیست؛ اسکلت Design System + shareLog + KPI نقش‌محور پیاده شد تا لایه بعدی روی همین API سوار شود.
