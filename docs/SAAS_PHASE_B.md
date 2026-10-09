# فاز B — دامنه کامل API + Dual-read

## اهداف

| هدف | معیار Done |
|-----|------------|
| بانک‌ها | GET/POST `/api/v2/banks` |
| تراکنش‌ها | GET/POST + آپدیت balance/paid |
| پرسنل | GET/POST `/api/v2/personnel` |
| آفیش | GET/POST `/api/v2/afish` |
| Snapshot | GET `/api/v2/studio/snapshot` |
| Dual-read کلاینت | `SaasDual.*` با fallback محلی |

## Endpoints جدید

```
GET/POST  /api/v2/banks
GET/POST  /api/v2/transactions
GET/POST  /api/v2/personnel
GET/POST  /api/v2/afish
GET       /api/v2/studio/snapshot
```

همه نیاز به `Authorization: Bearer` و `X-Studio-Id` دارند.

## کلاینت

```js
const { source, items } = await SaasDual.contracts()
await SaasDual.hydrateLocalFromSnapshot()
```

## بعد از فاز B

- وصل تدریجی فرم‌های accounting.js به `SaasDual.createTransaction`
- گسترش migrate-json برای banks/tx/personnel
- فاز C: cutover و حذف master بودن JSON
