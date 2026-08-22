import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function storage() {
  return {
    data: {},
    getItem(k) { return this.data[k] ?? null },
    setItem(k, v) { this.data[k] = String(v) },
    removeItem(k) { delete this.data[k] }
  }
}

describe('Auth behavioral coverage', () => {
  let Auth
  let local
  let session
  let security
  let users

  beforeEach(async () => {
    vi.resetModules()
    local = storage()
    session = storage()
    security = {}
    users = [{
      id: 'u1', name: 'Manager', phone: '09121234567', status: 'active', roles: ['studio_manager'],
      password: 'hash', salt: 'salt', mustChangePassword: false
    }]
    vi.stubGlobal('window', { location: { href: '' } })
    vi.stubGlobal('location', { hostname: 'localhost', pathname: '/index.html' })
    vi.stubGlobal('localStorage', local)
    vi.stubGlobal('sessionStorage', session)
    vi.stubGlobal('AppConfig', {
      SESSION_KEY: 'session', SESSION_TIMEOUT_MS: 3600000, LOCKOUT_THRESHOLD: 2, LOCKOUT_DURATION_MS: 120000,
      OTP_LOGIN_PROOF_KEY: 'otp-proof', CSRF_KEY: 'csrf', OTP_MAX_SENDS_PER_HOUR: 2,
      OTP_RESEND_COOLDOWN_MS: 60000, OTP_MAX_VERIFY_ATTEMPTS: 2, MIN_PASSWORD_LENGTH: 8,
      allowsLocalIdentity: () => true, isLocalDev: () => true
    })
    vi.stubGlobal('Utils', {
      storage: { get: vi.fn((_k, fallback) => fallback), set: vi.fn(), remove: vi.fn() },
      normalizePhone: value => String(value || '').replace(/\D/g, ''),
      normalizePassword: value => String(value || ''), fmtNum: String,
      verifyPassword: vi.fn(async value => value === 'Correct!9'),
      isPbkdf2Password: vi.fn(() => true),
      hashPasswordSecure: vi.fn(async value => ({ password: `hashed:${value}`, salt: 'new-salt' })),
      hasPersianLetters: value => /[\u0600-\u06ff]/.test(String(value || '')),
      todayJalali: () => '1405/06/01'
    })
    vi.stubGlobal('DB', {
      get: vi.fn(name => name === 'securityState' ? security : name === 'studioInfo' ? {} : null),
      set: vi.fn((name, value) => { if (name === 'securityState') security = value }),
      find: vi.fn((name, predicate) => {
        if (name === 'users') return users.find(predicate) || null
        if (name === 'persProjects') return [{ id: 'p1', personnelId: 'person1' }].find(predicate) || null
        return null
      }),
      update: vi.fn((name, id, patch) => {
        const item = name === 'users' ? users.find(u => u.id === id) : null
        if (item) Object.assign(item, patch)
      }),
      flush: vi.fn(async () => {}), log: vi.fn(),
      findPersonnelByUserId: vi.fn(() => ({ id: 'person1' })), findPersonnelByPhone: vi.fn(() => null)
    })
    vi.stubGlobal('SecureDB', { runInternalAsync: vi.fn(async fn => fn()) })
    vi.stubGlobal('normalizeRole', role => role)
    vi.stubGlobal('hasPermission', (role, permission) => role === 'photographer' && permission === 'calendar')
    vi.stubGlobal('Access', undefined)
    vi.stubGlobal('SessionSign', undefined)
    vi.stubGlobal('SignedProof', undefined)
    vi.stubGlobal('PasswordSecurity', undefined)
    ;({ default: Auth } = await import('../js/auth.js'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('maintains login lockout and OTP rate state', () => {
    expect(Auth._securityState()).toMatchObject({ loginAttempts: {}, otpSend: {}, otpVerify: {} })
    Auth._recordFailedAttempt('0912')
    expect(Auth.isLocked('0912')).toBe(0)
    Auth._recordFailedAttempt('0912')
    expect(Auth.isLocked('0912')).toBeGreaterThan(0)
    Auth._clearAttempts('0912')
    expect(Auth.isLocked('0912')).toBe(0)

    expect(Auth.canSendOtp('p').ok).toBe(true)
    Auth.recordOtpSend('p')
    expect(Auth.canSendOtp('p').ok).toBe(false)
    security.otpSend.p.lastSend = 0
    Auth.recordOtpSend('p')
    security.otpSend.p.lastSend = 0
    expect(Auth.canSendOtp('p').ok).toBe(false)
    expect(Auth.recordOtpVerifyFail('p')).toBe(0)
    expect(Auth.recordOtpVerifyFail('p')).toBeGreaterThan(0)
    expect(Auth.isOtpVerifyLocked('p')).toBeGreaterThan(0)
    Auth.clearOtpVerify('p')
    expect(Auth.isOtpVerifyLocked('p')).toBe(0)
  })

  it('issues OTP proof and manages CSRF for local sessions', async () => {
    await Auth.grantOtpLoginProof('u1')
    expect(JSON.parse(session.getItem('otp-proof')).userId).toBe('u1')
    Auth._sessionSet('session', { userId: 'u1', expiresAt: Date.now() + 10000 })
    const csrf = Auth.getCsrfToken()
    expect(csrf).toHaveLength(32)
    expect(Auth.validateCsrf(csrf)).toBe(true)
    expect(Auth.validateCsrf('wrong')).toBe(false)
    expect(Auth.validateCsrf('')).toBe(false)
    expect(Auth.getCsrfToken()).toBe(csrf)
  })

  it('migrates legacy session storage and signs sessions when available', async () => {
    Utils.storage.get.mockReturnValueOnce({ userId: 'u1' })
    expect(Auth._sessionGet('session')).toEqual({ userId: 'u1' })
    expect(Utils.storage.remove).toHaveBeenCalledWith('session')
    const sign = vi.fn(async value => ({ ...value, sig: 'signed' }))
    vi.stubGlobal('SessionSign', { sign })
    await Auth._sessionSetSigned('session', { userId: 'u1' })
    expect(JSON.parse(session.getItem('session')).sig).toBe('signed')
    Auth._sessionRemove('session')
    expect(session.getItem('session')).toBeNull()
  })

  it('performs successful local password login and upgrades legacy password hashes', async () => {
    Utils.isPbkdf2Password.mockReturnValue(false)
    users[0].isDefaultPassword = true
    const result = await Auth.login('0912 123 4567', 'Correct!9')
    expect(result.ok).toBe(true)
    expect(result.mustChangePassword).toBe(true)
    expect(DB.update).toHaveBeenCalled()
    expect(DB.log).toHaveBeenCalledWith('login', 'Manager')
    expect(Auth.getUser()?.id).toBe('u1')
  })

  it.each([
    ['missing', [], 'not_found'],
    ['pending', [{ id: 'u1', phone: '09121234567', status: 'pending' }], 'pending'],
    ['inactive', [{ id: 'u1', phone: '09121234567', status: 'inactive' }], 'inactive'],
    ['wrong password', null, 'wrong_password']
  ])('rejects local login state: %s', async (_name, replacement, code) => {
    if (replacement) users = replacement
    const result = await Auth.login('09121234567', 'Wrong!9')
    expect(result.code).toBe(code)
  })

  it('uses server auth in production and fails closed on missing or failed cloud identity', async () => {
    AppConfig.allowsLocalIdentity = () => false
    vi.stubGlobal('Cloud', { isConfigured: () => false })
    expect((await Auth.login('0912', 'x')).code).toBe('cloud_required')
    vi.stubGlobal('Cloud', { isConfigured: () => true, signIn: vi.fn(async () => ({ ok: false, error: 'denied' })) })
    expect((await Auth.login('0912', 'x')).code).toBe('cloud_auth_failed')
    Cloud.signIn.mockResolvedValueOnce({ ok: true, identity: { id: 'cloud' } })
    expect((await Auth.login('0912', 'x')).user.id).toBe('cloud')
  })

  it('requires an OTP proof and logs in active local users', async () => {
    expect((await Auth.loginWithOtp('u1')).ok).toBe(false)
    await Auth.grantOtpLoginProof('u1')
    expect((await Auth.loginWithOtp('u1')).ok).toBe(true)
    expect(DB.log).toHaveBeenCalledWith('login_otp', 'Manager')
    await Auth.grantOtpLoginProof('missing')
    expect((await Auth.loginWithOtp('missing')).ok).toBe(false)
    users[0].status = 'disabled'
    await Auth.grantOtpLoginProof('u1')
    expect((await Auth.loginWithOtp('u1')).ok).toBe(false)
    AppConfig.allowsLocalIdentity = () => false
    expect((await Auth.loginWithOtp('u1')).code).toBe('cloud_otp_required')
  })

  it('accepts only valid cloud memberships and exposes immutable server identity', () => {
    AppConfig.allowsLocalIdentity = () => false
    const membership = {
      studio_id: 's1', roles: ['photographer'], status: 'active', phone: '0912',
      valid_from: new Date(Date.now() - 1000).toISOString(), valid_until: null, revoked_at: null
    }
    expect(Auth.acceptCloudIdentity({ id: 'a1' }, membership).roles).toEqual(['photographer'])
    expect(Auth.getUser().id).toBe('a1')
    expect(Auth.getSession().studioId).toBe('s1')
    expect(() => Auth.getUser().roles.push('system_admin')).toThrow()
    expect(Auth.acceptCloudIdentity({}, membership)).toBeNull()
  })

  it('verifies local signed sessions including legacy upgrade and invalid signature', async () => {
    Auth._sessionSet('session', { userId: 'u1', expiresAt: Date.now() + 10000 })
    expect(await Auth.verifySessionSignature()).toBe(true)
    const sign = vi.fn(async value => ({ ...value, sig: 'signed' }))
    const verify = vi.fn(async () => true)
    vi.stubGlobal('SessionSign', { sign, verify })
    expect(await Auth.verifySessionSignature()).toBe(true)
    Auth._sessionSet('session', { userId: 'u1', csrf: 'c', sig: 'bad', expiresAt: Date.now() + 10000 })
    verify.mockResolvedValue(false)
    expect(await Auth.verifySessionSignature()).toBe(false)
  })

  it('verifies production session by revalidating server identity', async () => {
    AppConfig.allowsLocalIdentity = () => false
    vi.stubGlobal('Cloud', { restoreAuthoritativeIdentity: vi.fn(async () => ({ ok: true })) })
    expect(await Auth.verifySessionSignature()).toBe(true)
    Cloud.restoreAuthoritativeIdentity.mockResolvedValueOnce({ ok: false })
    expect(await Auth.verifySessionSignature()).toBe(false)
    vi.stubGlobal('Cloud', {})
    expect(await Auth.verifySessionSignature()).toBe(false)
  })

  it('evaluates roles, routes, permissions, ownership and password-change state', () => {
    Auth._sessionSet('session', { userId: 'u1', expiresAt: Date.now() + 10000 })
    expect(Auth.isLoggedIn()).toBe(true)
    expect(Auth.currentUser().id).toBe('u1')
    expect(Auth.isStudioManager()).toBe(true)
    expect(Auth.isAdmin()).toBe(true)
    expect(Auth.isFullAdmin()).toBe(false)
    expect(Auth.canAccessAdmin()).toBe(true)
    expect(Auth.getHomePage()).toBe('studio-m')
    expect(Auth.getLandingUrl()).toBe('studio-m/')
    expect(Auth.userHasPermission('anything')).toBe(false)
    expect(Auth.ownsPersonnelProject('p1')).toBe(true)
    expect(Auth.mustChangePassword()).toBe(false)
    users[0].roles = ['photographer']
    expect(Auth.userHasPermission('calendar')).toBe(true)
    expect(Auth.ownsPersonnelProject('p1')).toBe(true)
  })

  it('validates password policy and verifies local password', async () => {
    Auth._sessionSet('session', { userId: 'u1', expiresAt: Date.now() + 10000 })
    expect(Auth.validatePassword('short')).toContain('حداقل')
    expect(Auth.validatePassword('رمزPassword9!')).toContain('فارسی')
    vi.stubGlobal('PasswordSecurity', { analyze: () => ({ level: 'weak', len: 10 }) })
    expect(Auth.validatePassword('weakpass12')).toContain('ضعیف')
    PasswordSecurity.analyze = () => ({ level: 'strong', len: 12 })
    expect(Auth.validatePassword('Strong!Pass9')).toBe('')
    expect((await Auth.verifyCurrentPassword('')).ok).toBe(false)
    expect((await Auth.verifyCurrentPassword('Correct!9')).ok).toBe(true)
    expect((await Auth.verifyCurrentPassword('wrong')).ok).toBe(false)
  })

  it('updates and resets a local manager password only after proof', async () => {
    expect((await Auth.updatePassword('missing', 'x', 'Strong!Pass9')).ok).toBe(false)
    expect((await Auth.updatePassword('u1', 'wrong', 'Strong!Pass9')).ok).toBe(false)
    expect((await Auth.updatePassword('u1', 'Correct!9', 'Strong!Pass9')).ok).toBe(true)
    expect((await Auth.resetManagerPassword('09121234567', 'Strong!Pass9')).ok).toBe(false)
    expect((await Auth.resetManagerPassword('09121234567', 'Strong!Pass9', { otpVerified: true })).ok).toBe(true)
    AppConfig.allowsLocalIdentity = () => false
    expect((await Auth.resetManagerPassword('0912', 'Strong!Pass9', { otpVerified: true })).code).toBe('cloud_reset_required')
  })

  it('delegates production password verification and update to Cloud', async () => {
    AppConfig.allowsLocalIdentity = () => false
    vi.stubGlobal('Cloud', {
      verifyCurrentPassword: vi.fn(async () => ({ ok: true })),
      changePassword: vi.fn(async () => ({ ok: true }))
    })
    expect((await Auth.verifyCurrentPassword('x')).ok).toBe(true)
    expect((await Auth.updatePassword('u', 'old', 'Strong!Pass9')).ok).toBe(true)
  })

  it('expires and logs out sessions and redirects protected pages', () => {
    Auth._sessionSet('session', { userId: 'u1', expiresAt: Date.now() - 1 })
    expect(Auth.getUser()).toBeNull()
    Auth._sessionSet('session', { userId: 'u1', expiresAt: Date.now() - 1 })
    location.pathname = '/studio-m/index.html'
    Auth.checkSessionExpiry()
    expect(window.location.href).toBe('../index.html')
    Auth.logout()
    expect(Auth.getSession()).toBeNull()
  })

  it('repairs partial security state and rejects tampered sessions', () => {
    security = { loginAttempts: null, otpSend: null, otpVerify: null }
    expect(Auth._securityState()).toMatchObject({ loginAttempts: {}, otpSend: {}, otpVerify: {} })
    Auth._sessionSet('session', { userId: 'u1', _sigInvalid: true, expiresAt: Date.now() + 10000 })
    expect(Auth.getUser()).toBeNull()
    vi.stubGlobal('SessionSign', { verify: vi.fn(), sign: vi.fn() })
    AppConfig.isLocalDev = () => false
    Auth._sessionSet('session', { userId: 'u1', expiresAt: Date.now() + 10000 })
    expect(Auth.getUser()).toBeNull()
  })

  it('covers Access-controlled authorization and landing routes', () => {
    Auth._sessionSet('session', { userId: 'u1', expiresAt: Date.now() + 10000 })
    vi.stubGlobal('Access', {
      isSystemAdmin: () => true, isStudioManager: () => false, canAccessStudioM: () => true,
      getLandingUrl: () => 'index.html?view=portal'
    })
    expect(Auth.isSystemAdmin()).toBe(true)
    expect(Auth.isStudioManager()).toBe(false)
    expect(Auth.canAccessAdmin()).toBe(true)
    expect(Auth.getHomePage()).toBe('portal')
    expect(Auth.getLandingUrl()).toContain('portal')
    Access.getLandingUrl = () => 'studio-m/'
    expect(Auth.getHomePage()).toBe('studio-m')
  })

  it('rejects reset proof, non-manager and weak password failure states', async () => {
    vi.stubGlobal('SignedProof', { verify: vi.fn(async () => false), clear: vi.fn() })
    expect((await Auth.resetManagerPassword('09121234567', 'Strong!Pass9', { otpVerified: true })).ok).toBe(false)
    SignedProof.verify.mockResolvedValue(true)
    users[0].roles = ['photographer']
    expect((await Auth.resetManagerPassword('09121234567', 'Strong!Pass9', { otpVerified: true })).ok).toBe(false)
    users = []
    expect((await Auth.resetManagerPassword('09121234567', 'Strong!Pass9', { otpVerified: true })).ok).toBe(false)
  })

  it('rejects unavailable production password services and weak updates', async () => {
    AppConfig.allowsLocalIdentity = () => false
    vi.stubGlobal('Cloud', undefined)
    expect((await Auth.verifyCurrentPassword('x')).ok).toBe(false)
    expect((await Auth.updatePassword('u', 'old', 'short')).ok).toBe(false)
    expect((await Auth.updatePassword('u', 'old', 'Strong!Pass9')).ok).toBe(false)
  })

  it('covers locked, pending, disabled and non-manager password failures', async () => {
    security = { loginAttempts: { '09121234567': { count: 0, lockedUntil: Date.now() + 60000 } }, otpSend: {}, otpVerify: {} }
    expect((await Auth.login('09121234567', 'Correct!9')).code).toBe('locked')
    security.loginAttempts = {}
    users[0].status = 'pending'
    expect((await Auth.login('09121234567', 'Correct!9')).code).toBe('pending')
    users[0].status = 'disabled'
    expect((await Auth.login('09121234567', 'Correct!9')).code).toBe('inactive')
    users[0].status = 'active'; users[0].roles = ['photographer']
    expect((await Auth.login('09121234567', 'wrong')).code).toBe('wrong_password')
  })

  it('uses SignedProof for OTP login and clears all logout secrets', async () => {
    const proof = { issue: vi.fn(async () => {}), verify: vi.fn(async () => true), clear: vi.fn(), clearSecret: vi.fn() }
    vi.stubGlobal('SignedProof', proof)
    vi.stubGlobal('SessionSign', { clearSecret: vi.fn() })
    await Auth.grantOtpLoginProof('u1')
    expect(proof.issue).toHaveBeenCalled()
    expect((await Auth.loginWithOtp('u1')).ok).toBe(true)
    Auth.logout()
    expect(proof.clearSecret).toHaveBeenCalled()
  })

  it('covers no-user authorization and project ownership failures', () => {
    expect(Auth.getUser()).toBeNull()
    expect(Auth.isSystemAdmin()).toBe(false)
    expect(Auth.isStudioManager()).toBe(false)
    expect(Auth._legacyManagerRole()).toBe(false)
    expect(Auth.canAccessAdmin()).toBe(false)
    expect(Auth.getHomePage()).toBe('login')
    expect(Auth.userHasPermission('calendar')).toBe(false)
    expect(Auth.ownsPersonnelProject('missing')).toBe(false)
    Auth._sessionSet('session', { userId: 'u1', expiresAt: Date.now() + 10000 })
    users[0].roles = ['photographer']
    expect(Auth.ownsPersonnelProject('missing')).toBe(false)
    DB.findPersonnelByUserId.mockReturnValueOnce(null)
    DB.findPersonnelByPhone.mockReturnValueOnce(null)
    expect(Auth.ownsPersonnelProject('p1')).toBeFalsy()
  })

  it('upgrades a legacy signed session and rejects production unsigned session', async () => {
    const sign = vi.fn(async value => ({ ...value, sig: 'new' }))
    const verify = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    vi.stubGlobal('SessionSign', { sign, verify })
    Auth._sessionSet('session', { userId: 'u1', csrf: 'csrf', sig: 'legacy', expiresAt: Date.now() + 10000 })
    expect(await Auth.verifySessionSignature()).toBe(true)
    expect(sign).toHaveBeenCalled()
    AppConfig.isLocalDev = () => false
    Auth._sessionSet('session', { userId: 'u1', expiresAt: Date.now() + 10000 })
    expect(await Auth.verifySessionSignature()).toBe(false)
  })

  it('syncs local password to bridge when configured', async () => {
    Auth._sessionSet('session', { userId: 'u1', expiresAt: Date.now() + 10000 })
    DB.get.mockImplementation(name => name === 'securityState' ? security : name === 'studioInfo' ? { cloudUnifyPassword: true } : null)
    vi.stubGlobal('AuthBridge', { unifyPassword: vi.fn(async () => {}), afterLocalLogin: vi.fn(async () => {}) })
    expect((await Auth.updatePassword('u1', 'Correct!9', 'Strong!Pass9')).ok).toBe(true)
    expect(AuthBridge.unifyPassword).toHaveBeenCalled()
  })

  it('uses local-development fallback when the explicit identity flag is absent', () => {
    delete AppConfig.allowsLocalIdentity
    AppConfig.isLocalDev = () => true
    expect(Auth._allowsLocalIdentity()).toBe(true)
    AppConfig.isLocalDev = () => false
    expect(Auth._allowsLocalIdentity()).toBe(false)
  })

  it('rejects malformed cloud membership fields and applies principal defaults', () => {
    AppConfig.allowsLocalIdentity = () => false
    const base = { studio_id: 's1', status: 'active', valid_from: new Date(Date.now() - 1000).toISOString(), revoked_at: null }
    expect(Auth.acceptCloudIdentity({ id: 'u' }, { ...base, roles: null })).toBeNull()
    expect(Auth.acceptCloudIdentity({ id: 'u' }, { ...base, roles: [''], valid_until: 'bad' })).toBeNull()
    const principal = Auth.acceptCloudIdentity({ id: 'u', email: '' }, { ...base, roles: ['manager'], session_version: 0 })
    expect(principal).toMatchObject({ name: 'کاربر', phone: '', sessionVersion: 1 })
  })

  it('covers OTP state default configuration and expired windows', () => {
    AppConfig.OTP_MAX_SENDS_PER_HOUR = 0
    AppConfig.OTP_RESEND_COOLDOWN_MS = 0
    security = { loginAttempts: {}, otpSend: { p: { sends: [Date.now() - 7200000], lastSend: 0 } }, otpVerify: {} }
    expect(Auth._otpSendData('p').sends).toEqual([])
    expect(Auth.canSendOtp('p').ok).toBe(true)
    AppConfig.OTP_MAX_VERIFY_ATTEMPTS = 0
    expect(Auth.recordOtpVerifyFail('p')).toBe(0)
    security.otpVerify.p.lockedUntil = Date.now() - 1
    expect(Auth.isOtpVerifyLocked('p')).toBe(0)
  })

  it('covers CSRF exits and asynchronous re-sign mismatch', async () => {
    expect(Auth.getCsrfToken()).toBe('')
    expect(Auth.validateCsrf('token')).toBe(false)
    Auth._sessionSet('session', { userId: 'missing', expiresAt: Date.now() + 10000 })
    expect(Auth.getCsrfToken()).toBe('')
    const sign = vi.fn(async value => ({ ...value, sig: 's' }))
    vi.stubGlobal('SessionSign', { sign })
    Auth._scheduleSessionResign({ userId: 'different', csrf: 'c' })
    await Promise.resolve(); await Promise.resolve()
    expect(sign).toHaveBeenCalled()
  })

  it('covers local login manager hint, default values and bridge callback', async () => {
    users[0].roles = ['studio_manager']
    expect((await Auth.login('09121234567', 'wrong')).error).toContain('رمز جدید')
    vi.stubGlobal('AuthBridge', { afterLocalLogin: vi.fn(async () => {}) })
    expect((await Auth.login('09121234567', 'Correct!9')).ok).toBe(true)
    expect(AuthBridge.afterLocalLogin).toHaveBeenCalled()
  })

  it('covers cloud logout, index expiry redirect and permission fallbacks', () => {
    AppConfig.allowsLocalIdentity = () => false
    vi.stubGlobal('Cloud', { signOut: vi.fn(async () => {}) })
    Auth.logout()
    expect(Cloud.signOut).toHaveBeenCalled()
    AppConfig.allowsLocalIdentity = () => true
    Auth._sessionSet('session', { userId: 'u1', expiresAt: Date.now() - 1 })
    location.pathname = '/index.html'
    Auth.checkSessionExpiry()
    expect(window.location.href).toBe('site.html')
    vi.stubGlobal('normalizeRole', undefined)
    vi.stubGlobal('hasPermission', undefined)
    Auth._sessionSet('session', { userId: 'u1', expiresAt: Date.now() + 10000 })
    users[0].roles = ['unknown']
    expect(Auth.userHasPermission('x')).toBe(false)
  })

  it('covers password update validation and reset profile preservation', async () => {
    expect((await Auth.updatePassword('u1', 'Correct!9', 'short')).ok).toBe(false)
    users[0].profileCompleted = false
    vi.stubGlobal('SignedProof', { verify: vi.fn(async () => true), clear: vi.fn() })
    users[0].roles = ['system_admin']
    expect((await Auth.resetManagerPassword('09121234567', 'Strong!Pass9', { otpVerified: true })).ok).toBe(true)
    expect(DB.update).toHaveBeenCalledWith('users', 'u1', expect.objectContaining({ profileCompleted: false }))
  })

  it('covers production CSRF, malformed storage and optional role defaults', () => {
    AppConfig.allowsLocalIdentity = () => false
    const membership = {
      studio_id: 's1', roles: ['photographer'], status: 'active',
      valid_from: new Date(Date.now() - 1000).toISOString(), valid_until: null, revoked_at: null
    }
    Auth.acceptCloudIdentity({ id: 'u1', email: 'x@test' }, membership)
    const token = Auth.getCsrfToken()
    expect(token).toHaveLength(32)
    expect(Auth.getCsrfToken()).toBe(token)
    AppConfig.allowsLocalIdentity = () => true
    session.setItem('bad', '{bad')
    expect(Auth._sessionGet('bad', 'fallback')).toBe('fallback')
    Auth._scheduleSessionResign({ userId: 'u1', csrf: 'x' })
    users[0].roles = undefined
    Auth._sessionSet('session', { userId: 'u1', expiresAt: Date.now() + 10000 })
    expect(Auth.isStudioManager()).toBe(false)
    expect(Auth.userHasPermission('x')).toBe(false)
  })

  it('preserves server role values when the legacy role normalizer is unavailable', () => {
    AppConfig.allowsLocalIdentity = () => false
    vi.stubGlobal('normalizeRole', undefined)
    const membership = {
      studio_id: 's1', roles: ['photographer'], status: 'active',
      valid_from: new Date(Date.now() - 1000).toISOString(), valid_until: null, revoked_at: null
    }
    expect(Auth.acceptCloudIdentity({ id: 'u1' }, membership)?.roles).toEqual(['photographer'])
  })
})
