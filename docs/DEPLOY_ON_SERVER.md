# Deploy روی سرور — تکمیل نهایی

## یک دستور

```bash
cd /var/www/crmstudio   # یا مسیر واقعی اپ
bash scripts/server-update.sh eng/auth-login-fix-v1
systemctl restart crmstudio-sync 2>/dev/null || true
systemctl reload nginx 2>/dev/null || true
```

## تأیید نسخه

در کنسول مرورگر بعد از Hard Refresh:

```js
AppConfig.APP_VERSION   // باید 6.3.0
AppConfig.SW_CACHE      // mandani-studio-v48
__MANDANI_BUILD__
```

## متغیرهای محیطی SMS (اختیاری روی سرور)

```bash
export MELIPAYAMAK_API_KEY='...'
export MELIPAYAMAK_LINE='...'
```

سرویس `crmstudio-sync` از `server/sync-server.mjs` این‌ها را می‌خواند.

## HTTPS

در nginx برای دامنه:

```nginx
listen 443 ssl http2;
# ssl_certificate ...;
# ssl_certificate_key ...;
return 301 https://$host$request_uri;  # روی :80
```

## تست دود

```bash
node scripts/e2e-smoke.mjs
```

سپس دستی: ثبت‌نام → ورود → قرارداد → واریز → برداشت پرسنل → پرتال.
