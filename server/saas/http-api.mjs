/**
 * API v2 Multi-Tenant — فاز B/C + سخت‌سازی امنیتی (membership اجباری)
 */
import { createAuthService } from './auth-service.mjs'
import { requireStudioMember, isUuid } from './tenant-context.mjs'

export function createSaasHandler(pool, opts = {}) {
  const auth = createAuthService(pool, opts)
  const hits = new Map()
  const idem = new Map()

  function rate(key, max = 120) {
    const now = Date.now()
    const arr = (hits.get(key) || []).filter((t) => now - t < 60000)
    if (arr.length >= max) return false
    arr.push(now)
    hits.set(key, arr)
    return true
  }

  function checkIdempotency(key) {
    if (!key) return true
    const now = Date.now()
    if (idem.has(key)) {
      const prev = idem.get(key)
      if (now - prev.at < 120000) return prev.body
    }
    return true
  }

  function storeIdempotency(key, body) {
    if (!key) return
    idem.set(key, { at: Date.now(), body })
    if (idem.size > 5000) {
      const oldest = [...idem.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 1000)
      oldest.forEach(([k]) => idem.delete(k))
    }
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', (c) => {
        size += c.length
        if (size > 1_000_000) {
          reject(Object.assign(new Error('بدنه درخواست بزرگ است'), { status: 413 }))
          return
        }
        chunks.push(c)
      })
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8')
          resolve(raw ? JSON.parse(raw) : {})
        } catch (e) {
          reject(Object.assign(new Error('JSON نامعتبر'), { status: 400 }))
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
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, X-Studio-Id, Idempotency-Key',
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

  function optUuid(v) {
    if (v == null || v === '') return null
    return isUuid(v) ? v : null
  }

  async function handle(req, res, pathname) {
    if (req.method === 'OPTIONS') {
      send(res, 204, {})
      return true
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || ''
    if (!rate('ip:' + ip, 180)) {
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
        send(res, 200, {
          ok: true,
          service: 'saas-v2',
          db,
          version: '2.1.0-hardened',
          features: ['membership-guard', 'idempotency', 'dual-read']
        })
        return true
      }

      if (pathname === '/api/v2/auth/register-studio' && req.method === 'POST') {
        if (!rate('reg:' + ip, 10)) {
          send(res, 429, { ok: false, error: 'ثبت‌نام محدود شده' })
          return true
        }
        const body = await readBody(req)
        const result = await auth.registerStudio(body)
        send(res, 201, { ok: true, ...result })
        return true
      }

      if (pathname === '/api/v2/auth/login' && req.method === 'POST') {
        if (!rate('login:' + ip, 30)) {
          send(res, 429, { ok: false, error: 'تلاش ورود زیاد' })
          return true
        }
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

      const tenantPaths = [
        '/api/v2/contracts',
        '/api/v2/banks',
        '/api/v2/transactions',
        '/api/v2/personnel',
        '/api/v2/afish',
        '/api/v2/studio/snapshot'
      ]
      if (!tenantPaths.includes(pathname)) return false

      const claims = requireAuth(req)
      if (!rate('user:' + claims.sub, 200)) {
        send(res, 429, { ok: false, error: 'محدودیت کاربر' })
        return true
      }
      const { studioId } = await requireStudioMember(pool, req, claims)

      /* Contracts */
      if (pathname === '/api/v2/contracts' && req.method === 'GET') {
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
        const idemKey = req.headers['idempotency-key']
        const cached = checkIdempotency(idemKey)
        if (cached !== true) {
          send(res, 200, cached)
          return true
        }
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
            Math.max(0, Number(body.totalPrice || body.total_price || 0)),
            Math.max(0, Number(body.paidAmount || body.paid_amount || 0)),
            body.status || 'active',
            JSON.stringify(body.payload || body)
          ]
        )
        const out = { ok: true, item: r.rows[0] }
        storeIdempotency(idemKey, out)
        send(res, 201, out)
        return true
      }

      /* Banks */
      if (pathname === '/api/v2/banks' && req.method === 'GET') {
        const r = await pool.query(`SELECT * FROM banks WHERE studio_id = $1 ORDER BY created_at DESC`, [
          studioId
        ])
        send(res, 200, { ok: true, items: r.rows })
        return true
      }

      if (pathname === '/api/v2/banks' && req.method === 'POST') {
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
            Math.max(0, Number(body.balance || 0)),
            JSON.stringify(body.payload || body)
          ]
        )
        send(res, 201, { ok: true, item: r.rows[0] })
        return true
      }

      /* Transactions */
      if (pathname === '/api/v2/transactions' && req.method === 'GET') {
        const r = await pool.query(
          `SELECT * FROM transactions WHERE studio_id = $1 ORDER BY created_at DESC LIMIT 500`,
          [studioId]
        )
        send(res, 200, { ok: true, items: r.rows })
        return true
      }

      if (pathname === '/api/v2/transactions' && req.method === 'POST') {
        const idemKey = req.headers['idempotency-key']
        const cached = checkIdempotency(idemKey)
        if (cached !== true) {
          send(res, 200, cached)
          return true
        }
        const body = await readBody(req)
        const type = body.type === 'withdrawal' ? 'withdrawal' : 'deposit'
        const amount = Math.abs(Number(body.amount || 0))
        if (!amount || !Number.isFinite(amount)) {
          send(res, 400, { ok: false, error: 'مبلغ نامعتبر' })
          return true
        }
        const bankId = optUuid(body.bankId || body.bank_id)
        const contractId = optUuid(body.contractId || body.contract_id)
        const personnelId = optUuid(body.personnelId || body.personnel_id)

        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          if (bankId) {
            const b = await client.query(`SELECT id FROM banks WHERE id=$1 AND studio_id=$2`, [
              bankId,
              studioId
            ])
            if (!b.rows[0]) throw Object.assign(new Error('حساب بانکی متعلق به این استودیو نیست'), { status: 400 })
          }
          if (contractId) {
            const c = await client.query(`SELECT id FROM contracts WHERE id=$1 AND studio_id=$2`, [
              contractId,
              studioId
            ])
            if (!c.rows[0]) throw Object.assign(new Error('قرارداد متعلق به این استودیو نیست'), { status: 400 })
          }
          const r = await client.query(
            `INSERT INTO transactions (studio_id, type, amount, date_jalali, bank_id, contract_id, personnel_id, purpose_category, purpose, client_name, payload)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [
              studioId,
              type,
              amount,
              body.date || body.date_jalali || null,
              bankId,
              contractId,
              personnelId,
              body.purposeCategory || body.purpose_category || null,
              body.purpose || body.notes || null,
              body.client || body.client_name || null,
              JSON.stringify(body.payload || body)
            ]
          )
          if (bankId) {
            const delta = type === 'deposit' ? amount : -amount
            await client.query(`UPDATE banks SET balance = balance + $1 WHERE id = $2 AND studio_id = $3`, [
              delta,
              bankId,
              studioId
            ])
          }
          if (contractId && type === 'deposit') {
            await client.query(
              `UPDATE contracts SET paid_amount = paid_amount + $1, updated_at = now() WHERE id = $2 AND studio_id = $3`,
              [amount, contractId, studioId]
            )
          }
          await client.query('COMMIT')
          const out = { ok: true, item: r.rows[0] }
          storeIdempotency(idemKey, out)
          send(res, 201, out)
        } catch (e) {
          await client.query('ROLLBACK')
          throw e
        } finally {
          client.release()
        }
        return true
      }

      /* Personnel */
      if (pathname === '/api/v2/personnel' && req.method === 'GET') {
        const r = await pool.query(`SELECT * FROM personnel WHERE studio_id = $1 ORDER BY created_at DESC`, [
          studioId
        ])
        send(res, 200, { ok: true, items: r.rows })
        return true
      }

      if (pathname === '/api/v2/personnel' && req.method === 'POST') {
        const body = await readBody(req)
        const roles = Array.isArray(body.roles) ? body.roles : body.role ? [body.role] : []
        const r = await pool.query(
          `INSERT INTO personnel (studio_id, user_id, name, phone, roles, status, payload)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING *`,
          [
            studioId,
            optUuid(body.userId || body.user_id),
            String(body.name || 'همکار').slice(0, 120),
            body.phone || null,
            JSON.stringify(roles),
            body.status || 'active',
            JSON.stringify(body.payload || body)
          ]
        )
        send(res, 201, { ok: true, item: r.rows[0] })
        return true
      }

      /* Afish */
      if (pathname === '/api/v2/afish' && req.method === 'GET') {
        const r = await pool.query(
          `SELECT pp.*, p.name AS personnel_name, c.couple, c.bride, c.groom, c.event_date
           FROM pers_projects pp
           LEFT JOIN personnel p ON p.id = pp.personnel_id AND p.studio_id = pp.studio_id
           LEFT JOIN contracts c ON c.id = pp.contract_id AND c.studio_id = pp.studio_id
           WHERE pp.studio_id = $1
           ORDER BY pp.created_at DESC LIMIT 500`,
          [studioId]
        )
        send(res, 200, { ok: true, items: r.rows })
        return true
      }

      if (pathname === '/api/v2/afish' && req.method === 'POST') {
        const body = await readBody(req)
        const contractId = optUuid(body.contractId || body.contract_id)
        const personnelId = optUuid(body.personnelId || body.personnel_id)
        if (contractId) {
          const c = await pool.query(`SELECT id FROM contracts WHERE id=$1 AND studio_id=$2`, [
            contractId,
            studioId
          ])
          if (!c.rows[0]) {
            send(res, 400, { ok: false, error: 'قرارداد نامعتبر برای این استودیو' })
            return true
          }
        }
        if (personnelId) {
          const p = await pool.query(`SELECT id FROM personnel WHERE id=$1 AND studio_id=$2`, [
            personnelId,
            studioId
          ])
          if (!p.rows[0]) {
            send(res, 400, { ok: false, error: 'پرسنل نامعتبر برای این استودیو' })
            return true
          }
        }
        const r = await pool.query(
          `INSERT INTO pers_projects (studio_id, contract_id, personnel_id, role_id, accepted, payload)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [
            studioId,
            contractId,
            personnelId,
            body.roleId || body.role_id || body.role || null,
            Boolean(body.accepted),
            JSON.stringify(body.payload || body)
          ]
        )
        send(res, 201, { ok: true, item: r.rows[0] })
        return true
      }

      /* Snapshot */
      if (pathname === '/api/v2/studio/snapshot' && req.method === 'GET') {
        const [contracts, banks, transactions, personnel, afish] = await Promise.all([
          pool.query(`SELECT * FROM contracts WHERE studio_id=$1 ORDER BY created_at DESC LIMIT 300`, [studioId]),
          pool.query(`SELECT * FROM banks WHERE studio_id=$1`, [studioId]),
          pool.query(`SELECT * FROM transactions WHERE studio_id=$1 ORDER BY created_at DESC LIMIT 300`, [
            studioId
          ]),
          pool.query(`SELECT * FROM personnel WHERE studio_id=$1`, [studioId]),
          pool.query(`SELECT * FROM pers_projects WHERE studio_id=$1 ORDER BY created_at DESC LIMIT 300`, [
            studioId
          ])
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
