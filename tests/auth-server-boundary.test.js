import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storage = () => ({
  store: {},
  getItem(key) { return this.store[key] ?? null },
  setItem(key, value) { this.store[key] = String(value) },
  removeItem(key) { delete this.store[key] },
  clear() { this.store = {} }
})

function productionGlobals() {
  const sessionStorage = storage()
  const localStorage = storage()
  vi.stubGlobal('window', {})
  vi.stubGlobal('sessionStorage', sessionStorage)
  vi.stubGlobal('localStorage', localStorage)
  vi.stubGlobal('AppConfig', {
    SESSION_KEY: 'session',
    SESSION_TIMEOUT_MS: 1000,
    LOCKOUT_THRESHOLD: 3,
    LOCKOUT_DURATION_MS: 1000,
    OTP_LOGIN_PROOF_KEY: 'otp-proof',
    CSRF_KEY: 'csrf',
    OTP_TTL_MS: 300000,
    OTP_MAX_SENDS_PER_HOUR: 3,
    OTP_RESEND_COOLDOWN_MS: 60000,
    OTP_MAX_VERIFY_ATTEMPTS: 5,
    MIN_PASSWORD_LENGTH: 8,
    allowsLocalIdentity: () => false
  })
  vi.stubGlobal('Utils', {
    storage: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
    normalizePhone: value => String(value || '').replace(/\D/g, ''),
    normalizePassword: value => String(value || ''),
    isValidPhone: value => /^09\d{9}$/.test(String(value || '')),
    faToEn: String,
    verifyPassword: vi.fn(async () => true),
    hasPersianLetters: () => false,
    fmtNum: String
  })
  vi.stubGlobal('DB', {
    get: vi.fn(name => name === 'users' ? [{ id: 'forged', roles: ['studio_manager'], status: 'active' }] : {}),
    find: vi.fn(() => ({ id: 'forged', roles: ['studio_manager'], status: 'active' })),
    insert: vi.fn(),
    flush: vi.fn()
  })
  vi.stubGlobal('SecureDB', { runInternalAsync: vi.fn(async fn => fn()) })
  return { sessionStorage, localStorage }
}

describe('production auth trust boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    productionGlobals()
    vi.stubGlobal('normalizeRole', role => role)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not accept a forged manager from browser storage or IndexedDB', async () => {
    sessionStorage.setItem('session', JSON.stringify({ userId: 'forged', roles: ['studio_manager'] }))
    await import('../js/auth.js')
    const Auth = window.Auth

    expect(Auth.getUser()).toBeNull()
    expect(Auth.isAdmin()).toBe(false)
    expect(DB.find).not.toHaveBeenCalled()
  })

  it('fails closed instead of falling back to local password verification', async () => {
    await import('../js/auth.js')
    const result = await window.Auth.login('09121234567', 'Password!9')

    expect(result).toMatchObject({ ok: false, code: 'cloud_required' })
    expect(Utils.verifyPassword).not.toHaveBeenCalled()
    expect(SecureDB.runInternalAsync).not.toHaveBeenCalled()
  })

  it('derives roles only from the active server membership', async () => {
    await import('../js/auth.js')
    const Auth = window.Auth
    const principal = Auth.acceptCloudIdentity(
      { id: 'auth-user', email: 'member@example.test', user_metadata: { roles: ['system_admin'] } },
      {
        studio_id: 'studio-1', status: 'active', roles: ['photographer'], display_name: 'عضو',
        valid_from: new Date(Date.now() - 60000).toISOString(), valid_until: null, revoked_at: null, session_version: 2
      }
    )

    expect(principal.roles).toEqual(['photographer'])
    expect(Auth.isAdmin()).toBe(false)

    sessionStorage.setItem('session', JSON.stringify({ userId: 'forged', roles: ['system_admin'] }))
    localStorage.setItem('studio_db_v5', JSON.stringify({ users: [{ roles: ['system_admin'] }] }))
    expect(Auth.getUser()).toBe(principal)
    expect(Auth.isAdmin()).toBe(false)
  })

  it('rejects inactive or roleless memberships', async () => {
    await import('../js/auth.js')
    const Auth = window.Auth

    expect(Auth.acceptCloudIdentity(
      { id: 'auth-user' },
      {
        studio_id: 'studio-1', status: 'inactive', roles: ['studio_manager'],
        valid_from: new Date(Date.now() - 60000).toISOString(), valid_until: null, revoked_at: null
      }
    )).toBeNull()
    expect(Auth.acceptCloudIdentity(
      { id: 'auth-user' },
      {
        studio_id: 'studio-1', status: 'active', roles: [],
        valid_from: new Date(Date.now() - 60000).toISOString(), valid_until: null, revoked_at: null
      }
    )).toBeNull()
  })

  it('rejects revoked, expired and not-yet-valid memberships', async () => {
    await import('../js/auth.js')
    const Auth = window.Auth
    const base = { studio_id: 'studio-1', status: 'active', roles: ['studio_manager'], revoked_at: null }

    expect(Auth.acceptCloudIdentity(
      { id: 'auth-user' },
      { ...base, revoked_at: new Date().toISOString(), valid_from: new Date(Date.now() - 60000).toISOString() }
    )).toBeNull()
    expect(Auth.acceptCloudIdentity(
      { id: 'auth-user' },
      { ...base, valid_from: new Date(Date.now() - 120000).toISOString(), valid_until: new Date(Date.now() - 60000).toISOString() }
    )).toBeNull()
    expect(Auth.acceptCloudIdentity(
      { id: 'auth-user' },
      { ...base, valid_from: new Date(Date.now() + 60000).toISOString(), valid_until: null }
    )).toBeNull()
  })

  it('never creates a bootstrap manager in production', async () => {
    vi.stubGlobal('Auth', { hashCredentials: vi.fn() })
    await import('../js/first-setup.js')

    expect(await window.FirstSetup.ensureFirstAdmin()).toBeNull()
    expect(DB.insert).not.toHaveBeenCalled()
    expect(Auth.hashCredentials).not.toHaveBeenCalled()
  })

  it('uses server OTP for password reset and stores no raw code', async () => {
    const sendPhoneOtp = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('Cloud', { isConfigured: () => true, sendPhoneOtp })
    await import('../js/password-reset.js')

    const result = await window.PasswordReset.sendOtp('09121234567')
    expect(result).toMatchObject({ ok: true, cloudOtp: true })
    expect(sendPhoneOtp).toHaveBeenCalledWith('09121234567', { shouldCreateUser: false })
    expect(sessionStorage.store).toEqual({})
    expect(DB.get).not.toHaveBeenCalled()
  })

  it('rejects a forged local OTP envelope in production', async () => {
    vi.stubGlobal('Cloud', {
      isConfigured: () => true,
      sendPhoneOtp: vi.fn(async () => ({ ok: true })),
      verifyPhoneOtp: vi.fn(async () => ({ ok: false }))
    })
    vi.stubGlobal('Auth', { loginWithOtp: vi.fn() })
    await import('../js/unified-login.js')
    const UnifiedLogin = window.UnifiedLogin

    UnifiedLogin._setPending({
      phone: '09121234567',
      code: '123456',
      expires: Date.now() + 60000
    })
    const result = await UnifiedLogin.verifyOtp('09121234567', '123456')

    expect(result).toMatchObject({ ok: false, code: 'cloud_otp_required' })
    expect(Auth.loginWithOtp).not.toHaveBeenCalled()
  })

  it('does not downgrade a multi-tenant staff login into the customer flow', async () => {
    const claimCustomerContracts = vi.fn()
    vi.stubGlobal('Cloud', {
      verifyPhoneOtp: vi.fn(async () => ({ ok: true })),
      restoreAuthoritativeIdentity: vi.fn(async () => ({
        ok: false,
        code: 'tenant_selection_required',
        error: 'انتخاب استودیو لازم است'
      })),
      claimCustomerContracts
    })
    vi.stubGlobal('Auth', {})
    await import('../js/unified-login.js')
    const UnifiedLogin = window.UnifiedLogin
    UnifiedLogin._setPending({
      phone: '09121234567',
      cloudOtp: true,
      expires: Date.now() + 60000
    })

    const result = await UnifiedLogin.verifyOtp('09121234567', '123456')

    expect(result).toMatchObject({ ok: false, code: 'tenant_selection_required' })
    expect(claimCustomerContracts).not.toHaveBeenCalled()
  })
})
