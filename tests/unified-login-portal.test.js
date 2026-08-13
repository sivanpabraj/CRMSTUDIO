import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('UnifiedLogin portal gate', () => {
  beforeEach(() => {
    const win = {}
    vi.stubGlobal('window', win)
    vi.stubGlobal('AppConfig', { OTP_TTL_MS: 300000, isLocalDev: () => true })
    vi.stubGlobal('Utils', {
      normalizePhone: (p) => String(p || '').replace(/\D/g, ''),
      faToEn: (s) => s
    })
    vi.stubGlobal('DB', {
      find: () => null,
      get: () => [],
      flush: vi.fn()
    })
    vi.stubGlobal('Auth', {
      grantOtpLoginProof: vi.fn(async () => {}),
      loginWithOtp: vi.fn(async () => ({ ok: true, user: { id: 'u1' } })),
      clearOtpVerify: vi.fn(),
      _clearAttempts: vi.fn(),
      isOtpVerifyLocked: () => 0,
      recordOtpVerifyFail: () => 0
    })
    vi.stubGlobal('SecureDB', { update: vi.fn() })
    vi.stubGlobal('CustomerSession', null)
    vi.stubGlobal('PortalInvite', {
      needsOtpVerification: (u) => u?.portalStatus === 'pending_verify',
      verifyOtp: vi.fn(async () => ({ ok: true, user: { id: 'u1', portalStatus: 'active' } }))
    })
    vi.stubGlobal('Access', {})
    vi.stubGlobal('sessionStorage', {
      store: {},
      getItem(k) { return this.store[k] || null },
      setItem(k, v) { this.store[k] = v },
      removeItem(k) { delete this.store[k] }
    })
  })

  it('activates a pending portal after the unified OTP is verified', async () => {
    await import('../js/unified-login.js')
    const UnifiedLogin = window.UnifiedLogin

    const user = {
      id: 'u1',
      phone: '09121111111',
      portalStatus: 'pending_verify',
      portalOtp: { code: '111111', verified: false }
    }

    vi.stubGlobal('DB', {
      find: (_c, fn) => (fn({ id: 'u1', phone: '09121111111', portalStatus: 'pending_verify' }) ? user : null),
      get: () => [],
      flush: vi.fn()
    })

    UnifiedLogin._setPending({
      phone: '09121111111',
      code: '222222',
      expires: Date.now() + 60000
    })

    vi.spyOn(UnifiedLogin, 'resolvePhone').mockReturnValue({
      kind: 'staff',
      user,
      label: 'پرسنل'
    })

    const result = await UnifiedLogin.verifyOtp('09121111111', '222222')
    expect(result.ok).toBe(true)
    expect(result.next).toBe('redirect')
    expect(Auth.loginWithOtp).toHaveBeenCalledWith('u1')
    expect(SecureDB.update).toHaveBeenCalledWith('users', 'u1', expect.objectContaining({
      portalStatus: 'active',
      portalOtp: expect.objectContaining({ verified: true, via: 'unified_sms_login' })
    }))
  })
})
