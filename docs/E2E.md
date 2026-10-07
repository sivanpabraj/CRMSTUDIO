# تست‌های E2E — CRMSTUDIO

## اجرا محلی

```bash
npm ci
npm run build
npx playwright install chromium
npx playwright test
```

یا:

```bash
npm run test:e2e
```

## فایل‌ها

| فایل | پوشش |
|------|------|
| `e2e/smoke.spec.js` | لود صفحات اصلی، health، گارد auth |
| `e2e/auth.spec.js` | فرم ورود/ثبت‌نام، اعتبارسنجی، SMS chip |
| `e2e/pwa.spec.js` | manifest، sw.js، ثبت Service Worker |
| `e2e/studio-m.spec.js` | شل Studio M با session inject |
| `e2e/contract.spec.js` | contract / customer / join shells |

## لاگین واقعی (اختیاری)

```bash
E2E_LOGIN_PHONE=0912... E2E_LOGIN_PASSWORD=... npx playwright test e2e/smoke.spec.js
```

## نکات

- اکثر تست‌ها `?nosw=1` می‌زنند تا race مربوط به Service Worker نباشد.
- `studio-m.spec.js` با inject نشست محلی (demo/first-admin) کار می‌کند؛ به OTP واقعی وابسته نیست.
- در CI بعد از `npm run build` اجرا می‌شود.
