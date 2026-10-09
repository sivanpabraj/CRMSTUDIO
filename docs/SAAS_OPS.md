# عملیات Production (ستون ۷)

## متغیرها (`.env`)

```bash
DATABASE_URL=postgresql://crmstudio:SECRET@127.0.0.1:5432/crmstudio
JWT_SECRET=long-random-string
MELIPAYAMAK_API_KEY=
MELIPAYAMAK_LINE=
PORT=3000
```

## Postgres

```bash
sudo -u postgres createuser crmstudio
sudo -u postgres createdb -O crmstudio crmstudio
bash server/schema/migrate.sh
```

## وابستگی Node

```bash
npm install pg
```

## اتصال API v2 به sync-server

در ابتدای handler اصلی:

```js
import pg from 'pg'
import { createSaasHandler } from './saas/http-api.mjs'
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null
const saas = pool ? createSaasHandler(pool) : null
// داخل request:
if (saas && pathname.startsWith('/api/v2/')) {
  const done = await saas.handle(req, res, pathname)
  if (done) return
}
```

## امنیت

- HTTPS اجباری
- JWT_SECRET قوی
- backup روزانه `pg_dump`
- rate limit (در http-api هست)
