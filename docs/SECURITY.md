# امنیت — Studio M

## کلیدها

| کلید | کجا | مجاز در client؟ |
|------|-----|------------------|
| **anon** (Supabase) | `.env` → `VITE_SUPABASE_ANON_KEY` | ✅ بله (RLS محافظت می‌کند) |
| **service_role** | فقط Supabase Dashboard / سرور | ❌ **هرگز** در اپ، git، چat |
| **SMS API key** | Supabase Edge Function secrets | ❌ نه در IndexedDB production |

### اگر service_role لو رفت

1. Supabase Dashboard → Settings → API → **Regenerate service_role key**
2. کلید قدیمی را از همه جا حذف کن
3. `.env` را بررسی کن — فقط anon باشد

## فاز ۰ (پیاده‌شده)

- `SM.guard()` — Studio M بدون login باز نمی‌شود
- `Utils.safeRedirectPath()` — جلوگیری از open redirect
- RLS snapshot — فقط `studio_manager` می‌نویسد (`002_snapshot_manager_rls.sql`)
- Cloud push — خطا toast می‌شود (نه silent)
- Factory reset — نیاز به رمز فعلی مدیر

## فاز ۱ (پیاده‌شده)

- Vitest — `tests/security-paths.test.js`
- GitHub Actions — lint + test + build + Docker build
- Edge Function — `supabase/functions/send-sms` (پراکسی SMS)
- Auth UX — توضیح جدا بودن رمز local و Supabase در تنظیمات

## SMS پراکسی (production)

1. Deploy function:
   ```bash
   supabase secrets set SMS_PROVIDER=kavenegar SMS_API_KEY=xxx SMS_LINE_NUMBER=xxx
   supabase functions deploy send-sms
   ```
2. در Studio M → تنظیمات → SMS → **URL پراکسی**:
   `https://YOUR_PROJECT.supabase.co/functions/v1/send-sms`
3. کلید API را از IndexedDB حذف کن — فقط پراکسی

## فاز ۳ (پیاده‌شده)

- Realtime sync — `js/sync/realtime.js` + migration 004
- Conflict UI — `studioInfo.syncConflicts` + settings
- CSRF bound to userId — `js/lib/csrf.js` + `auth.js`
- Auth unify — `cloudUnifyPassword` + `AuthBridge.unifyPassword`
- File storage — `js/file-storage.js` + bucket `studio-files`

## فاز ۴ — سخت‌گیری امنیتی (پیاده‌شده)

| لایه | فایل | نقش |
|------|------|-----|
| HMAC proof | `js/lib/signed-proof.js` | امضای OTP login، verify قرارداد |
| نشست مشتری | `js/customer-session.js` | HMAC روی token نشست |
| نشست پرسنل | `js/session-sign.js` | HMAC-SHA256 روی session محلی |
| OTP پرسنل | `auth.js` + `unified-login.js` | proof امضاشده قبل از `loginWithOtp` |
| نوشتن DB | `secure-db.js` | CSRF روی set/insert/update/**delete** |
| Sync | `js/sync/engine.js` | cursor + pagination (۵۰۰ ردیف) |
| SMS edge | `send-sms/index.ts` | rate limit، اعتبارسنجی phone/text |
| RLS قرارداد | `006_contracts_manager_rls.sql` | فقط manager می‌نویسد |
| OTP پرتال | `portal-invite.js` | hash OTP (نه plain-text) |
| Deploy | `.dockerignore`, `docker/nginx.conf`, CI | CSP، build ایزوله |

### Migration 006

در SQL Editor اجرا کن:

```
supabase/migrations/006_contracts_manager_rls.sql
```

## محدودیت‌های باقی‌مانده

- Session محلی هنوز client-side است (HMAC سرور-side کامل نیست)
- پول آفلاین در حالت SaaS مسدود است تا outbox پیاده شود ([ADR](./ADR_OFFLINE_FINANCE_OUTBOX.md))
- Ledger سروری هنوز accept-log است نه double-entry کامل
- CSP: `/studio-m/` بدون script `unsafe-inline`؛ صفحات کلاسیک هنوز `unsafe-inline` دارند (خارج از مسیر عمومی)
- E2E مالی authenticated با `E2E_LOGIN_PHONE` / `E2E_LOGIN_PASSWORD` (در CI در صورت نبودن secret اسکیپ می‌شود)
- سقف امتیاز SaaS: [`docs/QUALITY_SCORES.md`](./QUALITY_SCORES.md)

## فاز SaaS P0 (پیاده‌شده)

| لایه | نقش |
|------|-----|
| `mutateRequiredWhenOnline` | قبل از commit محلی پول، Edge را await می‌کند |
| `008_studio_ledger_entries.sql` | accept-log ledger با idempotency |
| `studio-mutate` | membership روی `roles[]` + audit + ledger |
| Classic | فقط break-glass SignedProof؛ بدون لینک عمومی Pro |
| Tenant spoof | `studioId` باید membership فعال باشد |

## Migration 002

در SQL Editor اجرا کن:

```
supabase/migrations/002_snapshot_manager_rls.sql
```
