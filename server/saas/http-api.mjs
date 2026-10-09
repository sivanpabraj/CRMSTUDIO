/**
 * API v2 Multi-Tenant — اتصال به Postgres
 * استفاده: import { createSaasHandler } from './http-api.mjs'
 * و در sync-server برای مسیرهای /api/v2/* صدا بزنید
 */
import { createAuthService } from './auth-service.mjs'
import { requireStudio } from './tenant-context.mjs'

export function createSaasHandler(pool, opts = {}) {
  const auth = createAuthService(pool, opts)
  const hits = new Map()

  function rate(ip, max = 60) {
    const now = Date.now()
    const arr = (hits.get(ip) || []).filter((t) => now - t < 60000)
    if (arr.length >= max) return false
    arr.push(now)
    hits.set(ip, arr)
    return true
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8')
          resolve(raw ? JSON.parse(raw) : {})
        } catch (e) {
          reject(e)
        }
      })
      req.on('error', reject)
    })
  }

  function send(res, status, data) {
    const body = JSON.stringify(data)
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Studio-Id',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    })
    res.end(body)
  }

  function bearer(req) {
    const h = req.headers.authorization || ''
    if (h.startsWith('Bearer ')) return auth.verifyAccessToken(h.slice(7).trim())
    return null
  }

  async function handle(req, res, pathname) {
    if (req.method === 'OPTIONS') {
      send(res, 204, {})
      return true
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || ''
    if (!rate(ip)) {
      send(res, 429, { ok: false, error: 'تعداد درخواست زیاد است' })
      return true
    }

    try {
      if (pathname === '/api/v2/health' && req.method === 'GET') {
        let db = false
        try {
          await pool.query('SELECT 1')
          db = true
        } catch { /* */ }
        send(res, 200, { ok: true, service: 'saas-v2', db, version: '1.0.0' })
        return true
      }

      if (pathname === '/api/v2/auth/register-studio' && req.method === 'POST') {
        const body = await readBody(req)
        const result = await auth.registerStudio(body)
        send(res, 201, { ok: true, ...result })
        return true
      }

      if (pathname === '/api/v2/auth/login' && req.method === 'POST') {
        const body = await readBody(req)
        const result = await auth.login(body)
        send(res, 200, result)
        return true
      }

      if (pathname === '/api/v2/auth/memberships' && req.method === 'GET') {
        const claims = bearer(req)
        if (!claims?.sub) {
          send(res, 401, { ok: false, error: 'Unauthorized' })
          return true
        }
        const list = await auth.listMemberships(claims.sub)
        send(res, 200, { ok: true, memberships: list })
        return true
      }

      if (pathname === '/api/v2/contracts' && req.method === 'GET') {
        const claims = bearer(req)
        if (!claims?.sub) {
          send(res, 401, { ok: false, error: 'Unauthorized' })
          return true
        }
        const studioId = requireStudio(req, claims)
        const r = await pool.query(
          `SELECT id, contract_num, bride, groom, couple, phone, event_date, total_price, paid_amount, status, created_at
           FROM contracts WHERE studio_id = $1 ORDER BY created_at DESC LIMIT 200`,
          [studioId]
        )
        send(res, 200, { ok: true, items: r.rows })
        return true
      }

      if (pathname === '/api/v2/contracts' && req.method === 'POST') {
        const claims = bearer(req)
        if (!claims?.sub) {
          send(res, 401, { ok: false, error: 'Unauthorized' })
          return true
        }
        const studioId = requireStudio(req, claims)
        const body = await readBody(req)
        const r = await pool.query(
          `INSERT INTO contracts (studio_id, contract_num, bride, groom, couple, phone, bride_phone, groom_phone, event_date, total_price, paid_amount, status, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [
            studioId,
            body.contractNum || body.contract_num || null,
            body.bride || null,
            body.groom || null,
            body.couple || null,
            body.phone || null,
            body.bridePhone || body.bride_phone || null,
            body.groomPhone || body.groom_phone || null,
            body.eventDate || body.event_date || null,
            Number(body.totalPrice || body.total_price || 0),
            Number(body.paidAmount || body.paid_amount || 0),
            body.status || 'active',
            JSON.stringify(body.payload || body)
          ]
        )
        send(res, 201, { ok: true, item: r.rows[0] })
        return true
      }

      return false
    } catch (e) {
      const status = e.status || 500
      send(res, status, { ok: false, error: e.message || 'error', code: e.code })
      return true
    }
  }

  return { handle, auth }
}
