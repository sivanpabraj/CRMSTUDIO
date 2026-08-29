# راند شمارهٔ ۱ — آمادگی اجرای ۱۴۰۵/۰۶/۰۱

تاریخ ممیزی: ۱۴۰۵/۰۵/۳۱ (2026-08-22)

## ۱. دامنهٔ این راند

نقش‌های فعال: مدیر برنامهٔ مهندسی، معمار تست، مهندس DevOps/SRE و ممیز مستقل. محورهای بررسی: CI/CD، release 1.0.1، تست، E2E، Docker، migration gate، SBOM و شواهد قابل بازتولید.

## ۲. تصمیمات عملیاتی

- نسخهٔ اجرایی باید در `package.json`، lockfile، manifest و health یکسان و دقیقاً `1.0.1` باشد.
- Node 20 از مسیر release حذف و Node 22 الزام شد.
- release بدون بازسازی کامل Supabase local، pgTAP، authenticated E2E، boot container، SBOM و checksum باید fail شود.
- تست source-string شاهد رفتاری محسوب نمی‌شود؛ gate مستقل باید آن را رد کند.

## ۳. تغییرات پیاده‌سازی‌شده

| فایل | تغییر | نقش | وضعیت |
|---|---|---|---|
| `package.json` و `package-lock.json` | نسخه 1.0.1، Node 22، validatorهای release/build/test-quality و SBOM | DevOps/SRE | اجراشده محلی |
| `.github/workflows/ci.yml` | database job واقعی، Node 22، کنترل E2E secrets | معمار تست | فقط syntax review؛ GitHub اجرا نشده |
| `.github/workflows/release.yml` | migration/pgTAP gate، authenticated E2E اجباری، SBOM/checksum و container probe | DevOps/SRE | فقط syntax review؛ GitHub اجرا نشده |
| `Dockerfile` | base imageهای نسخه‌دار و digest-pinned | DevOps/SRE | Docker محلی موجود نبود |
| `scripts/validate-release.mjs` | تطابق version/tag/runtime | DevOps/SRE | PASS |
| `scripts/validate-build.mjs` | artifact completeness، secret-file ban، بودجهٔ موقت bundle | مهندس عملکرد | PASS |
| `scripts/validate-test-quality.mjs` | رد تست‌های source-string | ممیز مستقل | PASS در راند سوم؛ از 18 فایل اولیه به صفر با نگاشت رفتاری |
| `scripts/generate-sbom.mjs` | SPDX 2.3 از lockfile | DevOps/SRE | PASS؛ 180 package |
| `e2e/finance-auth.spec.js` | حذف اتکا به localStorage و ممنوعیت skip در release | معمار تست | browser اجرا نشد |

## ۴. migration و پایگاه داده

`node scripts/validate-repository.mjs` پیوستگی شمارهٔ migrationها را تأیید کرد. اجرای واقعی migration/RLS انجام نشد، زیرا در محیط ممیزی `supabase`، `docker` و `psql` نصب نبودند. بنابراین هر ادعای عبور RLS یا migration در این راند نامعتبر است.

دستور الزامی روی runner:

```bash
supabase start -x studio,mailpit,imgproxy,logflare,vector,supavisor
supabase db reset --local
supabase test db
bash scripts/test-assignment-concurrency.sh
supabase stop --no-backup
```

## ۵. نتایج واقعی تست

| دستور | خروجی واقعی | حکم |
|---|---|---|
| `node scripts/validate-release.mjs` | `release metadata ok — v1.0.1, Node 24.19.0` | PASS؛ runtime محلی در بازهٔ مجاز است |
| `node scripts/validate-repository.mjs` | پیوستگی migrationها PASS | PASS ساختاری، نه اجرای DB |
| `node scripts/security-scan.mjs` | `no committed high-risk secret pattern found` | PASS محدود به scanner |
| `eslint ... --max-warnings 0` | بدون خطا | PASS |
| `vitest run --reporter=verbose` | 51 فایل و 221 تست PASS | PASS عددی؛ شامل تست‌های نمادین است و نمرهٔ کامل ندارد |
| `vite build && copy-static && validate-build` | 132 فایل؛ bundle اولیه 215888 byte؛ PASS | PASS |
| `node scripts/generate-sbom.mjs` | 180 package | PASS |
| `node scripts/validate-test-quality.mjs` | `behavior-test gate ok — no source-string assertions found` در راند سوم | PASS |
| `playwright test` | browser نصب نبود | NOT RUN |
| `supabase db reset --local && supabase test db` | CLI/container موجود نبود | NOT RUN |
| `docker build` و health probe | Docker موجود نبود | NOT RUN |
| `vitest run --coverage` | global: branch 26.38٪، statement 29.22٪، function 32.94٪، line 32.25٪ | FAIL؛ زیر معیار 80٪ core و 90٪ finance/security |

## ۶. گزارش حملهٔ QA

| سناریو | نتیجه | شاهد | وضعیت |
|---|---|---|---|
| release بدون credential واقعی E2E | workflow جدید آن را fail می‌کند | `E2E_REQUIRE_AUTH=1` و secret checks | پیاده‌سازی‌شده، اجرا در GitHub لازم |
| tag ناسازگار با package version | validator آن را fail می‌کند | `scripts/validate-release.mjs` | تست دستی حالت سالم PASS؛ حالت tag باید در Actions اجرا شود |
| migration خراب یا RLS شکسته | database job باید fail کند | `supabase db reset` + pgTAP | اجرا نشده |
| image بالا نمی‌آید | release container probe باید fail کند | curl روی `/health.json` | اجرا نشده |
| تست نمادین نمره را بالا می‌برد | 18 مورد اولیه با import/Playwright/pgTAP جایگزین شد | `docs/TEST_EVIDENCE_MAP.md` و pgTAP plan(52) | بسته در کد؛ اجرای DB هنوز لازم |
| شاخه main بدون hardening منتشر شود | forensic نشان داد main پانزده commit عقب است | `git rev-list` | حمله موفق؛ blocker باز |

## ۷. نمره‌دهی ممیز مستقل

نمرهٔ کل برابر کمترین محور است.

| محور | نمره از ۱۰ | دلیل |
|---|---:|---|
| تست و تضمین کیفیت | 4 | 221 تست سبز است، اما source-string پابرجاست، coverage و mutation report وجود ندارد |
| عملیات و CI/CD | 5 | gateها در کد workflow اضافه شده‌اند ولی اجرای سبز GitHub و Ruleset اثبات نشده |
| release و supply chain | 6 | version/SBOM/build validator موجود است؛ Docker boot و audit runner اجرا نشده |
| migration gate و RLS QA | 3 | local Supabase اجرا نشده؛ ساختار workflow به‌تنهایی شاهد نیست |
| E2E | 2 | browser test اجرا نشده و authenticated staging flow شاهد ندارد |
| مستندات عملیاتی | 7 | guide و forensic به‌روز است؛ runbook بازیابی واقعی و لینک incident drill وجود ندارد |

- نمرهٔ کل: **2 از 10**
- حکم: **رد / NO-LAUNCH برای ۱۴۰۵/۰۶/۰۱**

## ۸. موارد باز به‌ترتیب توقف انتشار

1. اجرای سبز `supabase db reset --local`، pgTAP plan(52) و concurrency test.
2. اجرای E2E واقعی staging با credential manager و بدون هیچ skip.
3. تولید coverage branch واقعی: حداقل 80٪ core و 90٪ finance/security؛ سپس mutation testing guardها.
4. ساخت و boot image و بررسی health/security headers.
5. فعال‌سازی و اثبات GitHub Ruleset و required checks.
6. ادغام شاخهٔ مرجع به main فقط از PR تأییدشده.

هیچ‌یک از موارد NOT RUN را نمی‌توان PASS یا «حل‌شده» اعلام کرد.

## ۹. راند دوم شبکه و deployment

موارد اصلاح‌شده:

- nginx فقط GET/HEAD می‌پذیرد، `server_tokens` خاموش است و cache policy بر اساس نوع asset اعمال می‌شود.
- headerهای COOP/CORP، Permissions Policy و HSTS افزوده و تکرار headerها به snippet مشترک منتقل شد.
- `script-src` مسیرهای login/customer/Studio M فاقد `unsafe-inline` است؛ استثنای legacy فقط برای `site.html` و `contract.html` باقی مانده است.
- `connect-src` از wildcard همهٔ پروژه‌های Supabase به project production محدود شد.
- container job علاوه بر build، `nginx -t`، boot و smoke واقعی headerها را اجرا می‌کند.
- `network-preflight.mjs` صحت DNS، TLS، عمر certificate و redirect دائمی HTTP→HTTPS را کنترل می‌کند.
- `deployment-security-smoke.mjs` سه route، CSP، COOP/CORP و health غیرقابل-cache نسخهٔ 1.0.1 را بررسی می‌کند.
- دو تست رفتاری مثبت/منفی شبکه PASS شدند: `tests/deployment-network-smoke.test.js`.
- manifest آفلاین در build از نظر version، path traversal و وجود تمام assetها اعتبارسنجی می‌شود.

محدودیت: nginx واقعی و TLS production در این runner اجرا نشده‌اند؛ Docker موجود نیست. در نتیجه امتیاز deployment تا اجرای سبز container و production preflight حداکثر ۷ است.

---

# راند شمارهٔ ۲ — اصلاح اضطراری و ممیزی مستقل

## تغییرات این راند

- `js/db.js` و `js/secure-db.js`: persist و startup به‌صورت fail-closed، migration اتمیک با rollback/checksum، defensive copy و انتظار واقعی برای durability.
- `supabase/migrations/037_authoritative_sequence_sync.sql` و `js/sync/*`: sequence سمت سرور، tombstone، idempotency، optimistic revision، cursor از نوع `(updated_seq,id)` و تفکیک صریح مجوز read/write.
- `supabase/migrations/038_sms_trust_boundary_v2.sql` و `supabase/functions/send-sms`: سهمیهٔ پایدار، purpose محدود، completion فقط با service role و محدودیت payload.
- `js/sms.js`: مسیر direct-provider و تنظیم credential از مرورگر حذف شد؛ endpoint فقط از URL پروژهٔ Supabase ساخته می‌شود.
- DB migration محلی v24: credentialهای قدیمی SMS از IndexedDB حذف می‌شوند و تست رفتاری آن افزوده شد.
- `supabase/migrations/039_encrypted_cloud_backup.sql` و `cloud-backup`: AES-256-GCM با AAD، nonce و manifest نسخه‌دار؛ adapter کلاینت به Edge منتقل شد.
- `js/utils.js`: تاریخ/ساعت بر اساس `Asia/Tehran` و تبدیل صحیح round-trip جلالی؛ تست ۳۰ اسفند کبیسه و مرز نیمه‌شب افزوده شد.
- frontend: حذف CDN، lazy loading مسیر، focus trap، reduced motion، PWA manifest نسخه‌دار و cache امن‌تر.
- release: نسخهٔ یکنواخت 1.0.1، tag gate واقعی، SBOM، database/E2E/container gates و health نسخه‌دار.

## شواهد راند دوم قابل اجرا در این محیط

| دستور | خروجی واقعی |
|---|---|
| `eslint ... --max-warnings 0` | PASS |
| `vitest run` | 57 فایل، 242 تست، همگی PASS |
| `vite build` + `copy-static` | PASS؛ offline manifest شامل 131 asset |
| `node scripts/validate-build.mjs` | PASS؛ 135 فایل، 215888 بایت JS اولیهٔ bundle |
| `node scripts/validate-repository.mjs` | PASS؛ 39 migration |
| `node scripts/validate-release.mjs` | PASS؛ v1.0.1 روی Node 24.19.0 |
| `node scripts/security-scan.mjs` | PASS محدود به الگوهای scanner |
| `node scripts/generate-sbom.mjs` | PASS؛ 180 package |
| `node scripts/validate-test-quality.mjs` | FAIL؛ 14 فایل تست source-string |

`supabase db reset --local`، pgTAP، Playwright، axe، Docker boot، coverage و mutation testing در این محیط اجرا نشدند. migrations 037 تا 039 و Edge Function جدید روی production اعمال یا deploy نشده‌اند.

## نمرهٔ ۱۲ محور — ممیز مستقل

| محور | نمره /۱۰ | دلیل محدودیت |
|---|---:|---|
| مرز اعتماد و احراز هویت | **۲** | manager/staff auth، role و OTP هنوز در مرورگر authoritative هستند |
| مجوزدهی و RLS | **۶** | bypass کشف‌شده در 037 اصلاح شد؛ PostgreSQL/pgTAP اجرا نشده |
| صحت و پایداری داده | **۵** | durability محلی تست شد؛ browser هنوز بخشی از منبع حقیقت است |
| صحت مالی و حسابرسی | **۴** | dual-authority و kill-switch محلی باقی است؛ property/DB test کامل نیست |
| همگام‌سازی و همزمانی | **۵** | protocol JS تست شد؛ دو دستگاه/قطع شبکه/Postgres اجرا نشده |
| پشتیبان و بازیابی | **۵** | crypto/tamper سبز؛ Edge round-trip و restore drill اجرا نشده |
| امنیت برنامه و اسرار | **۴** | SMS direct بسته شد؛ XSS/CSP عمومی و inline handler باقی است |
| معماری و نگهداری‌پذیری | **۴** | modularization بهتر شد؛ auth/blob/local authority باقی است |
| عملکرد و مقیاس‌پذیری | **۵** | بودجه اولیه سبز؛ load و p75/p95 واقعی موجود نیست |
| UI/UX و دسترس‌پذیری | **۴** | اصلاحات رفتاری انجام شد؛ Playwright/axe واقعی اجرا نشده |
| تست و QA | **۳** | 242 تست سبز؛ quality gate عمداً به‌علت 14 تست نمادین قرمز است |
| عملیات و CI/CD | **۲** | تغییرات dirty/untracked، main عقب، GitHub CI/Ruleset و deploy اثبات نشده |

- نمرهٔ کل (= کمترین): **۲ از ۱۰**
- حکم: **NO-LAUNCH برای دادهٔ واقعی مشتری یا مالی در ۱۴۰۵/۰۶/۰۱**

## P0های باز

1. `js/auth.js`، `js/first-setup.js`، `js/start.js` و `js/password-reset.js`: هویت، نقش و OTP محلی؛ دست‌کاری IndexedDB/sessionStorage هنوز مرز اعتماد را می‌شکند.
2. مالی هنوز دو منبع حقیقت دارد و الزام server mutation با state محلی قابل تأثیر است.
3. migrationهای 037 تا 039 و Edge جدید بدون اجرای واقعی PostgreSQL، migration reset، pgTAP و staging E2E هستند.
4. 14 تست source-string، اجرای کامل `ci:verify` را عمداً متوقف می‌کنند.
5. CSP عمومی هنوز به `unsafe-inline` وابسته است و `contract.html` inline handlerهای متعدد دارد.

## تصمیم اجرایی برای اول شهریور

- انتشار عمومی یا ورود دادهٔ واقعی: ممنوع.
- pilot داخلی نیز فقط با build جداگانهٔ demo، دادهٔ ساختگی، SMS و مالی غیرفعال، و بدون اتصال به production قابل بررسی است.
- commit/push/PR، migration production و deploy در این ممیزی انجام نشده‌اند و نیازمند مجوز صریح و سپس عبور CI/staging هستند.

---

# راند شمارهٔ ۳ — freeze نسخه و سخت‌سازی شبکه

این بخش آخرین وضعیت است و شمارش‌های راندهای قبلی را supersede می‌کند.

## تغییرات قطعی

- manifest نسخهٔ 1.0.1 روی migration نهایی `042_register_studio_membership_validity.sql` freeze شد.
- pgTAP امنیتی به plan(52) رسید؛ پنج تست SQL نمادین آخر با رفتار واقعی portal/report/trigger/invitation/journal و چهار بررسی رفتاری عضویت منقضی/لغوشده جایگزین شدند.
- quality gate تست نمادین اکنون سبز است و هیچ source-string assertion پیدا نمی‌کند.
- nginx فقط GET/HEAD می‌پذیرد؛ CSP مسیرهای حساس strict، `connect-src` محدود به project production، cache policy نسخه‌پذیر و headerهای COOP/CORP/HSTS/Permissions فعال‌اند.
- nginx برای هر درخواست `X-Request-ID` و access log ساختاریافتهٔ JSON تولید می‌کند.
- CI و release پس از build، container را boot می‌کنند، `nginx -t` می‌زنند و route/header/health را probe می‌کنند.
- همهٔ GitHub Actionها به commit SHA کامل و نسخهٔ مستند pin شده‌اند؛ validator بازگشت به tag شناور را رد می‌کند.
- job امنیتی CI، secret scan را enforce و SBOM را با retention سی‌روزه به‌عنوان artifact ذخیره می‌کند.
- coverage gate در CI/release حداقل 80٪ برای core و 90٪ برای finance/security را enforce و گزارش را حتی هنگام شکست نگهداری می‌کند؛ baseline تمام فایل‌های instrumentشده branch 26.38٪ بود. دامنهٔ سخت‌گیرانه پس از تست‌های تکمیلی به branch کل 38.60٪ رسید، اما auth فقط 11.66٪، `finance-sync` فقط 42.59٪ و Edge indexها صفر هستند؛ gate عمداً قرمز است.
- preflight production، DNS، TLS 1.2+، اعتبار certificate و redirect دائمی HTTPS را بررسی می‌کند.

## شواهد واقعی نهایی این runner

| دستور | خروجی |
|---|---|
| `node scripts/validate-release.mjs` | PASS؛ v1.0.1 و migration نهایی 042 |
| validator با tag اشتباه و branch | هر دو exit=1؛ release فقط از tag دقیق پذیرفته می‌شود |
| `node scripts/validate-repository.mjs` | PASS؛ 42 migration پیوسته |
| `node scripts/validate-test-quality.mjs` | PASS؛ صفر source-string assertion |
| `node scripts/security-scan.mjs` | PASS در دامنهٔ scanner |
| lint کامل app و scripts | PASS؛ صفر warning/error |
| `vitest run` | PASS؛ 57 فایل و 296 تست روی Vitest 4.1.11 |
| build + copy-static | PASS؛ offline manifest شامل 134 asset |
| `node scripts/validate-build.mjs` | PASS با build دارای env معتبر؛ 138 فایل و 210249 بایت JS خام اولیه؛ chunk احراز هویت 54.71KB gzip و زیر بودجهٔ 100KB |
| `node scripts/generate-sbom.mjs` | PASS؛ 151 package |
| `npm audit --audit-level=high` | PASS؛ صفر vulnerability پس از pin مستقیم همهٔ dependencyها |
| تست رفتاری network smoke | PASS؛ success path، CSP attack و HTTP preflight rejection |

## مواردی که هنوز اجرا نشده‌اند

- pgTAP plan(52) و هر 42 migration روی Supabase local؛ CLI/Docker/psql در runner موجود نبود.
- Playwright authenticated و visual E2E؛ browser موجود نبود.
- `nginx -t` و boot image واقعی؛ Docker موجود نبود.
- production DNS/TLS/redirect/header preflight؛ deploy مجاز یا انجام نشده است.
- branch coverage baseline با 26.38٪ و دامنهٔ سخت‌گیرانهٔ نهایی با 38.60٪ global هنوز شکست می‌خورد؛ mutation testing و load واقعی هنوز اجرا نشده‌اند.
- GitHub Actions و Ruleset/branch protection واقعی.

## حکم راند سوم

gateهای unit/lint/build محلی سبز شدند، اما coverage gate عمداً قرمز است؛ شواهد DB/E2E/container/production نیز وجود ندارد.

| محور | نمره /۱۰ |
|---|---:|
| تست و QA محلی | ۴ |
| شبکه/nginx به‌صورت کد | ۷ |
| CI/CD به‌صورت کد | ۷ |
| migration/RLS اجرایی | ۳ |
| E2E اجرایی | ۲ |
| production network evidence | ۲ |

- نمرهٔ کل: **۲ از ۱۰**
- حکم: **NO-LAUNCH تا عبور gateهای خارجی**

---

# راند شمارهٔ ۴ — یکپارچه‌سازی نهایی محلی نسخهٔ 1.0.1

این بخش آخرین شواهد این checkout در تاریخ 2026-08-22 است و اعداد راندهای قبلی را جایگزین می‌کند.

## دامنه و نقش‌ها

نقش‌های فعال: مهندس مرز اعتماد، مهندس مالی، مهندس sync، AppSec/Edge، مهندس شبکه، معمار تست، DevOps/SRE و ممیز مستقل. هیچ threshold یا دامنهٔ coverage کاهش نیافت و هیچ تست رشته‌ای برای افزایش امتیاز اضافه نشد.

## اصلاحات افزوده‌شده در این راند

- `js/finance-sync.js` به ماژول قابل import تبدیل شد و تست‌های مالی مستقیماً همان کد production را اجرا می‌کنند؛ harness مبتنی بر `new Function` حذف شد.
- آزمون‌های رفتاری واریز، برداشت، انتقال بین بانک، rollback، invoice projection، قرارداد، reconciliation و escaping UI افزوده شد.
- Edge Functionهای `send-sms`، `studio-mutate`، `cloud-backup` و `health` به handlerهای قابل تزریق وابستگی تبدیل شدند؛ adapterهای `Deno.serve` نازک باقی ماندند.
- تست Edge، method/CORS/auth/config/body limit/permission/quota/idempotency/provider/expectedVersion/secret absence/backup create-restore را از طریق اجرای handler واقعی بررسی می‌کند.
- تست‌های runtime برای sync، conflict، outbox و observability افزوده شد.
- نقص واقعی redaction در `js/lib/observability.js` اصلاح شد؛ regex قبلی replacement نامعتبر `$1` داشت و می‌توانست نام credential را تخریب کند.

## شواهد بازتولیدپذیر نهایی

| دستور | خروجی واقعی |
|---|---|
| validatorهای repository/release/test-quality/security | PASS؛ 42 migration، v1.0.1، صفر source-string assertion، صفر الگوی secret پرخطر در scanner |
| ESLint کامل | PASS؛ صفر warning/error |
| `vitest run` | PASS؛ **60 فایل و 350 تست** |
| build با public Supabase build config ساختگی | PASS؛ 49 ماژول transform، offline manifest با 134 asset |
| `validate-build` | PASS؛ 138 فایل و 10,442 بایت initial bundled JavaScript |
| `generate-sbom` | PASS؛ 170 package |
| `npm audit --audit-level=high` | PASS؛ صفر vulnerability |
| `git diff --check` | PASS |
| `vitest run --coverage` | 350 تست PASS ولی process با exit 1 به‌علت thresholdهای زیر شکست خورد |

## پوشش نهایی

| دامنه | Statement | Branch | Function | Line | حکم |
|---|---:|---:|---:|---:|---|
| کل دامنهٔ instrumentشده | 57.31٪ | 53.37٪ | 62.26٪ | 59.50٪ | FAIL |
| `js/lib` | 89.01٪ | 81.29٪ | 97.95٪ | 93.21٪ | PASS معیار core 80 |
| `js/sync` | 91.84٪ | 80.05٪ | 89.39٪ | 92.71٪ | PASS معیار core 80 |
| `js/finance-sync.js` | 83.33٪ | 68.17٪ | 73.25٪ | 87.44٪ | FAIL معیار finance 90 |
| auth/cloud/password-reset/unified-login | 14.23٪ | 11.66٪ | 20.10٪ | 15.60٪ | FAIL معیار security 90 |
| security libs | 85.26٪ | 74.86٪ | بالای 90٪ | بالای 90٪ | FAIL statement/branch 90 |
| Edge `cloud-backup` | 100٪ | 90.90٪ | 100٪ | 100٪ | PASS |
| Edge `send-sms` | 100٪ | 94.06٪ | 100٪ | 100٪ | PASS |
| Edge `studio-mutate` | 100٪ | 90.54٪ | 100٪ | 100٪ | PASS |

## موارد خارج از شواهد این runner

- `supabase db reset --local`، pgTAP plan(52)، اجرای migrationهای 037 تا 042 و آزمون RLS با کاربران واقعی اجرا نشد.
- Playwright authenticated، axe و مسیر دو دستگاه در browser واقعی اجرا نشد.
- Docker build/boot، `nginx -t` و smoke روی container واقعی اجرا نشد.
- GitHub Actions، Ruleset، CODEOWNERS enforcement و required checks روی remote اجرا نشد.
- migrations و Edge Functionها روی staging یا production deploy نشدند.
- mutation testing و اندازه‌گیری LCP/INP/CLS/API p95 انجام نشد.

## حکم مهندسی پیش از ممیزی مستقل

نسخهٔ محلی از نظر validator، lint، unit/integration handler tests، build و SBOM منسجم است؛ اما release gate نهایی عمداً قرمز است و شواهد حیاتی DB/RLS/E2E/container/branch-protection وجود ندارد. بنابراین انتشار دادهٔ واقعی مشتری یا مالی تأیید نمی‌شود.
