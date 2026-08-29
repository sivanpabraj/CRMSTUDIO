import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function storage() {
  return { data: {}, getItem(k) { return this.data[k] ?? null }, setItem(k, v) { this.data[k] = String(v) }, removeItem(k) { delete this.data[k] } }
}

describe('password reset and unified login behavior', () => {
  let PasswordReset
  let UnifiedLogin
  let session
  let users
  let contracts

  beforeEach(async () => {
    vi.resetModules()
    session = storage()
    users = [{ id: 'u1', name: 'M', phone: '09121234567', status: 'active', roles: ['studio_manager'] }]
    contracts = [{ id: 'c1', groomPhone: '09121234567', eventDate: '1405/06/02', status: 'active', couple: 'A' }]
    vi.stubGlobal('window', {})
    vi.stubGlobal('sessionStorage', session)
    vi.stubGlobal('AppConfig', {
      OTP_TTL_MS: 300000, OTP_MAX_SENDS_PER_HOUR: 2, OTP_RESEND_COOLDOWN_MS: 60000,
      OTP_MAX_VERIFY_ATTEMPTS: 2, DEFAULT_STUDIO_NAME: 'Studio', APP_NAME: 'Studio',
      allowsLocalIdentity: () => true, isLocalDev: () => true
    })
    vi.stubGlobal('Utils', {
      normalizePhone: value => String(value || '').replace(/\D/g, ''),
      normalizePassword: value => String(value || ''), isValidPhone: value => /^09\d{9}$/.test(String(value || '')),
      faToEn: String, fmtNum: String, daysUntil: value => value ? Number(String(value).slice(-2)) - 1 : null,
      todayJalali: () => '1405/06/01', isDemoOtpMode: () => true,
      storage: { get: vi.fn((_k, fallback) => fallback), set: vi.fn() }
    })
    vi.stubGlobal('DB', {
      get: vi.fn(name => name === 'users' ? users : name === 'contracts' ? contracts : name === 'studioInfo' ? { name: 'Studio' } : []),
      find: vi.fn((name, predicate) => (name === 'users' ? users : contracts).find(predicate) || null),
      insert: vi.fn((_name, value) => value), update: vi.fn((_name, _id, value) => value),
      flush: vi.fn(async () => {}), log: vi.fn()
    })
    vi.stubGlobal('Auth', {
      PW_RESET_PROOF_KEY: 'reset-proof', validatePassword: vi.fn(() => ''),
      resetManagerPassword: vi.fn(async () => ({ ok: true })),
      _otpSendData: vi.fn(() => ({ sends: [], lastSend: 0 })), canSendOtp: vi.fn(() => ({ ok: true })),
      recordOtpSend: vi.fn(), isLocked: vi.fn(() => 0), isOtpVerifyLocked: vi.fn(() => 0),
      recordOtpVerifyFail: vi.fn(() => 0), _recordFailedAttempt: vi.fn(), clearOtpVerify: vi.fn(), _clearAttempts: vi.fn(),
      grantOtpLoginProof: vi.fn(async () => {}), loginWithOtp: vi.fn(async () => ({ ok: true, user: users[0] })),
      login: vi.fn(async () => ({ ok: true, user: users[0] })), logout: vi.fn()
    })
    vi.stubGlobal('SmsProvider', { isConfigured: () => true, sendStudio: vi.fn(async () => ({ ok: true })) })
    vi.stubGlobal('Cloud', {
      isConfigured: () => true, sendPhoneOtp: vi.fn(async () => ({ ok: true })),
      verifyPhoneOtp: vi.fn(async () => ({ ok: true })), updateAuthPassword: vi.fn(async () => ({ ok: true })),
      signOut: vi.fn(async () => {}), restoreAuthoritativeIdentity: vi.fn(async () => ({ ok: false, code: 'no_active_membership' })),
      claimCustomerContracts: vi.fn(async () => ({ ok: true, contracts: [] }))
    })
    vi.stubGlobal('CustomerSession', {
      create: vi.fn((contract, phone) => ({ contractId: contract.id, phone })), save: vi.fn(async () => {}),
      isLocked: vi.fn(() => 0), recordFailedAttempt: vi.fn(), clearAttempts: vi.fn()
    })
    vi.stubGlobal('PortalInvite', {
      needsOtpVerification: vi.fn(() => false), portalLabel: vi.fn(() => 'Admin'),
      sendInvite: vi.fn(async () => ({ ok: true, code: '654321', smsSent: false })),
      verifyOtp: vi.fn(async () => ({ ok: true, user: users[0] }))
    })
    vi.stubGlobal('Access', {
      isStudioManager: user => user.roles?.includes('studio_manager'), isSystemAdmin: () => false,
      isManagement: user => user.roles?.includes('office_secretary')
    })
    vi.stubGlobal('SecureDB', { insert: vi.fn(async (_name, value) => ({ id: `${_name}-1`, ...value })) })
    vi.stubGlobal('MessagingShared', { logOutbound: vi.fn() })
    vi.stubGlobal('NotifyHub', { consultationRequested: vi.fn() })
    vi.stubGlobal('DemoSeed', { isDemoMode: () => false })
    vi.stubGlobal('SignedProof', { issue: vi.fn(async () => {}), clear: vi.fn() })
    await import('../js/password-reset.js')
    await import('../js/unified-login.js')
    PasswordReset = window.PasswordReset
    UnifiedLogin = window.UnifiedLogin
  })

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('identifies managers, masks phones, enforces rate limits and expires reset sessions', () => {
    expect(PasswordReset._isManagerUser(null)).toBe(false)
    expect(PasswordReset._isManagerUser(users[0])).toBe(true)
    expect(PasswordReset.findManagerByPhone('0912 123 4567')?.id).toBe('u1')
    expect(PasswordReset._maskPhone('09121234567')).toBe('0912***4567')
    expect(PasswordReset._maskPhone('0912')).toBe('0912')
    expect(PasswordReset._canSendOtp('p').ok).toBe(true)
    Utils.storage.get.mockReturnValueOnce({ sends: [Date.now(), Date.now()], lastSend: 0 })
    expect(PasswordReset._canSendOtp('p').ok).toBe(false)
    Utils.storage.get.mockReturnValueOnce({ sends: [], lastSend: Date.now() })
    expect(PasswordReset._canSendOtp('p').ok).toBe(false)
    PasswordReset._recordSend('p')
    expect(Utils.storage.set).toHaveBeenCalled()
    expect(PasswordReset.getSession()).toBeNull()
    session.setItem(PasswordReset.SESSION_KEY, '{bad')
    expect(PasswordReset.getSession()).toBeNull()
    session.setItem(PasswordReset.SESSION_KEY, JSON.stringify({ expiresAt: Date.now() - 1 }))
    expect(PasswordReset.getSession()).toBeNull()
  })

  it('sends local reset OTP and handles validation, account, SMS and provider failures', async () => {
    expect((await PasswordReset.sendOtp('bad')).ok).toBe(false)
    expect((await PasswordReset.sendOtp('09121234567')).ok).toBe(true)
    expect(PasswordReset.getSession()?.userId).toBe('u1')
    users = []
    expect((await PasswordReset.sendOtp('09121234567')).ok).toBe(false)
    users = [{ id: 'u1', phone: '09121234567', status: 'disabled', roles: ['studio_manager'] }]
    expect((await PasswordReset.sendOtp('09121234567')).ok).toBe(false)
    users[0].status = 'active'
    vi.stubGlobal('SmsProvider', undefined)
    expect((await PasswordReset.sendOtp('09121234567')).code).toBe('no_sms')
    vi.stubGlobal('SmsProvider', { isConfigured: () => true, sendStudio: vi.fn(async () => ({ ok: false, error: 'down' })) })
    expect((await PasswordReset.sendOtp('09121234567')).error).toBe('down')
  })

  it('uses uniform server reset responses and never persists raw production OTP', async () => {
    AppConfig.allowsLocalIdentity = () => false
    expect((await PasswordReset.sendOtp('09121234567')).cloudOtp).toBe(true)
    Cloud.sendPhoneOtp.mockResolvedValueOnce({ ok: false })
    expect((await PasswordReset.sendOtp('09121234567')).ok).toBe(true)
    vi.stubGlobal('Cloud', undefined)
    expect((await PasswordReset.sendOtp('09121234567')).code).toBe('cloud_required')
  })

  it('verifies local reset code, counts failures and issues signed proof', async () => {
    await PasswordReset.sendOtp('09121234567')
    const reset = PasswordReset.getSession()
    expect((await PasswordReset.verifyAndReset('09120000000', reset.code, 'Strong!9')).ok).toBe(false)
    expect((await PasswordReset.verifyAndReset('09121234567', '000000', 'Strong!9')).ok).toBe(false)
    expect((await PasswordReset.verifyAndReset('09121234567', reset.code, 'Strong!9')).ok).toBe(true)
    expect(SignedProof.issue).toHaveBeenCalled()
    expect(Auth.resetManagerPassword).toHaveBeenCalledWith('09121234567', 'Strong!9', { otpVerified: true })
    expect((await PasswordReset.verifyAndReset('09121234567', reset.code, 'Strong!9')).ok).toBe(false)
  })

  it('verifies production reset through Supabase and signs out', async () => {
    AppConfig.allowsLocalIdentity = () => false
    expect((await PasswordReset.verifyAndReset('09121234567', '123456', 'Strong!9')).ok).toBe(true)
    expect(Cloud.signOut).toHaveBeenCalled()
    Auth.validatePassword.mockReturnValueOnce('weak')
    expect((await PasswordReset.verifyAndReset('09121234567', '123456', 'weak')).ok).toBe(false)
    Cloud.verifyPhoneOtp.mockResolvedValueOnce({ ok: false })
    expect((await PasswordReset.verifyAndReset('09121234567', '123456', 'Strong!9')).ok).toBe(false)
    Cloud.updateAuthPassword.mockResolvedValueOnce({ ok: false, error: 'denied' })
    expect((await PasswordReset.verifyAndReset('09121234567', '123456', 'Strong!9')).error).toBe('denied')
  })

  it('resolves manager, admin, staff, customer and guest destinations', () => {
    expect(UnifiedLogin._resolvedCloudIdentity({ roles: ['studio_manager'] }).kind).toBe('manager')
    expect(UnifiedLogin._resolvedCloudIdentity({ roles: ['office_secretary'] }).kind).toBe('admin')
    expect(UnifiedLogin._resolvedCloudIdentity({ roles: ['photographer'] }).kind).toBe('staff')
    expect(UnifiedLogin.resolvePhone('09121234567').kind).toBe('manager')
    users[0].roles = ['office_secretary']
    expect(UnifiedLogin.resolvePhone('09121234567').kind).toBe('admin')
    users[0].roles = ['photographer']
    expect(UnifiedLogin.resolvePhone('09121234567').kind).toBe('staff')
    users = []
    expect(UnifiedLogin.resolvePhone('09121234567').kind).toBe('customer')
    contracts = []
    expect(UnifiedLogin.resolvePhone('09121234567').kind).toBe('guest')
    expect(UnifiedLogin.landingUrl(null)).toBe('index.html')
    expect(UnifiedLogin.landingUrl({ kind: 'manager' })).toBe('studio-m/')
    expect(UnifiedLogin.landingUrl({ kind: 'staff' })).toContain('portal')
    expect(UnifiedLogin.landingUrl({ kind: 'customer' })).toBe('customer.html')
  })

  it('selects upcoming customer contract and excludes cancelled rows', () => {
    contracts.push({ id: 'c2', bridePhone: '09121234567', eventDate: '1405/06/10', status: 'active' })
    contracts.push({ id: 'c3', phone: '09121234567', eventDate: '1405/06/01', status: 'cancelled' })
    expect(UnifiedLogin.findContractsByPhone('09121234567')).toHaveLength(2)
    expect(UnifiedLogin.pickContract(contracts.filter(c => c.status === 'active')).id).toBe('c1')
    expect(UnifiedLogin.pickContract([])).toBeNull()
  })

  it('sends local unified OTP through SMS, demo, invite and server customer routes', async () => {
    expect((await UnifiedLogin.sendOtp('bad')).ok).toBe(false)
    expect((await UnifiedLogin.sendOtp('09121234567')).ok).toBe(true)
    expect(MessagingShared.logOutbound).toHaveBeenCalled()
    SmsProvider.sendStudio.mockResolvedValueOnce({ ok: false, error: 'down' })
    expect((await UnifiedLogin.sendOtp('09121234567')).ok).toBe(false)
    PortalInvite.needsOtpVerification.mockReturnValue(true)
    expect((await UnifiedLogin.sendOtp('09121234567')).inviteLogin).toBe(true)
    users = []
    expect((await UnifiedLogin.sendOtp('09121234567')).cloudOtp).toBe(true)
    AppConfig.allowsLocalIdentity = () => false
    expect((await UnifiedLogin.sendOtp('09121234567')).cloudOtp).toBe(true)
  })

  it('verifies server OTP for staff, guest and claimed customer contracts', async () => {
    AppConfig.allowsLocalIdentity = () => false
    UnifiedLogin._setPending({ phone: '09121234567', cloudOtp: true, expires: Date.now() + 10000 })
    Cloud.restoreAuthoritativeIdentity.mockResolvedValueOnce({ ok: true, identity: { id: 'u1', roles: ['studio_manager'] } })
    expect((await UnifiedLogin.verifyOtp('09121234567', '123456')).url).toBe('studio-m/')
    UnifiedLogin._setPending({ phone: '09121234567', cloudOtp: true, expires: Date.now() + 10000 })
    expect((await UnifiedLogin.verifyOtp('09121234567', '123456')).next).toBe('consultation')
    UnifiedLogin._setPending({ phone: '09121234567', cloudOtp: true, expires: Date.now() + 10000 })
    Cloud.claimCustomerContracts.mockResolvedValueOnce({ ok: true, contracts: [{
      local_id: 'cloud-c1', contract_id: 'remote-c1', studio_id: 's1', payload: { groom: 'G' }, status: 'active'
    }] })
    expect((await UnifiedLogin.verifyOtp('09121234567', '123456')).url).toBe('customer.html')
    expect(CustomerSession.save).toHaveBeenCalled()
  })

  it('rejects invalid, expired, locked and wrong local unified OTP', async () => {
    expect((await UnifiedLogin.verifyOtp('0912', '123456')).ok).toBe(false)
    UnifiedLogin._setPending({ phone: '09121234567', code: '111111', expires: Date.now() - 1 })
    expect((await UnifiedLogin.verifyOtp('09121234567', '111111')).ok).toBe(false)
    UnifiedLogin._setPending({ phone: '09121234567', code: '111111', expires: Date.now() + 10000 })
    Auth.isOtpVerifyLocked.mockReturnValueOnce(2)
    expect((await UnifiedLogin.verifyOtp('09121234567', '000000')).ok).toBe(false)
    expect((await UnifiedLogin.verifyOtp('09121234567', '000000')).ok).toBe(false)
  })

  it('finishes staff/customer login and invite verification', async () => {
    const customer = { kind: 'customer', contracts }
    expect((await UnifiedLogin._completeLogin(customer, '09121234567', { contractIds: ['c1'] })).ok).toBe(true)
    expect((await UnifiedLogin.finishStaffLogin({ kind: 'manager' }, users[0])).ok).toBe(true)
    expect((await UnifiedLogin.finishStaffLogin({}, null)).ok).toBe(false)
    UnifiedLogin._setPending({ phone: '09121234567', portalVerify: true, userId: 'u1', expires: Date.now() + 10000 })
    expect((await UnifiedLogin.verifyPortalInviteCode('09121234567', '654321')).ok).toBe(true)
    expect((await UnifiedLogin.verifyPortalInviteCode('09121234567', '654321')).ok).toBe(false)
  })

  it('supports password login and rejects unknown local phone', async () => {
    expect((await UnifiedLogin.loginWithPassword('bad', 'x')).ok).toBe(false)
    expect((await UnifiedLogin.loginWithPassword('09121234567', '')).ok).toBe(false)
    expect((await UnifiedLogin.loginWithPassword('09121234567', 'pw')).ok).toBe(true)
    users = []; contracts = []
    expect((await UnifiedLogin.loginWithPassword('09121234567', 'pw')).ok).toBe(false)
    AppConfig.allowsLocalIdentity = () => false
    Auth.login.mockResolvedValueOnce({ ok: true, user: { roles: ['photographer'] } })
    expect((await UnifiedLogin.loginWithPassword('09121234567', 'pw')).resolved.kind).toBe('staff')
  })

  it('validates and saves consultation using authoritative storage adapter', async () => {
    expect((await UnifiedLogin.saveConsultation({})).ok).toBe(false)
    expect((await UnifiedLogin.saveConsultation({ name: 'N' })).ok).toBe(false)
    expect((await UnifiedLogin.saveConsultation({ name: 'N', date: '1405/06/02' })).ok).toBe(false)
    const result = await UnifiedLogin.saveConsultation({ phone: '0912', name: ' N ', date: '1405/06/02', time: '10:00', notes: 'note' })
    expect(result.ok).toBe(true)
    expect(SecureDB.insert).toHaveBeenCalledTimes(2)
    expect(NotifyHub.consultationRequested).toHaveBeenCalled()
  })

  it('uses fallback rate and lock adapters when Auth is unavailable', async () => {
    vi.stubGlobal('Auth', undefined)
    Utils.storage.get.mockReturnValue({ sends: [], lastSend: 0 })
    expect(UnifiedLogin._getRate('p').sends).toEqual([])
    UnifiedLogin._recordSend('p')
    expect(Utils.storage.set).toHaveBeenCalled()
    Utils.storage.get.mockReturnValue({ sends: [], lastSend: 0 })
    expect(UnifiedLogin._canSend('p').ok).toBe(true)
    Utils.storage.get.mockReturnValueOnce({ sends: [Date.now(), Date.now()], lastSend: 0 })
    expect(UnifiedLogin._canSend('p').ok).toBe(false)
    Utils.storage.get.mockReturnValueOnce({ sends: [], lastSend: Date.now() })
    expect(UnifiedLogin._canSend('p').ok).toBe(false)
    CustomerSession.isLocked.mockReturnValueOnce(2)
    expect((await UnifiedLogin.sendOtp('09121234567')).ok).toBe(false)
  })

  it('handles malformed pending state and unavailable SMS without claiming success', async () => {
    session.setItem(UnifiedLogin.OTP_KEY, '{bad')
    expect(UnifiedLogin.getPending()).toBeNull()
    session.setItem(UnifiedLogin.OTP_KEY, JSON.stringify({ expires: Date.now() - 1 }))
    expect(UnifiedLogin.getPending()).toBeNull()
    vi.stubGlobal('SmsProvider', undefined)
    Utils.isDemoOtpMode = () => false
    expect((await UnifiedLogin.sendOtp('09121234567')).ok).toBe(false)
  })

  it('requires both unified OTP and portal invite proof for pending staff', async () => {
    PortalInvite.needsOtpVerification.mockReturnValue(true)
    UnifiedLogin._setPending({ phone: '09121234567', code: '111111', expires: Date.now() + 10000 })
    const first = await UnifiedLogin.verifyOtp('09121234567', '111111')
    expect(first.next).toBe('portal_verify')
    PortalInvite.verifyOtp.mockResolvedValueOnce({ ok: false, error: 'bad invite' })
    expect((await UnifiedLogin.verifyPortalInviteCode('09121234567', '000000')).ok).toBe(false)
    UnifiedLogin._setPending({ phone: '09121234567', portalVerify: true, userId: 'u1', expires: Date.now() - 1 })
    expect((await UnifiedLogin.verifyPortalInviteCode('09121234567', '654321')).ok).toBe(false)
    UnifiedLogin._setPending({ phone: '09121234567', portalVerify: true, userId: 'u1', expires: Date.now() + 10000 })
    vi.stubGlobal('PortalInvite', undefined)
    expect((await UnifiedLogin.verifyPortalInviteCode('09121234567', '654321')).ok).toBe(false)
  })

  it('propagates failed staff completion and cloud verification outcomes', async () => {
    Auth.loginWithOtp.mockResolvedValueOnce({ ok: false, error: 'login denied' })
    expect((await UnifiedLogin.finishStaffLogin({ kind: 'staff' }, users[0])).ok).toBe(false)
    AppConfig.allowsLocalIdentity = () => false
    UnifiedLogin._setPending({ phone: '09121234567', cloudOtp: true, expires: Date.now() + 10000 })
    Cloud.verifyPhoneOtp.mockResolvedValueOnce({ ok: false, error: 'bad otp' })
    expect((await UnifiedLogin.verifyOtp('09121234567', '000000')).ok).toBe(false)
    UnifiedLogin._setPending({ phone: '09121234567', cloudOtp: true, expires: Date.now() + 10000 })
    Cloud.restoreAuthoritativeIdentity.mockResolvedValueOnce({ ok: false, code: 'tenant_selection_required' })
    expect((await UnifiedLogin.verifyOtp('09121234567', '123456')).code).toBe('tenant_selection_required')
    UnifiedLogin._setPending({ phone: '09121234567', code: '111111', expires: Date.now() + 10000 })
    expect((await UnifiedLogin.verifyOtp('09121234567', '111111')).code).toBe('cloud_otp_required')
  })

  it('covers reset fallback configuration and excessive verify attempts', async () => {
    delete AppConfig.allowsLocalIdentity
    AppConfig.isLocalDev = () => true
    await PasswordReset.sendOtp('09121234567')
    const reset = PasswordReset.getSession()
    reset.verifyAttempts = AppConfig.OTP_MAX_VERIFY_ATTEMPTS
    session.setItem(PasswordReset.SESSION_KEY, JSON.stringify(reset))
    expect((await PasswordReset.verifyAndReset('09121234567', reset.code, 'Strong!9')).ok).toBe(false)
    vi.stubGlobal('SignedProof', undefined)
    await PasswordReset.sendOtp('09121234567')
    expect((await PasswordReset.verifyAndReset('09121234567', PasswordReset.getSession().code, 'Strong!9')).ok).toBe(true)
  })

  it('propagates invite, rate, cloud and customer completion failures', async () => {
    Auth.canSendOtp.mockReturnValueOnce({ ok: false, error: 'rate' })
    expect((await UnifiedLogin.sendOtp('09121234567')).error).toBe('rate')
    PortalInvite.needsOtpVerification.mockReturnValue(true)
    PortalInvite.sendInvite.mockResolvedValueOnce({ ok: false, error: 'invite failed' })
    expect((await UnifiedLogin.sendOtp('09121234567')).ok).toBe(false)
    users = []
    Cloud.sendPhoneOtp.mockResolvedValueOnce({ ok: false, error: 'cloud failed' })
    expect((await UnifiedLogin.sendOtp('09121234567')).ok).toBe(false)
    expect((await UnifiedLogin._completeLogin({ kind: 'customer', contracts: [] }, '0912', { contractIds: [] })).ok).toBe(false)
    expect((await UnifiedLogin._completeLogin({ kind: 'staff' }, '0912', {})).ok).toBe(false)
  })

  it('creates local guest consultation only after a correct OTP', async () => {
    users = []; contracts = []
    UnifiedLogin._setPending({ phone: '09121234567', code: '111111', expires: Date.now() + 10000 })
    const result = await UnifiedLogin.verifyOtp('09121234567', '111111')
    expect(result.next).toBe('consultation')
    expect(UnifiedLogin.getPending().verified).toBe(true)
  })

  it('falls back across contract date states and plain user resolution', () => {
    vi.stubGlobal('Access', undefined)
    expect(UnifiedLogin.resolvePhone('09121234567').label).toBe('کاربر')
    const original = Utils.daysUntil
    Utils.daysUntil = value => value === 'future' ? 1 : value === 'past' ? -1 : null
    expect(UnifiedLogin.pickContract([{ id: 'past', eventDate: 'past' }, { id: 'future', eventDate: 'future' }]).id).toBe('future')
    expect(UnifiedLogin.pickContract([{ id: 'none', eventDate: '' }, { id: 'past', eventDate: 'past' }])).toBeTruthy()
    Utils.daysUntil = original
  })

  it('covers manager-role aliases and reset response defaults', async () => {
    vi.stubGlobal('normalizeRole', undefined)
    expect(PasswordReset._isManagerUser({ roles: ['مدیر آتلیه'] })).toBe(true)
    expect(PasswordReset._isManagerUser({ roles: ['مدیر سیستم'] })).toBe(true)
    expect(PasswordReset._isManagerUser({})).toBe(false)
    Utils.storage.get.mockReturnValueOnce({ sends: undefined, lastSend: 0 })
    expect(PasswordReset._getRate('p').sends).toEqual([])
    SmsProvider.sendStudio.mockResolvedValueOnce({ ok: false })
    expect((await PasswordReset.sendOtp('09121234567')).error).toContain('خطا در ارسال')
    vi.stubGlobal('DemoSeed', { isDemoMode: () => true })
    expect((await PasswordReset.sendOtp('09121234567')).demoCode).toHaveLength(6)
  })

  it('covers unified destination, rate, pending and SMS fallback alternatives', async () => {
    expect(UnifiedLogin._resolvedCloudIdentity({}).kind).toBe('staff')
    expect(UnifiedLogin.landingUrl({ kind: 'admin' })).toBe('studio-m/')
    expect(UnifiedLogin.landingUrl({ kind: 'guest' })).toBe('index.html')
    DB.get.mockImplementation(name => name === 'contracts' ? null : name === 'users' ? users : name === 'studioInfo' ? {} : [])
    expect(UnifiedLogin.findContractsByPhone('0912')).toEqual([])
    Utils.storage.get.mockReturnValueOnce({ sends: undefined, lastSend: 0 })
    vi.stubGlobal('Auth', undefined)
    expect(UnifiedLogin._getRate('p').sends).toEqual([])
    Utils.storage.get.mockReturnValueOnce({ sends: [], lastSend: Date.now() - 120000 })
    expect(UnifiedLogin._canSend('p').ok).toBe(true)
    vi.stubGlobal('Auth', {
      canSendOtp: () => ({ ok: true }), isLocked: () => 0, recordOtpSend: vi.fn()
    })
    vi.stubGlobal('SmsProvider', { isConfigured: () => true, sendStudio: vi.fn(async () => undefined) })
    expect((await UnifiedLogin.sendOtp('09121234567')).error).toContain('خطا در ارسال')
  })

  it('covers invite delivery, cloud absence and wrong-code lock escalation', async () => {
    PortalInvite.needsOtpVerification.mockReturnValue(true)
    PortalInvite.sendInvite.mockResolvedValueOnce({ ok: true, code: '', demoCode: '222222', smsSent: true })
    const sent = await UnifiedLogin.sendOtp('09121234567')
    expect(sent.demoCode).toBe('')
    AppConfig.allowsLocalIdentity = () => false
    vi.stubGlobal('Cloud', undefined)
    expect((await UnifiedLogin.sendOtp('09121234567')).code).toBe('cloud_required')
    AppConfig.allowsLocalIdentity = () => true
    vi.stubGlobal('Cloud', {
      isConfigured: () => true, sendPhoneOtp: vi.fn(async () => ({ ok: true }))
    })
    UnifiedLogin._setPending({ phone: '09121234567', cloudOtp: true, expires: Date.now() + 10000 })
    vi.stubGlobal('Cloud', undefined)
    expect((await UnifiedLogin.verifyOtp('09121234567', '111111')).ok).toBe(false)
    vi.stubGlobal('Auth', {
      isOtpVerifyLocked: () => 0, recordOtpVerifyFail: () => 2, _recordFailedAttempt: vi.fn()
    })
    UnifiedLogin._setPending({ phone: '09121234567', code: '111111', expires: Date.now() + 10000 })
    expect((await UnifiedLogin.verifyOtp('09121234567', '000000')).error).toContain('تعداد تلاش')
  })

  it('maps partial claimed contracts and updates an existing local contract', async () => {
    AppConfig.allowsLocalIdentity = () => false
    UnifiedLogin._setPending({ phone: '09121234567', cloudOtp: true, expires: Date.now() + 10000 })
    Cloud.restoreAuthoritativeIdentity.mockResolvedValueOnce({ ok: false, code: 'no_active_membership' })
    Cloud.claimCustomerContracts.mockResolvedValueOnce({ ok: true, contracts: [{
      local_id: '', contract_id: 'c1', studio_id: 's1', contract_num: 'N', groom: 'G', bride: 'B', event_date: '1405/06/01', status: ''
    }] })
    DB.find.mockImplementation((name, predicate) => name === 'contracts' ? contracts.find(predicate) || null : users.find(predicate) || null)
    const result = await UnifiedLogin.verifyOtp('09121234567', '123456')
    expect(result.ok).toBe(true)
    expect(DB.update).toHaveBeenCalled()
  })

  it('covers local customer/session and portal verification failure branches', async () => {
    vi.stubGlobal('Auth', undefined)
    vi.stubGlobal('Cloud', undefined)
    users = []; contracts = [{ id: 'c1', phone: '09121234567', status: 'active' }]
    UnifiedLogin._setPending({ phone: '09121234567', code: '111111', contractIds: undefined, expires: Date.now() + 10000 })
    expect((await UnifiedLogin.verifyOtp('09121234567', '111111')).ok).toBe(true)

    vi.stubGlobal('Auth', {
      grantOtpLoginProof: vi.fn(async () => {}), loginWithOtp: vi.fn(async () => ({ ok: false, error: 'denied' }))
    })
    users = [{ id: 'u1', phone: '09121234567', roles: ['photographer'], status: 'active' }]
    UnifiedLogin._setPending({ phone: '09121234567', portalVerify: true, userId: 'u1', expires: Date.now() + 10000 })
    PortalInvite.verifyOtp.mockResolvedValueOnce({ ok: true, user: null })
    expect((await UnifiedLogin.verifyPortalInviteCode('09121234567', '111111')).ok).toBe(false)
    UnifiedLogin._setPending({ phone: '09121234567', portalVerify: true, userId: 'missing', expires: Date.now() + 10000 })
    PortalInvite.verifyOtp.mockResolvedValueOnce({ ok: true, user: null })
    expect((await UnifiedLogin.verifyPortalInviteCode('09121234567', '111111')).ok).toBe(false)
  })

  it('covers optional consultation fields and notification absence', async () => {
    vi.stubGlobal('NotifyHub', undefined)
    const result = await UnifiedLogin.saveConsultation({ phone: '0912', name: 'N', date: '1405/06/02', time: '10', notes: undefined })
    expect(result.ok).toBe(true)
  })

  it('covers remaining unified-login branch alternatives', async () => {
    const originalDays = Utils.daysUntil
    Utils.daysUntil = value => ({ future1: 1, future2: 2, past: -1 }[value] ?? null)
    expect(UnifiedLogin.pickContract([{ id: 'a', date: 'future2' }, { id: 'b', date: 'future1' }]).id).toBe('b')
    expect(UnifiedLogin.pickContract([{ id: 'a', eventDate: 'past' }, { id: 'b', eventDate: 'future1' }]).id).toBe('b')
    expect(UnifiedLogin.pickContract([{ id: 'a' }, { id: 'b', eventDate: 'past' }])).toBeTruthy()
    Utils.daysUntil = originalDays

    users[0].roles = ['office_secretary']
    vi.stubGlobal('PortalInvite', undefined)
    expect(UnifiedLogin.resolvePhone('09121234567').label).toBe('ادمین')
    vi.stubGlobal('PortalInvite', {
      needsOtpVerification: () => false, verifyOtp: vi.fn(), sendInvite: vi.fn(), portalLabel: () => 'A'
    })

    AppConfig.OTP_MAX_SENDS_PER_HOUR = undefined
    AppConfig.OTP_RESEND_COOLDOWN_MS = undefined
    vi.stubGlobal('Auth', undefined)
    Utils.storage.get.mockReturnValueOnce({ sends: [], lastSend: Date.now() - 120000 })
    expect(UnifiedLogin._canSend('p').ok).toBe(true)

    AppConfig.allowsLocalIdentity = () => false
    vi.stubGlobal('Cloud', { isConfigured: () => true, sendPhoneOtp: vi.fn(async () => ({ ok: false })) })
    expect((await UnifiedLogin.sendOtp('09121234567')).ok).toBe(false)

    AppConfig.allowsLocalIdentity = () => true
    vi.stubGlobal('Auth', {
      isOtpVerifyLocked: () => 0, recordOtpVerifyFail: () => 0, _recordFailedAttempt: vi.fn(),
      clearOtpVerify: vi.fn(), _clearAttempts: vi.fn()
    })
    UnifiedLogin._setPending({ phone: '09121234567', code: '111111', expires: Date.now() + 10000 })
    expect((await UnifiedLogin.verifyOtp('09120000000', '111111')).ok).toBe(false)

    const complete = vi.spyOn(UnifiedLogin, '_completeLogin').mockResolvedValueOnce({ ok: false, error: 'denied' })
    UnifiedLogin._setPending({ phone: '09121234567', code: '111111', expires: Date.now() + 10000 })
    expect((await UnifiedLogin.verifyOtp('09121234567', '111111')).ok).toBe(false)
    complete.mockResolvedValueOnce({ ok: true, next: 'portal_verify' })
    UnifiedLogin._setPending({ phone: '09121234567', code: '111111', expires: Date.now() + 10000 })
    expect((await UnifiedLogin.verifyOtp('09121234567', '111111')).next).toBe('portal_verify')
    complete.mockRestore()

    Auth.login = vi.fn(async () => ({ ok: false, error: 'login failed' }))
    expect((await UnifiedLogin.loginWithPassword('09121234567', 'pw')).ok).toBe(false)
  })
})
