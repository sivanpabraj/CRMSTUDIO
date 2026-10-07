# CRMSTUDIO — Engineering Audit & Scorecard

**تاریخ:** 2026-10-07  
**شاخه:** `eng/pwa-hardening-v1`  
**نسخه نرم‌افزار:** 6.2.x

---

## ۱. دسته‌بندی ضعف‌ها

### A — معماری و ساختار کد (Architecture)
| # | ضعف | شدت |
|---|-----|------|
| A1 | فایل‌های غول‌پیکر (`modules.js` ~91KB، `settings.js` ~90KB، `app.js` ~81KB) | بالا |
| A2 | وابستگی سنگین به globalهای `window` (DB/Auth/SecureDB) | متوسط |
| A3 | پنل legacy (`admin.html`) موازی با Studio M Pro | متوسط |
| A4 | IndexedDB هنوز single-blob (migration v2 فقط در docs) | بالا |

### B — امنیت (Security)
| # | ضعف | شدت |
|---|-----|------|
| B1 | Session HMAC فقط client-side (secret در localStorage) | بالا |
| B2 | استثنای CSRF برای `leads`/`bookings`/`logs` | متوسط |
| B3 | کلید SMS ممکن است هنوز در IndexedDB باقی بماند اگر migrate نشود | متوسط |
| B4 | بدون server-side session validation برای نشست محلی | بالا |

### C — PWA و آفلاین
| # | ضعف | شدت |
|---|-----|------|
| C1 | Service Worker قبلی خودش را unregister می‌کرد | **بحرانی** |
| C2 | Manifest ناقص برای installability (آیکون PNG اجباری) | بالا |
| C3 | بدون استراتژی cache واقعی برای shell/assets | بالا |
| C4 | فونت‌ها از CDN خارجی بدون fallback آفلاین | متوسط |

### D — کیفیت و تست (QA)
| # | ضعف | شدت |
|---|-----|------|
| D1 | پوشش E2E محدود به smoke | متوسط |
| D2 | بدون تست برای conflict resolution در sync | متوسط |
| D3 | TypeScript وجود ندارد روی لایه‌های حساس | پایین |

### E — عملکرد (Performance)
| # | ضعف | شدت |
|---|-----|------|
| E1 | snapshot کامل کل DB هر ۶۰ث | متوسط |
| E2 | رندر جداول بدون virtualization برای داده زیاد | متوسط |

---

## ۲. نمره‌گذاری مهندسی (۱–۱۰)

| حوزه | قبل | هدف بعد از این PR | توضیح |
|------|-----|-------------------|--------|
| **معماری ماژولار** | 5 | 6 | هنوز فایل‌های بزرگ؛ شکستن کامل در فاز بعد |
| **امنیت auth/session** | 6 | 6.5 | HMAC هست ولی secret client-only |
| **SecureDB / CSRF** | 8 | 8 | طراحی خوب؛ استثناها قابل بازبینی |
| **همگام‌سازی ابر** | 7 | 7 | entity + snapshot + realtime |
| **PWA / Offline** | **3** | **8** | SW واقعی + manifest قابل نصب |
| **RTL / UX فارسی** | 9 | 9 | نقطه قوت |
| **مستندات** | 8 | 9 | audit + skills |
| **تست و CI** | 6 | 6.5 | lint+unit+smoke موجود |
| **عملکرد داده** | 5 | 5.5 | single-blob هنوز |
| **قابلیت نگهداری** | 5 | 6 | با audit و skillها بهتر |

**میانگین قبل:** ~۶.۲  
**میانگین هدف این فاز:** ~۷.۱

---

## ۳. اهداف مشخص (Goals) — تک‌به‌تک

### Goal 1 — PWA واقعی (این PR) ✅
- [x] Service Worker با shell cache + SWR برای assets
- [x] حذف unregister عمدی
- [x] Manifest قابل نصب (icons 192/512، shortcuts، dir/lang)
- [x] ثبت SW با scope صحیح و event آپدیت

### Goal 2 — Session hardening (فاز بعد)
- [ ] تولید secret از device-bound material + server challenge
- [ ] یا انتقال session به Supabase JWT-only در production

### Goal 3 — شکستن فایل‌های بزرگ
- [ ] `modules.js` → per-module files تحت `studio-m/js/modules/`
- [ ] `settings.js` → tabs جدا

### Goal 4 — IndexedDB v2
- [ ] اجرای migration plan موجود در `INDEXEDDB_V2_MIGRATION_PLAN.md`

### Goal 5 — پوشش تست
- [ ] E2E: OTP login، contract create، workflow status change
- [ ] Unit: SessionSign verify fail cases

---

## ۴. ایجنت‌های مهندسی فعال

| ایجنت | نقش | سطح |
|-------|-----|------|
| **PWA Engineer** | Service Worker، manifest، installability | Senior FE |
| **Security Sentinel** | Session، CSRF، secrets | Senior Security |
| **Data Architect** | IndexedDB v2، sync OCC | Senior Backend |
| **Modularization Engineer** | شکستن modules/settings | Senior FE |
| **QA Reliability** | Vitest + Playwright coverage | Senior QA |

جزئیات skillها در `.agents/skills/`.

---

## ۵. معیار پذیرش PWA

1. Lighthouse PWA score ≥ 80 روی production build
2. نصب از Chrome/Android بدون هشدار آیکون
3. باز شدن shell بعد از قطع شبکه (حداقل site.html + assets کش‌شده)
4. `?nosw=1` روی localhost SW را خاموش کند
