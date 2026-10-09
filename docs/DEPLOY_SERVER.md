# دیپلوی سرور Mandani

## مسیر استاندارد روی سرور

```bash
cd /var/www/crmstudio
bash scripts/server-update.sh eng/auth-login-fix-v1
```

یا دستی:

```bash
cd /var/www/crmstudio
git fetch origin eng/auth-login-fix-v1
git checkout -B eng/auth-login-fix-v1 origin/eng/auth-login-fix-v1
git reset --hard origin/eng/auth-login-fix-v1
systemctl restart crmstudio-sync 2>/dev/null || true
systemctl reload nginx 2>/dev/null || true
```

سپس در مرورگر: Hard Refresh (یا Clear site data).

## برای نمره ۱۰ عملیاتی

1. HTTPS روی دامنه (نه HTTP Not Secure)
2. `server/sync-server.mjs` فعال + systemctl
3. SMS در تنظیمات استودیو پر باشد
4. یک‌بار ثبت‌نام/ورود تست بعد از clear cache

## امنیت

رمز و IP سرور را در چت عمومی قرار ندهید؛ بعد از دیپلوی رمز را عوض کنید.
