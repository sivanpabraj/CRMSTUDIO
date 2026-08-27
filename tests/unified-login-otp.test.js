import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('UnifiedLogin.sendOtp local fallback', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('AppConfig', {
      OTP_TTL_MS: 300000,
      DEFAULT_STUDIO_NAME: 'Studio M',
      isLocalDev: () => true
    })
    vi.stubGlobal('Utils', {
      normalizePhone: p => String(p || '').replace(/\D/g, ''),
      isValidPhone: p => /^09\d{9}$/.test(String(p || '').replace(/\D/g, '')),
      isDemoOtpMode: () => true,
      storage: { get: () => ({ sends: [], lastSend: 0 }), set: vi.fn() },
      fmtNum: n => String(n)
    })
    vi.stubGlobal('DB', {
      find: () => null,
      get: (key) => key === 'studioInfo' ? { name: 'Studio M' } : []
    })
    vi.stubGlobal('Auth', {
      isLocked: () => 0,
      canSendOtp: () => ({ ok: true }),
      recordOtpSend: vi.fn()
    })
    vi.stubGlobal('SmsProvider', {
      isConfigured: () => true,
      sendStudio: vi.fn(async () => ({ ok: false, error: 'proxy 401' }))
    })
    vi.stubGlobal('sessionStorage', {
      store: {},
      getItem(k) { return this.store[k] || null },
      setItem(k, v) { this.store[k] = v },
      removeItem(k) { delete this.store[k] }
    })
    vi.stubGlobal('crypto', {
      getRandomValues(arr) { arr[0] = 123456; return arr }
    })
  })

  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    delete globalThis.UnifiedLogin
  })

  it('still opens the OTP step on localhost when SMS proxy fails', async () => {
    await import('../js/unified-login.js')
    const result = await globalThis.UnifiedLogin.sendOtp('09121234567')
    expect(result.ok).toBe(true)
    expect(result.demoCode).toMatch(/^\d{6}$/)
    expect(SmsProvider.sendStudio).toHaveBeenCalled()
    expect(globalThis.UnifiedLogin.getPending()?.phone).toBe('09121234567')
  })

  it('blocks when SMS fails outside demo/local mode', async () => {
    Utils.isDemoOtpMode = () => false
    await import('../js/unified-login.js')
    const result = await globalThis.UnifiedLogin.sendOtp('09121234567')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/پیامک|proxy/i)
    expect(globalThis.UnifiedLogin.getPending()).toBeNull()
  })
})
