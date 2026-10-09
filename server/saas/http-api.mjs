/**
 * API v2 Multi-Tenant — فاز B: contracts · banks · transactions · personnel · afish
 */
import { createAuthService } from './auth-service.mjs'
import { requireStudio } from './tenant-context.mjs'

export function createSaasHandler(pool, opts = {}) {
  const auth = createAuthService(pool, opts)
  const hits = new Map()

  function rate(ip, max = 120) {
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

  function requireAuth(req) {
    const claims = bearer(req)
    if (!claims?.sub) {
      const err = new Error('Unauthorized')
      err.status = 401
      throw err
    }
    return claims
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
        send(res, 200, { ok: true, service: 'saas-v2', db, version: '2.0.0-phase-b' })
        return true
      }

      /* ── Auth ── */
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
        const claims = requireAuth(req)
        const list = await auth.listMemberships(claims.sub)
        send(res, 200, { ok: true, memberships: list })
        return true
      }

      /* ── Contracts ── */
      if (pathname === '/api/v2/contracts' && req.method === 'GET') {
        const claims = requireAuth(req)
        const studioId = requireStudio(req, claims)
        const r = await pool.query(
          `SELECT id, contract_num, bride, groom, couple, phone, bride_phone, groom_phone,
                  event_date, total_price, paid_amount, status, payload, created_at, updated_at
           FROM contracts WHERE studio_id = $1 ORDER BY created_at DESC LIMIT 500`,
          [studioId]
        )
        send(res, 200, { ok: true, items: r.rows })
        return true
      }

      if (pathname === '/api/v2/contracts' && req.method === 'POST') {
        const claims = requireAuth(req)
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

      /* ── Banks ── */
      if (pathname === '/api/v2/banks' && req.method === 'GET') {
        const claims = requireAuth(req)
        const studioId = requireStudio(req, claims)
        const r = await pool.query(
          `SELECT * FROM banks WHERE studio_id = $1 ORDER BY created_at DESC`,
          [studioId]
        )
        send(res, 200, { ok: true, items: r.rows })
        return true
      }

      if (pathname === '/api/v2/banks' && req.method === 'POST') {
        const claims = requireAuth(req)
        const studioId = requireStudio(req, claims)
        const body = await readBody(req)
        const r = await pool.query(
          `INSERT INTO banks (studio_id, name, bank_name, account, card, iban, balance, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [
            studioId,
            body.name || null,
            body.bankName || body.bank_name || body.bank || null,
            body.account || null,
            body.card || null,
            body.iban || null,
            Number(body.balance || 0),
            JSON.stringify(body.payload || body)
          ]
        )
        send(res, 201, { ok: true, item: r.rows[0] })
        return true
      }

      /* ── Transactions ── */
      if (pathname === '/api/v2/transactions' && req.method === 'GET') {
        const claims = requireAuth(req)
        const studioId = requireStudio(req, claims)
        const r = await pool.query(
          `SELECT * FROM transactions WHERE studio_id = $1 ORDER BY created_at DESC LIMIT 500`,
          [studioId]
        )
        send(res, 200, { ok: true, items: r.rows })
        return true
      }

      if (pathname === '/api/v2/transactions' && req.method === 'POST') {
        const claims = requireAuth(req)
        const studioId = requireStudio(req, claims)
        const body = await readBody(req)
        const type = body.type === 'withdrawal' ? 'withdrawal' : 'deposit'
        const amount = Math.abs(Number(body.amount || 0))
        if (!amount) {
          send(res, 400, { ok: false, error: 'مبلغ نامعتبر' })
          return true
        }
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const r = await client.query(
            `INSERT INTO transactions (studio_id, type, amount, date_jalali, bank_id, contract_id, personnel_id, purpose_category, purpose, client_name, payload)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [
              studioId,
              type,
              amount,
              body.date || body.date_jalali || null,
              body.bankId || body.bank_id || null,
              body.contractId || body.contract_id || null,
              body.personnelId || body.personnel_id || null,
              body.purposeCategory || body.purpose_category || null,
              body.purpose || body.notes || null,
              body.client || body.client_name || null,
              JSON.stringify(body.payload || body)
            ]
          )
          const bankId = body.bankId || body.bank_id
          if (bankId) {
            const delta = type === 'deposit' ? amount : -amount
            await client.query(
              `UPDATE banks SET balance = balance + $1 WHERE id = $2 AND studio_id = $3`,
              [delta, bankId, studioId]
            )
          }
          if ((body.contractId || body.contract_id) && type === 'deposit') {
            await client.query(
              `UPDATE contracts SET paid_amount = paid_amount + $1, updated_at = now()
               WHERE id = $2 AND studio_id = $3`,
              [amount, body.contractId || body.contract_id, studioId]
            )
          }
          await client.query('COMMIT')
          send(res, 201, { ok: true, item: r.rows[0] })
        } catch (e) {
          await client.query('ROLLBACK')
          throw e
        } finally {
          client.release()
        }
        return true
      }

      /* ── Personnel ── */
      if (pathname === '/api/v2/personnel' && req.method === 'GET') {
        const claims = requireAuth(req)
        const studioId = requireStudio(req, claims)
        const r = await pool.query(
          `SELECT * FROM personnel WHERE studio_id = $1 ORDER BY created_at DESC`,
          [studioId]
        )
        send(res, 200, { ok: true, items: r.rows })
        return true
      }

      if (pathname === '/api/v2/personnel' && req.method === 'POST') {
        const claims = requireAuth(req)
        const studioId = requireStudio(req, claims)
        const body = await readBody(req)
        const roles = Array.isArray(body.roles) ? body.roles : body.role ? [body.role] : []
        const r = await pool.query(
          `INSERT INTO personnel (studio_id, user_id, name, phone, roles, status, payload)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING *`,
          [
            studioId,
            body.userId || body.user_id || null,
            body.name || 'همکار',
            body.phone || null,
            JSON.stringify(roles),
            body.status || 'active',
            JSON.stringify(body.payload || body)
          ]
        )
        send(res, 201, { ok: true, item: r.rows[0] })
        return true
      }

      /* ── Afish / pers_projects ── */
      if (pathname === '/api/v2/afish' && req.method === 'GET') {
        const claims = requireAuth(req)
        const studioId = requireStudio(req, claims)
        const r = await pool.query(
          `SELECT pp.*, p.name AS personnel_name, c.couple, c.bride, c.groom, c.event_date
           FROM pers_projects pp
           LEFT JOIN personnel p ON p.id = pp.personnel_id
           LEFT JOIN contracts c ON c.id = pp.contract_id
           WHERE pp.studio_id = $1
           ORDER BY pp.created_at DESC LIMIT 500`,
          [studioId]
        )
        send(res, 200, { ok: true, items: r.rows })
        return true
      }

      if (pathname === '/api/v2/afish' && req.method === 'POST') {
        const claims = requireAuth(req)
        const studioId = requireStudio(req, claims)
        const body = await readBody(req)
        const r = await pool.query(
          `INSERT INTO pers_projects (studio_id, contract_id, personnel_id, role_id, accepted, payload)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [
            studioId,
            body.contractId || body.contract_id || null,
            body.personnelId || body.personnel_id || null,
            body.roleId || body.role_id || body.role || null,
            Boolean(body.accepted),
            JSON.stringify(body.payload || body)
          ]
        )
        send(res, 201, { ok: true, item: r.rows[0] })
        return true
      }

      /* ── Snapshot for dual-read / cache ── */
      if (pathname === '/api/v2/studio/snapshot' && req.method === 'GET') {
        const claims = requireAuth(req)
        const studioId = requireStudio(req, claims)
        const [contracts, banks, transactions, personnel, afish] = await Promise.all([
          pool.query(`SELECT * FROM contracts WHERE studio_id=$1 ORDER BY created_at DESC LIMIT 300`, [studioId]),
          pool.query(`SELECT * FROM banks WHERE studio_id=$1`, [studioId]),
          pool.query(`SELECT * FROM transactions WHERE studio_id=$1 ORDER BY created_at DESC LIMIT 300`, [studioId]),
          pool.query(`SELECT * FROM personnel WHERE studio_id=$1`, [studioId]),
          pool.query(`SELECT * FROM pers_projects WHERE studio_id=$1 ORDER BY created_at DESC LIMIT 300`, [studioId])
        ])
        send(res, 200, {
          ok: true,
          studioId,
          contracts: contracts.rows,
          banks: banks.rows,
          transactions: transactions.rows,
          personnel: personnel.rows,
          persProjects: afish.rows,
          at: new Date().toISOString()
        })
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
