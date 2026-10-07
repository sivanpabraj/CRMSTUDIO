---
name: crmstudio-pwa
description: >-
  Use this skill when working on Progressive Web App features for CRMSTUDIO:
  service worker, offline cache, manifest, install prompts, and update UX.
  Senior frontend / platform engineering level.
---

# CRMSTUDIO PWA Engineer (Senior)

## مسئولیت‌ها
- Service Worker (`sw.js`) باید shell را offline نگه دارد و API را cache نکند.
- هرگز `registration.unregister()` را در activate نگذار مگر migration عمدی.
- Manifest باید آیکون PNG 192 و 512، `dir: rtl`، `lang: fa` داشته باشد.
- روی localhost با `?nosw=1` امکان غیرفعال کردن SW وجود داشته باشد.

## استراتژی کش
| نوع درخواست | استراتژی |
|-------------|----------|
| Navigation / HTML | Network-first + fallback shell |
| JS/CSS/fonts/images | Stale-while-revalidate |
| Supabase / `/api/` / Edge Functions | Network-only (بدون cache) |
| POST/PUT/DELETE | بدون intercept |

## قوانین مهندسی
1. CACHE_VERSION را با هر deploy که shell تغییر می‌کند افزایش بده.
2. در activate فقط کش‌های قدیمی `studio-erp-*` را پاک کن.
3. فونت‌های حیاتی را در صورت امکان self-host کن تا آفلاین کامل شود.
4. رویداد `crmstudio:sw-update` را برای UI آپدیت نگه دار.
5. Scope ثبت SW در `/studio-m/` باید `../` باشد.

## تست پذیرش
- قطع شبکه → `site.html` از cache لود شود.
- Lighthouse: Installable + offline shell.
- DevTools → Application → Service Workers: status activated.
