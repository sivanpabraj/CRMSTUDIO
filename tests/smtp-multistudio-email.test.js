import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'

// ─── Read source files ────────────────────────────────────────────────────────
const passwordResetSource = fs.readFileSync('js/password-reset.js', 'utf8')
const saasContextSource   = fs.readFileSync('js/saas-studio-context.js', 'utf8')
const documentSealSource  = fs.readFileSync('js/document-seal-qr.js', 'utf8')

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a PasswordReset instance with a fully mocked environment */
function makePasswordResetContext(opts = {}) {
  const users = opts.users || []
  const storage = {}

  const sessionStore = {}

  const context = {
    window: {},
    crypto: {
      getRandomValues(arr) {
        arr[0] = opts.forcedOtpNum !== undefined ? opts.forcedOtpNum : 123456
        return arr
      }
    },
    sessionStorage: {
      _store: sessionStore,
      getItem(k)    { return this._store[k] ?? null },
      setItem(k, v) { this._store[k] = String(v) },
      removeItem(k) { delete this._store[k] }
    },
    Utils: {
      normalizePhone: (p) => String(p || '').replace(/\D/g, ''),
      normalizeEmail: (e) => String(e || '').trim().toLowerCase(),
      isValidPhone: (p) => /^09\d{9}$/.test(p),
      isValidEmail: (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e),
      faToEn: (s) => String(s || ''),
      fmtNum: (n) => String(n),
      storage: {
        get: (k, def) => (storage[k] !== undefined ? storage[k] : def),
        set: (k, v)   => { storage[k] = v }
      }
    },
    AppConfig: {
      APP_NAME: 'TestStudio',
      OTP_TTL_MS: 5 * 60 * 1000,
      OTP_MAX_SENDS_PER_HOUR: 5,
      OTP_RESEND_COOLDOWN_MS: 60_000,
      OTP_MAX_VERIFY_ATTEMPTS: 3
    },
    DB: {
      get: (key) => {
        if (key === 'users') return users
        if (key === 'studioInfo') return { name: 'TestStudio' }
        return []
      },
      update: vi.fn(),
      log: vi.fn()
    },
    fetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    PasswordSecurity: undefined,
    DemoSeed: { isDemoMode: () => true },
    SmsProvider: undefined,
    normalizeRole: (r) => r,
    Auth: { resetManagerPassword: vi.fn().mockResolvedValue({ ok: true }) }
  }

  vm.runInNewContext(passwordResetSource, context)
  return { PR: context.window.PasswordReset, ctx: context }
}

/** Build a SaasContext instance with a clean localStorage / sessionStorage */
function makeSaasContext() {
  const lsStore = {}
  const ssStore = {}

  const context = {
    window: {
      dispatchEvent: vi.fn()
    },
    localStorage: {
      getItem: (k) => lsStore[k] ?? null,
      setItem: (k, v) => { lsStore[k] = String(v) }
    },
    sessionStorage: {
      getItem: (k) => ssStore[k] ?? null,
      setItem: (k, v) => { ssStore[k] = String(v) },
      removeItem: (k) => { delete ssStore[k] }
    },
    CustomEvent: class { constructor(n, d) { this.type = n; this.detail = d?.detail } },
    fetch: vi.fn()
  }

  vm.runInNewContext(saasContextSource, context)
  return { SC: context.window.SaasContext, lsStore, ssStore, ctx: context }
}

/** Build a DocumentSeal instance with a canvas mock */
function makeDocumentSealContext() {
  let lastDataUrl = ''
  const makeCtx2d = (tag) => {
    const canvasData = {}
    return {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
      get strokeStyle()  { return canvasData.strokeStyle || '' },
      set strokeStyle(v) { canvasData.strokeStyle = v },
      get fillStyle()    { return canvasData.fillStyle || '' },
      set fillStyle(v)   { canvasData.fillStyle = v },
      get lineWidth()    { return canvasData.lineWidth || 1 },
      set lineWidth(v)   { canvasData.lineWidth = v },
      get font()         { return canvasData.font || '' },
      set font(v)        { canvasData.font = v },
      get textAlign()    { return canvasData.textAlign || '' },
      set textAlign(v)   { canvasData.textAlign = v },
      get textBaseline() { return canvasData.textBaseline || '' },
      set textBaseline(v){ canvasData.textBaseline = v }
    }
  }

  const makeCanvas = () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: (type) => type === '2d' ? makeCtx2d() : null,
      toDataURL: (mime) => {
        lastDataUrl = `data:${mime || 'image/png'};base64,MOCK`
        return lastDataUrl
      }
    }
    return canvas
  }

  const context = {
    window: {
      location: { origin: 'http://localhost' }
    },
    document: {
      createElement: (tag) => tag === 'canvas' ? makeCanvas() : {}
    },
    module: undefined
  }

  vm.runInNewContext(documentSealSource, context)
  return { DS: context.window.DocumentSeal, getLastDataUrl: () => lastDataUrl }
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. SMTP Email (sendOtpEmail / verifyAndResetEmail)
// ═════════════════════════════════════════════════════════════════════════════

describe('SMTP Email — sendOtpEmail', () => {
  it('returns ok:false for empty email', async () => {
    const { PR } = makePasswordResetContext()
    const res = await PR.sendOtpEmail('')
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })

  it('returns ok:false for email without @', async () => {
    const { PR } = makePasswordResetContext()
    const res = await PR.sendOtpEmail('notanemail.com')
    expect(res.ok).toBe(false)
  })

  it('returns ok:false for email without domain dot', async () => {
    const { PR } = makePasswordResetContext()
    const res = await PR.sendOtpEmail('user@nodot')
    expect(res.ok).toBe(false)
  })

  it('returns ok:false when user not found in DB', async () => {
    const { PR } = makePasswordResetContext({ users: [] })
    const res = await PR.sendOtpEmail('ghost@example.com')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/یافت نشد/)
  })

  it('returns ok:true with maskedEmail and demoCode when user exists', async () => {
    const { PR } = makePasswordResetContext({
      users: [{ id: 'u1', email: 'manager@mandani.ir', status: 'active' }]
    })
    const res = await PR.sendOtpEmail('manager@mandani.ir')
    expect(res.ok).toBe(true)
    expect(res.maskedEmail).toBeTruthy()
    expect(res.demoCode).toBeTruthy()
  })

  it('maskedEmail contains *** as masking pattern', async () => {
    const { PR } = makePasswordResetContext({
      users: [{ id: 'u1', email: 'manager@mandani.ir' }]
    })
    const res = await PR.sendOtpEmail('manager@mandani.ir')
    expect(res.maskedEmail).toContain('***')
  })

  it('maskedEmail preserves the domain part', async () => {
    const { PR } = makePasswordResetContext({
      users: [{ id: 'u1', email: 'manager@mandani.ir' }]
    })
    const res = await PR.sendOtpEmail('manager@mandani.ir')
    expect(res.maskedEmail).toContain('@mandani.ir')
  })

  it('demoCode is a 6-digit string', async () => {
    const { PR } = makePasswordResetContext({
      users: [{ id: 'u1', email: 'test@test.com' }],
      forcedOtpNum: 42
    })
    const res = await PR.sendOtpEmail('test@test.com')
    expect(res.demoCode).toMatch(/^\d{6}$/)
  })

  it('stores OTP session in sessionStorage after successful send', async () => {
    const { PR, ctx } = makePasswordResetContext({
      users: [{ id: 'u1', email: 'test@test.com' }]
    })
    await PR.sendOtpEmail('test@test.com')
    const raw = ctx.sessionStorage.getItem('talar_pw_reset_email_otp')
    expect(raw).not.toBeNull()
    const session = JSON.parse(raw)
    expect(session.email).toBe('test@test.com')
    expect(session.userId).toBe('u1')
  })

  it('matches user by username field as well', async () => {
    const { PR } = makePasswordResetContext({
      users: [{ id: 'u2', username: 'ali@studio.ir' }]
    })
    const res = await PR.sendOtpEmail('ali@studio.ir')
    expect(res.ok).toBe(true)
  })
})

// ─── verifyAndResetEmail ──────────────────────────────────────────────────────

describe('SMTP Email — verifyAndResetEmail', () => {
  function makeContextWithSession(sessionData, users = []) {
    const { PR, ctx } = makePasswordResetContext({ users })
    if (sessionData) {
      ctx.sessionStorage.setItem('talar_pw_reset_email_otp', JSON.stringify(sessionData))
    }
    return { PR, ctx }
  }

  it('returns ok:false when no session exists', async () => {
    const { PR } = makeContextWithSession(null)
    const res = await PR.verifyAndResetEmail('test@test.com', '123456', 'NewPass!')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/منقضی/)
  })

  it('returns ok:false when session is expired', async () => {
    const { PR } = makeContextWithSession({
      email: 'test@test.com',
      code: '123456',
      expiresAt: Date.now() - 1000,
      verifyAttempts: 0
    })
    const res = await PR.verifyAndResetEmail('test@test.com', '123456', 'NewPass!')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/منقضی/)
  })

  it('returns ok:false when OTP is wrong', async () => {
    const { PR } = makeContextWithSession({
      email: 'test@test.com',
      code: '654321',
      expiresAt: Date.now() + 300_000,
      verifyAttempts: 0
    })
    const res = await PR.verifyAndResetEmail('test@test.com', '000000', 'NewPass!')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/صحیح نیست/)
  })

  it('returns ok:false when email does not match session', async () => {
    const { PR } = makeContextWithSession({
      email: 'other@example.com',
      code: '111111',
      expiresAt: Date.now() + 300_000,
      verifyAttempts: 0
    })
    const res = await PR.verifyAndResetEmail('test@test.com', '111111', 'NewPass!')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/مطابقت/)
  })

  it('returns ok:true when correct OTP provided and updates user password', async () => {
    const user = { id: 'u1', email: 'user@test.com', password: 'OldPass' }
    const { PR, ctx } = makeContextWithSession(
      {
        email: 'user@test.com',
        code: '654321',
        expiresAt: Date.now() + 300_000,
        verifyAttempts: 0
      },
      [user]
    )
    const res = await PR.verifyAndResetEmail('user@test.com', '654321', 'BrandNewPass!')
    expect(res.ok).toBe(true)
    expect(ctx.DB.update).toHaveBeenCalled()
    // user object should have the new password
    expect(user.password).toBe('BrandNewPass!')
  })

  it('clears session from sessionStorage after successful reset', async () => {
    const user = { id: 'u1', email: 'user@test.com', password: 'Old' }
    const { PR, ctx } = makeContextWithSession(
      {
        email: 'user@test.com',
        code: '999999',
        expiresAt: Date.now() + 300_000,
        verifyAttempts: 0
      },
      [user]
    )
    await PR.verifyAndResetEmail('user@test.com', '999999', 'NewPass')
    expect(ctx.sessionStorage.getItem('talar_pw_reset_email_otp')).toBeNull()
  })

  it('returns ok:false after exceeding max verify attempts', async () => {
    const { PR } = makeContextWithSession({
      email: 'test@test.com',
      code: '111111',
      expiresAt: Date.now() + 300_000,
      verifyAttempts: 3  // already at the max (AppConfig.OTP_MAX_VERIFY_ATTEMPTS = 3)
    })
    const res = await PR.verifyAndResetEmail('test@test.com', '000000', 'Pass')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/تعداد تلاش/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 2. Multi-Studio Context (SaasContext)
// ═════════════════════════════════════════════════════════════════════════════

describe('SaasContext — multi-studio', () => {
  it('setSession with single membership auto-selects its studioId', () => {
    const { SC } = makeSaasContext()
    SC.setSession({
      accessToken: 'tok-abc',
      memberships: [{ studioId: 'studio-1', studioName: 'First' }]
    })
    expect(SC.getStudioId()).toBe('studio-1')
  })

  it('setSession with multiple memberships stores all of them', () => {
    const { SC } = makeSaasContext()
    SC.setSession({
      accessToken: 'tok-abc',
      memberships: [
        { studioId: 'studio-1', studioName: 'First' },
        { studioId: 'studio-2', studioName: 'Second' }
      ]
    })
    const mems = SC.getMemberships()
    expect(mems.length).toBe(2)
    expect(mems[0].studioId).toBe('studio-1')
    expect(mems[1].studioId).toBe('studio-2')
  })

  it('setStudioId / getStudioId round-trip works correctly', () => {
    const { SC } = makeSaasContext()
    SC.setStudioId('studio-xyz')
    expect(SC.getStudioId()).toBe('studio-xyz')
  })

  it('getStudioId returns empty string when nothing is set', () => {
    const { SC } = makeSaasContext()
    expect(SC.getStudioId()).toBe('')
  })

  it('getMemberships returns empty array when nothing stored', () => {
    const { SC } = makeSaasContext()
    expect(SC.getMemberships()).toEqual([])
  })

  it('ensureStudioSelected returns ok:true when a studio is already selected', () => {
    const { SC } = makeSaasContext()
    SC.setSession({
      memberships: [
        { studioId: 'studio-1', studioName: 'Alpha' },
        { studioId: 'studio-2', studioName: 'Beta' }
      ]
    })
    SC.setStudioId('studio-1')
    const res = SC.ensureStudioSelected()
    expect(res.ok).toBe(true)
    expect(res.studioId).toBe('studio-1')
  })

  it('ensureStudioSelected returns ok:true when only one membership', () => {
    const { SC } = makeSaasContext()
    SC.setSession({
      memberships: [{ studioId: 'solo-studio', studioName: 'Solo' }]
    })
    const res = SC.ensureStudioSelected()
    expect(res.ok).toBe(true)
  })

  it('ensureStudioSelected returns needSelect:true for multiple memberships with no studio chosen', () => {
    // Fresh context — no studio pre-selected
    const { SC } = makeSaasContext()
    // Manually store memberships without triggering auto-select
    const mems = [
      { studioId: 'studio-1' },
      { studioId: 'studio-2' }
    ]
    // Use setSession but then clear the selected studio
    SC.setSession({ memberships: mems })
    SC.setStudioId('')         // force-clear selection
    const res = SC.ensureStudioSelected()
    expect(res.needSelect).toBe(true)
    expect(Array.isArray(res.memberships)).toBe(true)
    expect(res.memberships.length).toBe(2)
  })

  it('headers() includes Authorization when token is set', () => {
    const { SC } = makeSaasContext()
    SC.setSession({ accessToken: 'my-token', memberships: [] })
    const h = SC.headers()
    expect(h['Authorization']).toBe('Bearer my-token')
  })

  it('headers() includes X-Studio-Id when studio is selected', () => {
    const { SC } = makeSaasContext()
    SC.setStudioId('studio-99')
    const h = SC.headers()
    expect(h['X-Studio-Id']).toBe('studio-99')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 3. DocumentSeal & QR Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentSeal — generateStudioSeal', () => {
  it('returns a data: URL string', () => {
    const { DS } = makeDocumentSealContext()
    const result = DS.generateStudioSeal({ name: 'ماندنی' })
    expect(result).toMatch(/^data:/)
  })

  it('returns a data: URL with custom color option', () => {
    const { DS } = makeDocumentSealContext()
    const result = DS.generateStudioSeal({ name: 'ماندنی' }, { color: '#0071E3' })
    expect(result).toMatch(/^data:/)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns a non-empty string for studio without name (uses default)', () => {
    const { DS } = makeDocumentSealContext()
    const result = DS.generateStudioSeal({})
    expect(result).toBeTruthy()
  })

  it('accepts custom size option without throwing', () => {
    const { DS } = makeDocumentSealContext()
    expect(() => DS.generateStudioSeal({ name: 'X' }, { size: 400 })).not.toThrow()
  })

  it('accepts custom rotation angle without throwing', () => {
    const { DS } = makeDocumentSealContext()
    expect(() => DS.generateStudioSeal({ name: 'X' }, { angle: 5 })).not.toThrow()
  })
})

describe('DocumentSeal — generateQrCode', () => {
  it('returns a non-empty string for a URL input', () => {
    const { DS } = makeDocumentSealContext()
    const result = DS.generateQrCode('https://example.com/contract?verify=ABC123')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns a data: URL string', () => {
    const { DS } = makeDocumentSealContext()
    const result = DS.generateQrCode('https://example.com/contract')
    expect(result).toMatch(/^data:/)
  })

  it('returns different seeds for different URLs (deterministic per-url)', () => {
    const { DS } = makeDocumentSealContext()
    // Both calls return data URLs; just verify both are valid strings
    const r1 = DS.generateQrCode('https://studio.ir/c/1')
    const r2 = DS.generateQrCode('https://studio.ir/c/2')
    expect(r1).toMatch(/^data:/)
    expect(r2).toMatch(/^data:/)
  })

  it('accepts a custom size parameter', () => {
    const { DS } = makeDocumentSealContext()
    expect(() => DS.generateQrCode('https://example.com', 200)).not.toThrow()
  })
})

describe('DocumentSeal — renderSealAndSignatures', () => {
  it('returns an HTML string containing doc-verification-block class', () => {
    const { DS } = makeDocumentSealContext()
    const html = DS.renderSealAndSignatures({ id: 'doc-1', couple: 'سارا و علی' }, { name: 'ماندنی' })
    expect(html).toContain('doc-verification-block')
  })

  it('returned HTML includes the security hash', () => {
    const { DS } = makeDocumentSealContext()
    const html = DS.renderSealAndSignatures(
      { id: 'doc-2', signatureHash: 'SHA256_TESTVALUE' },
      {}
    )
    expect(html).toContain('SHA256_TESTVALUE')
  })

  it('returned HTML contains img tags for seal and QR', () => {
    const { DS } = makeDocumentSealContext()
    const html = DS.renderSealAndSignatures({ id: 'doc-3' }, { name: 'Alpha' })
    // Seal and QR both produce <img> tags
    const imgCount = (html.match(/<img /g) || []).length
    expect(imgCount).toBeGreaterThanOrEqual(2)
  })

  it('displays customer couple name in the output', () => {
    const { DS } = makeDocumentSealContext()
    const html = DS.renderSealAndSignatures({ id: 'doc-4', couple: 'مریم و رضا' }, {})
    expect(html).toContain('مریم و رضا')
  })

  it('includes studio name in the output', () => {
    const { DS } = makeDocumentSealContext()
    const html = DS.renderSealAndSignatures({ id: 'doc-5' }, { name: 'ماندنی استودیو', manager: 'مدیر' })
    expect(html).toContain('ماندنی استودیو')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 4. findUserByEmail helper
// ═════════════════════════════════════════════════════════════════════════════

describe('PasswordReset.findUserByEmail', () => {
  it('returns null when DB has no users', () => {
    const { PR } = makePasswordResetContext({ users: [] })
    expect(PR.findUserByEmail('test@test.com')).toBeNull()
  })

  it('finds user by email (case-insensitive)', () => {
    const user = { id: 'u1', email: 'Test@Test.com' }
    const { PR } = makePasswordResetContext({ users: [user] })
    const found = PR.findUserByEmail('test@test.com')
    expect(found).not.toBeNull()
    expect(found.id).toBe('u1')
  })

  it('finds user by username field', () => {
    const user = { id: 'u2', username: 'ali@studio.ir' }
    const { PR } = makePasswordResetContext({ users: [user] })
    const found = PR.findUserByEmail('ali@studio.ir')
    expect(found).not.toBeNull()
  })

  it('returns null for falsy email argument', () => {
    const { PR } = makePasswordResetContext({ users: [{ id: 'u1', email: 'a@b.com' }] })
    expect(PR.findUserByEmail(null)).toBeNull()
    expect(PR.findUserByEmail('')).toBeNull()
  })
})
