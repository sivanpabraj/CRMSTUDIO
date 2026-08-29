# Studio M — Deployment Guide

## Local development

```bash
npm install
cp .env.example .env   # optional: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm run dev            # http://localhost:5173/site.html
```

## Production build

```bash
npm run test
npm run lint
npm run build          # output: dist/
npm run validate:build
```

## Docker (nginx)

```bash
docker build -t studio-m:1.1.0 .
docker run --rm -p 127.0.0.1:8080:80 studio-m:1.1.0
# Health: http://localhost:8080/health.json
```

این container فقط origin داخلی HTTP است. پورت 80 آن نباید مستقیماً روی اینترنت منتشر شود. TLS باید روی reverse proxy/load balancer ایران terminate شود و فقط ترافیک شبکهٔ خصوصی را به container بفرستد. در لبه، TLS 1.2/1.3، redirect دائمی HTTP→HTTPS و تمدید خودکار certificate الزامی است. هدر HSTS فقط پس از اثبات HTTPS end-to-end فعال بماند.

پیش از انتشار، آدرس production را بررسی کنید:

```bash
DEPLOYMENT_APP_URL=https://app.example.ir node scripts/network-preflight.mjs
DEPLOYMENT_APP_URL=https://app.example.ir node scripts/deployment-security-smoke.mjs
```

`network-preflight` صحت DNS، handshake معتبر TLS، حداقل ۱۴ روز اعتبار certificate و redirect HTTP→HTTPS را می‌سنجد. در صورت DNS چندمقصدی می‌توان `EXPECTED_DEPLOYMENT_IPS=ip1,ip2` را برای جلوگیری از اشارهٔ اشتباه دامنه تنظیم کرد.

`connect-src` در `docker/nginx.conf` عمداً فقط project production با شناسهٔ `gfzfmecglamyxevvttji` را مجاز می‌کند. استفاده از project جدا برای staging نیازمند config جداگانه و بازاجرای smoke test است؛ wildcard از نوع `*.supabase.co` در production مجاز نیست.

nginx برای هر درخواست `X-Request-ID` می‌سازد و access log را JSON ثبت می‌کند. reverse proxy باید همین header را در پاسخ حفظ کند. برای ثبت IP واقعی، `set_real_ip_from` فقط برای subnet قطعی proxy تنظیم شود؛ اعتماد عمومی به `X-Forwarded-For` ممنوع است.

## Static hosting

برای زیرساخت ایران، `dist/` را روی nginx داخلی یا object storage ایرانی deploy کنید. assetهای اجرایی نباید از CDN خارجی بارگیری شوند.

Required headers (see `docker/nginx.conf`):

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- CSP بدون `unsafe-inline` در `script-src` برای login/customer/Studio M

## Supabase

1. Create project
2. همهٔ migrationهای شماره‌دار و timestamped در `supabase/migrations/` را بدون حذف یا انتخاب گزینشی اعمال کنید. manifest نسخهٔ 1.1.0 زنجیرهٔ شماره‌دار را تا `044_server_authority_and_backup_retirement.sql` و migrationهای ERP timestamped را نیز اعتبارسنجی می‌کند. Migration 044 اگر حتی یک backup plaintext پیدا کند عمداً fail می‌شود؛ ابتدا archive را خارج از browser رمزنگاری و با گزارش تطبیق پاک‌سازی کنید، سپس migration را دوباره اجرا کنید. create، restore و فهرست metadata backup فقط از Edge Function احرازشده عبور می‌کنند؛ `SELECT` مستقیم مرورگر عمداً revoke شده است.
3. Set Auth Site URL → `https://your-domain/studio-m/auth-callback.html` and add the exact staging/production callback URLs to Redirect URLs
4. Under Authentication, enable Phone plus the configured SMS provider. Enable Google/Apple only after registering their production client IDs and secrets in Supabase; never place provider secrets in the frontend.
5. Enable Attack Protection → Leaked Password Protection.
6. Deploy edge function `send-sms`:
   ```bash
   supabase secrets set SMS_PROVIDER=kavenegar SMS_API_KEY=... SMS_LINE_NUMBER=...
   supabase secrets set ALLOWED_ORIGINS=https://your-domain.com
   supabase functions deploy send-sms
   ```
7. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time

Customer attachments stay in the private `studio-files` bucket. Do not make this bucket public. Migration `023` grants access only through contract membership and an append-only message reference.

## CI

GitHub Actions روی push/PR به main، lint، تست واحد، build، smoke load، E2E، ساخت container و بازسازی کامل Supabase local + pgTAP را اجرا می‌کند. انتشار tag بدون تست authenticated، migration gate، SBOM و checksum متوقف می‌شود.

## Security checklist

- [ ] Never commit `.env` or service_role keys
- [ ] Use SMS edge proxy in production (not client-side API keys)
- [ ] Apply migration 005 (manager-only snapshot read)
- [ ] تمام migrationهای شماره‌دار repo اعمال شده و RLS advisor بررسی شده است
- [ ] `supabase db reset --local && supabase test db` بدون skip یا failure سبز است
- [ ] tag دقیقاً `v1.1.0` و نسخهٔ health/manifest/package همگی `1.1.0` هستند
- [ ] E2E واقعی با `E2E_LOGIN_PHONE` و `E2E_LOGIN_PASSWORD` روی staging اجرا شده است
- [ ] image نهایی Docker boot شده و `/health.json` نسخهٔ `1.1.0` برمی‌گرداند
- [ ] Set repository secrets `SUPABASE_DB_URL`, `DEPLOYMENT_HEALTH_URL`, and `DEPLOYMENT_APP_URL`
- [ ] Confirm Google/Apple callback URLs and SMS delivery on staging
- [ ] Confirm Leaked Password Protection is enabled
- [ ] Rotate credentials if ever exposed in chat/logs
