# نتایج تست — eng/pwa-hardening-v1

## ۱. SessionSign (اجرا در sandbox عامل)

| تست | نتیجه |
|-----|--------|
| sign produces sig | PASS |
| version is 2 | PASS |
| verify signed session | PASS |
| reject tampered session | PASS |
| production rejects unsigned | PASS |
| localhost allows unsigned | PASS |

**جمع: ۶/۶ PASS**

## ۲. E2E Playwright (تعریف‌شده؛ اجرا در CI)

| Suite | تعداد تست تقریبی |
|-------|------------------|
| smoke | 6 |
| auth | 7 |
| pwa | 5 |
| studio-m | 4 |
| contract | 3 |
| **جمع** | **~25** |

## ۳. Vitest موجود (از قبل + جدید)

- secure-db, csrf-auth, sync-engine, signed-proof, …
- **جدید:** session-sign.test.js

## ۴. نحوه اجرای کامل روی ماشین شما

```bash
git checkout eng/pwa-hardening-v1
npm ci
npm run lint
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
```
