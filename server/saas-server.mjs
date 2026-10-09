#!/usr/bin/env node
/**
 * CRMSTUDIO SaaS API v2 — سرور مستقل چندمستأجری
 * اجرا: DATABASE_URL=... JWT_SECRET=... node server/saas-server.mjs
 * Nginx: location /api/v2/ { proxy_pass http://127.0.0.1:3001; }
 */
import http from 'node:http'
import pg from 'pg'
import { createSaasHandler } from './saas/http-api.mjs'

const PORT = parseInt(process.env.SAAS_PORT || process.env.PORT || '3001', 10)
const DATABASE_URL = process.env.DATABASE_URL || ''

if (!DATABASE_URL) {
  console.error('[SaaS] DATABASE_URL is required')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: parseInt(process.env.PG_POOL_MAX || '20', 10),
  idleTimeoutMillis: 30000
})

const saas = createSaasHandler(pool, {
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production'
})

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || 'localhost'
  let pathname = '/'
  try {
    pathname = new URL(req.url || '/', `http://${host}`).pathname
  } catch { /* */ }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Studio-Id',
      'Access-Control-Max-Age': '86400'
    })
    return res.end()
  }

  try {
    const handled = await saas.handle(req, res, pathname)
    if (!handled) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'not found', path: pathname }))
    }
  } catch (e) {
    console.error('[SaaS]', e)
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'internal' }))
    }
  }
})

server.listen(PORT, () => {
  console.log(`[SaaS API v2] http://127.0.0.1:${PORT}  (Postgres multi-tenant)`)
})

process.on('SIGTERM', async () => {
  await pool.end()
  process.exit(0)
})
