import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'
import { createAuthService } from '../server/saas/auth-service.mjs'
import { resolveStudioId, requireStudio, assertMembership } from '../server/saas/tenant-context.mjs'
import { createSaasHandler } from '../server/saas/http-api.mjs'

// In-Memory Mock PostgreSQL Pool for SaaS v2 Multi-Tenant Testing
function createMockPool() {
  const tables = {
    studios: [],
    users: [],
    memberships: [],
    contracts: [],
    banks: [],
    transactions: [],
    personnel: [],
    pers_projects: []
  }

  function executeQuery(sql, params = []) {
    const s = sql.trim().replace(/\s+/g, ' ')

    if (s.startsWith('SELECT 1')) {
      return { rows: [{ '?column?': 1 }], rowCount: 1 }
    }

    if (s.startsWith('INSERT INTO studios')) {
      const studio = {
        id: crypto.randomUUID(),
        slug: params[0],
        name: params[1],
        phone: params[2],
        email: params[3],
        status: 'active',
        created_at: new Date().toISOString()
      }
      tables.studios.push(studio)
      return { rows: [studio], rowCount: 1 }
    }

    if (s.startsWith('SELECT * FROM users WHERE phone = $1')) {
      const u = tables.users.find((x) => x.phone === params[0])
      return { rows: u ? [u] : [], rowCount: u ? 1 : 0 }
    }
    if (s.startsWith('SELECT * FROM users WHERE email = $1')) {
      const u = tables.users.find((x) => x.email === params[0])
      return { rows: u ? [u] : [], rowCount: u ? 1 : 0 }
    }

    if (s.startsWith('INSERT INTO users')) {
      const user = {
        id: crypto.randomUUID(),
        phone: params[0],
        email: params[1],
        password_hash: params[2],
        password_salt: params[3],
        name: params[4],
        status: 'active',
        must_change_pw: false,
        created_at: new Date().toISOString()
      }
      tables.users.push(user)
      return { rows: [user], rowCount: 1 }
    }

    if (s.startsWith('UPDATE users SET name=')) {
      const user = tables.users.find((x) => x.id === params[2])
      if (user) {
        if (params[0]) user.name = params[0]
        if (params[1]) user.email = params[1]
      }
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 }
    }
    if (s.startsWith('UPDATE users SET last_login_at')) {
      return { rows: [], rowCount: 1 }
    }

    if (s.startsWith('INSERT INTO memberships')) {
      const userId = params[0]
      const studioId = params[1]
      let mem = tables.memberships.find((m) => m.user_id === userId && m.studio_id === studioId)
      if (mem) {
        mem.role = 'studio_manager'
        mem.status = 'active'
      } else {
        mem = {
          id: crypto.randomUUID(),
          user_id: userId,
          studio_id: studioId,
          role: 'studio_manager',
          roles: ['studio_manager'],
          status: 'active',
          title: 'مدیر استودیو',
          created_at: new Date().toISOString()
        }
        tables.memberships.push(mem)
      }
      return { rows: [mem], rowCount: 1 }
    }

    if (s.includes('FROM memberships m') && s.includes('JOIN studios s')) {
      let filtered = tables.memberships
        .map((m) => {
          const sObj = tables.studios.find((st) => st.id === m.studio_id)
          return sObj
            ? {
                ...m,
                studio_name: sObj.name,
                studio_slug: sObj.slug,
                studio_status: sObj.status
              }
            : null
        })
        .filter(Boolean)

      if (params.length === 1) {
        filtered = filtered.filter(
          (r) => r.user_id === params[0] && r.status === 'active' && r.studio_status === 'active'
        )
      } else if (params.length === 2) {
        filtered = filtered.filter((r) => r.user_id === params[0] && r.studio_id === params[1] && r.status === 'active')
      }
      return { rows: filtered, rowCount: filtered.length }
    }

    if (s.startsWith('SELECT id, contract_num') || (s.startsWith('SELECT * FROM contracts') && s.includes('WHERE studio_id = $1'))) {
      const rows = tables.contracts.filter((c) => c.studio_id === params[0])
      return { rows, rowCount: rows.length }
    }
    if (s.startsWith('SELECT id FROM contracts WHERE id=$1 AND studio_id=$2')) {
      const c = tables.contracts.find((x) => x.id === params[0] && x.studio_id === params[1])
      return { rows: c ? [c] : [], rowCount: c ? 1 : 0 }
    }
    if (s.startsWith('INSERT INTO contracts')) {
      const row = {
        id: crypto.randomUUID(),
        studio_id: params[0],
        contract_num: params[1],
        bride: params[2],
        groom: params[3],
        couple: params[4],
        phone: params[5],
        bride_phone: params[6],
        groom_phone: params[7],
        event_date: params[8],
        total_price: params[9],
        paid_amount: params[10],
        status: params[11],
        payload: JSON.parse(params[12] || '{}'),
        created_at: new Date().toISOString()
      }
      tables.contracts.push(row)
      return { rows: [row], rowCount: 1 }
    }

    if (s.startsWith('SELECT * FROM banks WHERE studio_id = $1')) {
      const rows = tables.banks.filter((b) => b.studio_id === params[0])
      return { rows, rowCount: rows.length }
    }
    if (s.startsWith('SELECT id FROM banks WHERE id=$1 AND studio_id=$2')) {
      const b = tables.banks.find((x) => x.id === params[0] && x.studio_id === params[1])
      return { rows: b ? [b] : [], rowCount: b ? 1 : 0 }
    }
    if (s.startsWith('INSERT INTO banks')) {
      const row = {
        id: crypto.randomUUID(),
        studio_id: params[0],
        name: params[1],
        bank_name: params[2],
        account: params[3],
        card: params[4],
        iban: params[5],
        balance: params[6],
        payload: JSON.parse(params[7] || '{}'),
        created_at: new Date().toISOString()
      }
      tables.banks.push(row)
      return { rows: [row], rowCount: 1 }
    }
    if (s.startsWith('UPDATE banks SET balance = balance + $1')) {
      const b = tables.banks.find((x) => x.id === params[1] && x.studio_id === params[2])
      if (b) b.balance = Number(b.balance) + Number(params[0])
      return { rows: b ? [b] : [], rowCount: b ? 1 : 0 }
    }

    if (s.startsWith('SELECT * FROM transactions WHERE studio_id = $1')) {
      const rows = tables.transactions.filter((t) => t.studio_id === params[0])
      return { rows, rowCount: rows.length }
    }
    if (s.startsWith('INSERT INTO transactions')) {
      const row = {
        id: crypto.randomUUID(),
        studio_id: params[0],
        type: params[1],
        amount: params[2],
        date_jalali: params[3],
        bank_id: params[4],
        contract_id: params[5],
        personnel_id: params[6],
        purpose_category: params[7],
        purpose: params[8],
        client_name: params[9],
        payload: JSON.parse(params[10] || '{}'),
        created_at: new Date().toISOString()
      }
      tables.transactions.push(row)
      return { rows: [row], rowCount: 1 }
    }

    if (s.startsWith('SELECT * FROM personnel WHERE studio_id = $1')) {
      const rows = tables.personnel.filter((p) => p.studio_id === params[0])
      return { rows, rowCount: rows.length }
    }
    if (s.startsWith('SELECT id FROM personnel WHERE id=$1 AND studio_id=$2')) {
      const p = tables.personnel.find((x) => x.id === params[0] && x.studio_id === params[1])
      return { rows: p ? [p] : [], rowCount: p ? 1 : 0 }
    }
    if (s.startsWith('INSERT INTO personnel')) {
      const row = {
        id: crypto.randomUUID(),
        studio_id: params[0],
        user_id: params[1],
        name: params[2],
        phone: params[3],
        roles: JSON.parse(params[4] || '[]'),
        status: params[5],
        payload: JSON.parse(params[6] || '{}'),
        created_at: new Date().toISOString()
      }
      tables.personnel.push(row)
      return { rows: [row], rowCount: 1 }
    }

    if (s.startsWith('SELECT pp.*, p.name AS personnel_name') || (s.startsWith('SELECT * FROM pers_projects') && s.includes('WHERE studio_id=$1'))) {
      const rows = tables.pers_projects.filter((x) => x.studio_id === params[0])
      return { rows, rowCount: rows.length }
    }
    if (s.startsWith('INSERT INTO pers_projects')) {
      const row = {
        id: crypto.randomUUID(),
        studio_id: params[0],
        contract_id: params[1],
        personnel_id: params[2],
        role_id: params[3],
        accepted: params[4],
        payload: JSON.parse(params[5] || '{}'),
        created_at: new Date().toISOString()
      }
      tables.pers_projects.push(row)
      return { rows: [row], rowCount: 1 }
    }

    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(s)) {
      return { rows: [], rowCount: 0 }
    }

    return { rows: [], rowCount: 0 }
  }

  const pool = {
    tables,
    query: async (sql, params) => executeQuery(sql, params),
    connect: async () => ({
      query: async (sql, params) => executeQuery(sql, params),
      release: () => {}
    })
  }

  return pool
}

function createMockReqRes({ method = 'GET', url = '/', headers = {}, body = null }) {
  const req = {
    method,
    url,
    headers: { ...headers },
    socket: { remoteAddress: '127.0.0.1' },
    on: (evt, cb) => {
      if (evt === 'data' && body) cb(Buffer.from(JSON.stringify(body)))
      if (evt === 'end') cb()
    }
  }

  let statusCode = 200
  let responseHeaders = {}
  let responseBody = ''

  const res = {
    writeHead: (status, h) => {
      statusCode = status
      responseHeaders = h
    },
    end: (str) => {
      responseBody = str || ''
    },
    get statusCode() { return statusCode },
    get headers() { return responseHeaders },
    get json() {
      try { return JSON.parse(responseBody) } catch { return responseBody }
    }
  }

  return { req, res }
}

describe('SaaS v2 Multi-Tenant E2E Integration Suite', () => {
  let pool
  let auth
  let saasHandler
  const JWT_SECRET = 'test-secret-suite-key-123456789'

  beforeEach(() => {
    pool = createMockPool()
    auth = createAuthService(pool, { jwtSecret: JWT_SECRET })
    saasHandler = createSaasHandler(pool, { jwtSecret: JWT_SECRET })
  })

  describe('Flow 1: Multi-Studio Registration Flow', () => {
    it('registers first studio and creates user and active studio_manager membership', async () => {
      const regRes = await auth.registerStudio({
        studioName: 'استودیو افق',
        managerName: 'علی رضایی',
        phone: '09121112233',
        email: 'ofogh@test.ir',
        password: 'password123'
      })

      expect(regRes.studio.id).toBeDefined()
      expect(regRes.studio.name).toBe('استودیو افق')
      expect(regRes.user.phone).toBe('09121112233')
      expect(regRes.memberships).toHaveLength(1)
      expect(regRes.memberships[0].studioId).toBe(regRes.studio.id)
      expect(regRes.memberships[0].role).toBe('studio_manager')
      expect(regRes.accessToken).toBeDefined()
    })

    it('normalizes Persian phone numbers correctly', async () => {
      const regRes = await auth.registerStudio({
        studioName: 'استودیو نگار',
        phone: '۰۹۱۲۲۲۲۳۳۴۴',
        password: 'password123'
      })
      expect(regRes.user.phone).toBe('09122223344')
    })

    it('rejects passwords shorter than 6 characters with status 400', async () => {
      await expect(
        auth.registerStudio({
          studioName: 'استودیو تست',
          phone: '09123334455',
          password: '123'
        })
      ).rejects.toMatchObject({ status: 400 })
    })

    it('allows same user to register a second studio when existing password matches', async () => {
      const first = await auth.registerStudio({
        studioName: 'استودیو اول',
        managerName: 'مهرداد',
        phone: '09125556677',
        password: 'securePass123'
      })

      const second = await auth.registerStudio({
        studioName: 'استودیو دوم',
        phone: '09125556677',
        password: 'securePass123'
      })

      expect(second.user.id).toBe(first.user.id)
      expect(second.studio.id).not.toBe(first.studio.id)

      const memberships = await auth.listMemberships(first.user.id)
      expect(memberships).toHaveLength(2)
      expect(memberships.map((m) => m.studioId)).toContain(first.studio.id)
      expect(memberships.map((m) => m.studioId)).toContain(second.studio.id)
    })

    it('rejects registering a second studio under existing phone if password is wrong', async () => {
      await auth.registerStudio({
        studioName: 'استودیو اول',
        phone: '09127778899',
        password: 'correctPassword123'
      })

      await expect(
        auth.registerStudio({
          studioName: 'استودیو نفوذی',
          phone: '09127778899',
          password: 'wrongPassword456'
        })
      ).rejects.toMatchObject({ status: 401, code: 'wrong_password_for_existing_account' })
    })
  })

  describe('Flow 2: Login Flow (Single-Membership vs Multi-Membership)', () => {
    it('returns 1 membership for single-studio manager with primary studioId in JWT payload', async () => {
      const reg = await auth.registerStudio({
        studioName: 'تک استودیو',
        phone: '09121001000',
        password: 'passSingle123'
      })

      const loginRes = await auth.login({
        phone: '09121001000',
        password: 'passSingle123'
      })

      expect(loginRes.ok).toBe(true)
      expect(loginRes.memberships).toHaveLength(1)
      expect(loginRes.memberships[0].studioId).toBe(reg.studio.id)

      const payload = auth.verifyAccessToken(loginRes.accessToken)
      expect(payload.sub).toBe(reg.user.id)
      expect(payload.studioId).toBe(reg.studio.id)
    })

    it('returns multiple memberships for multi-studio owner', async () => {
      const phone = '09122002000'
      const pw = 'multiPass123'

      const st1 = await auth.registerStudio({ studioName: 'استودیو شعبه ۱', phone, password: pw })
      const st2 = await auth.registerStudio({ studioName: 'استودیو شعبه ۲', phone, password: pw })

      const loginRes = await auth.login({ phone, password: pw })
      expect(loginRes.ok).toBe(true)
      expect(loginRes.memberships).toHaveLength(2)

      const ids = loginRes.memberships.map((m) => m.studioId)
      expect(ids).toContain(st1.studio.id)
      expect(ids).toContain(st2.studio.id)
    })

    it('rejects disabled accounts with 403 inactive', async () => {
      const reg = await auth.registerStudio({
        studioName: 'استودیو معلق',
        phone: '09123003000',
        password: 'password123'
      })

      const user = pool.tables.users.find((u) => u.id === reg.user.id)
      user.status = 'disabled'

      await expect(
        auth.login({ phone: '09123003000', password: 'password123' })
      ).rejects.toMatchObject({ status: 403, code: 'inactive' })
    })

    it('rejects invalid password with 401 wrong_password', async () => {
      await auth.registerStudio({
        studioName: 'استودیو تست رمز',
        phone: '09124004000',
        password: 'correctPassword'
      })

      await expect(
        auth.login({ phone: '09124004000', password: 'wrongPassword' })
      ).rejects.toMatchObject({ status: 401, code: 'wrong_password' })
    })
  })

  describe('Flow 3: Cross-Tenant Data Isolation Enforcement (assertMembership & 403)', () => {
    let userA, studioA, tokenA
    let userB, studioB, tokenB

    beforeEach(async () => {
      const regA = await auth.registerStudio({
        studioName: 'استودیو الف',
        phone: '09120000001',
        password: 'passUserA123'
      })
      userA = regA.user
      studioA = regA.studio
      tokenA = regA.accessToken

      const regB = await auth.registerStudio({
        studioName: 'استودیو ب',
        phone: '09120000002',
        password: 'passUserB123'
      })
      userB = regB.user
      studioB = regB.studio
      tokenB = regB.accessToken
    })

    it('resolves studio ID from headers, claims, and query parameters', () => {
      const uuid = crypto.randomUUID()
      expect(resolveStudioId({ headers: { 'x-studio-id': uuid } })).toBe(uuid)
      expect(resolveStudioId({ headers: { 'x-tenant-id': uuid } })).toBe(uuid)
      expect(resolveStudioId({ headers: {} }, { studioId: uuid })).toBe(uuid)
      expect(resolveStudioId({ headers: {}, url: `/api/v2/contracts?studioId=${uuid}` })).toBe(uuid)
      expect(resolveStudioId({ headers: {}, url: '/api/v2/contracts?studioId=invalid-not-uuid' })).toBeNull()
    })

    it('requireStudio throws 400 studio_required when studio ID is missing or invalid', () => {
      expect(() => requireStudio({ headers: {} }, {})).toThrowError(/الزامی است/)
    })

    it('assertMembership throws 403 not_member when user does not belong to requested studio', async () => {
      await expect(assertMembership(pool, userA.id, studioB.id)).rejects.toMatchObject({
        status: 403,
        code: 'not_member'
      })
    })

    it('assertMembership throws 403 studio_inactive when studio status is disabled', async () => {
      const sA = pool.tables.studios.find((s) => s.id === studioA.id)
      sA.status = 'suspended'

      await expect(assertMembership(pool, userA.id, studioA.id)).rejects.toMatchObject({
        status: 403,
        code: 'studio_inactive'
      })
    })

    it('HTTP API blocks cross-tenant query: User A cannot read Studio B contracts', async () => {
      pool.tables.contracts.push({
        id: crypto.randomUUID(),
        studio_id: studioB.id,
        contract_num: 'CN-B-101',
        bride: 'شیدا',
        groom: 'بهرام',
        created_at: new Date().toISOString()
      })

      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/api/v2/contracts',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-studio-id': studioB.id
        }
      })

      await saasHandler.handle(req, res, '/api/v2/contracts')
      expect(res.statusCode).toBe(403)
      expect(res.json.code).toBe('not_member')
    })

    it('HTTP API enforces multi-tenant boundary: User A only sees Studio A contracts', async () => {
      pool.tables.contracts.push({
        id: crypto.randomUUID(),
        studio_id: studioA.id,
        contract_num: 'CN-A-001',
        bride: 'مهسا',
        groom: 'آرش',
        created_at: new Date().toISOString()
      })

      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/api/v2/contracts',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-studio-id': studioA.id
        }
      })

      await saasHandler.handle(req, res, '/api/v2/contracts')
      expect(res.statusCode).toBe(200)
      expect(res.json.ok).toBe(true)
      expect(res.json.items).toHaveLength(1)
      expect(res.json.items[0].contract_num).toBe('CN-A-001')
    })

    it('Cross-tenant transaction injection: blocks linking transaction in Studio A to bankId of Studio B', async () => {
      const bankB = {
        id: crypto.randomUUID(),
        studio_id: studioB.id,
        name: 'حساب اختصاصی استودیو ب',
        balance: 50000000
      }
      pool.tables.banks.push(bankB)

      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/v2/transactions',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-studio-id': studioA.id
        },
        body: {
          amount: 5000000,
          type: 'deposit',
          bankId: bankB.id
        }
      })

      await saasHandler.handle(req, res, '/api/v2/transactions')
      expect(res.statusCode).toBe(400)
      expect(res.json.error).toMatch(/حساب بانکی متعلق به این استودیو نیست/)
    })
  })

  describe('Flow 4: Idempotency Enforcement', () => {
    it('returns cached response and prevents duplicate inserts when repeating contract creation with Idempotency-Key', async () => {
      const reg = await auth.registerStudio({
        studioName: 'استودیو امن',
        phone: '09129990011',
        password: 'password123'
      })

      const idemKey = 'idem-req-contract-' + Date.now()
      const payload = {
        contractNum: 'CN-SAFE-10',
        bride: 'رویا',
        groom: 'سامان',
        totalPrice: 25000000
      }

      const first = createMockReqRes({
        method: 'POST',
        url: '/api/v2/contracts',
        headers: {
          authorization: `Bearer ${reg.accessToken}`,
          'x-studio-id': reg.studio.id,
          'idempotency-key': idemKey
        },
        body: payload
      })
      await saasHandler.handle(first.req, first.res, '/api/v2/contracts')
      expect(first.res.statusCode).toBe(201)
      const firstId = first.res.json.item.id

      const second = createMockReqRes({
        method: 'POST',
        url: '/api/v2/contracts',
        headers: {
          authorization: `Bearer ${reg.accessToken}`,
          'x-studio-id': reg.studio.id,
          'idempotency-key': idemKey
        },
        body: payload
      })
      await saasHandler.handle(second.req, second.res, '/api/v2/contracts')
      expect(second.res.statusCode).toBe(200)
      expect(second.res.json.item.id).toBe(firstId)

      const stored = pool.tables.contracts.filter((c) => c.contract_num === 'CN-SAFE-10')
      expect(stored).toHaveLength(1)
    })
  })

  describe('Flow 5: Dual-Read Fallback & Snapshot Hydration', () => {
    beforeEach(() => {
      globalThis.DB = {
        store: {
          contracts: [{ id: 'loc-1', bride: 'آزاده', groom: 'پویا', contractNum: 'LOC-101' }],
          banks: [{ id: 'loc-b1', name: 'صندوق نقدی' }],
          transactions: [],
          personnel: [],
          persProjects: []
        },
        get(t) { return this.store[t] || [] },
        set(t, v) { this.store[t] = v },
        flush: vi.fn().mockResolvedValue(true)
      }
    })

    it('falls back to local DB when SaaS session is absent or offline', async () => {
      await import('../js/saas-studio-context.js')
      await import('../js/saas-dual-read.js')

      globalThis.SaasContext.setSession({ accessToken: '', memberships: [] })

      const res = await globalThis.SaasDual.contracts()
      expect(res.source).toBe('local')
      expect(res.items).toHaveLength(1)
      expect(res.items[0].bride).toBe('آزاده')
    })

    it('returns API data and normalizes snake_case contract fields when online', async () => {
      await import('../js/saas-studio-context.js')
      await import('../js/saas-dual-read.js')

      const studioId = crypto.randomUUID()
      globalThis.SaasContext.setSession({
        accessToken: 'mock-valid-token',
        memberships: [{ studioId, studioName: 'استودیو آنلاین' }]
      })
      globalThis.SaasContext.setStudioId(studioId)

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          items: [
            {
              id: 'rem-1',
              contract_num: 'API-999',
              bride: 'لیلا',
              groom: 'کیوان',
              total_price: '40000000',
              paid_amount: '15000000'
            }
          ]
        })
      })

      const res = await globalThis.SaasDual.contracts()
      expect(res.source).toBe('api')
      expect(res.items).toHaveLength(1)
      expect(res.items[0].contractNum).toBe('API-999')
      expect(res.items[0].totalPrice).toBe(40000000)
      expect(res.items[0].paidAmount).toBe(15000000)
    })

    it('gracefully falls back to local DB if fetch throws a network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network connection failed'))

      const res = await globalThis.SaasDual.contracts()
      expect(res.source).toBe('local')
      expect(res.items).toHaveLength(1)
      expect(res.items[0].id).toBe('loc-1')
    })
  })

  describe('Flow 6: Dynamic Studio Title & White-Labeling Cascade', () => {
    let elements

    beforeEach(() => {
      elements = {
        'auth-hero-accent-text': { textContent: '' },
        'auth-hero-badge-text': { textContent: '' },
        'auth-title-text': { textContent: '' },
        'login-btn': { innerHTML: '', dataset: {} },
        'auth-home-link': { innerHTML: '' }
      }

      const mockDoc = {
        readyState: 'complete',
        title: '',
        getElementById: (id) => elements[id] || null,
        addEventListener: vi.fn()
      }

      vi.stubGlobal('document', mockDoc)
      vi.stubGlobal('window', {
        location: { search: '' },
        localStorage: {
          store: {},
          getItem(k) { return this.store[k] || null },
          setItem(k, v) { this.store[k] = v }
        }
      })
    })

    it('Priority 1: Uses ?studio= URL parameter over all other sources', async () => {
      window.location.search = '?studio=%D8%A7%D8%B3%D8%AA%D9%88%D8%AF%DB%8C%D9%88%20%D8%A7%D9%84%D9%85%D8%A7%D8%B3'
      window.localStorage.setItem(
        'saas_memberships',
        JSON.stringify([{ studioId: 's1', studioName: 'استودیو زمینه' }])
      )
      window.localStorage.setItem('saas_current_studio_id', 's1')

      await import('../js/title-bootstrap.js?p1')

      expect(document.title).toBe('ورود — استودیو الماس')
      expect(elements['auth-hero-accent-text'].textContent).toBe('استودیو الماس')
      expect(elements['auth-title-text'].textContent).toBe('ورود به استودیو الماس')
    })

    it('Priority 2: Falls back to active SaaS membership name when no URL query is present', async () => {
      window.location.search = ''
      window.localStorage.setItem(
        'saas_memberships',
        JSON.stringify([
          { studioId: 's-active', studioName: 'استودیو پرواز' }
        ])
      )
      window.localStorage.setItem('saas_current_studio_id', 's-active')

      await import('../js/title-bootstrap.js?p2')

      expect(document.title).toBe('ورود — استودیو پرواز')
      expect(elements['auth-hero-accent-text'].textContent).toBe('استودیو پرواز')
    })

    it('Priority 3 & Default Fallback: Uses default title when no customizations exist', async () => {
      window.location.search = ''
      window.localStorage.store = {}

      await import('../js/title-bootstrap.js?p4')

      expect(document.title).toBe('ورود به سامانه مدیریت استودیو')
      expect(elements['auth-hero-accent-text'].textContent).toBe('سامانه مدیریت استودیو')
    })
  })
})
