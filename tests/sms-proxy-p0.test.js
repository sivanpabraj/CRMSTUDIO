import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('P0 SMS — production requires proxy', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    vi.stubGlobal('location', { hostname: 'app.example.com', protocol: 'https:' })
    vi.stubGlobal('AppConfig', { isLocalDev: () => false })
    vi.stubGlobal('Utils', {
      normalizePhone: p => String(p || '').replace(/\D/g, '')
    })
    vi.stubGlobal('DB', {
      get: () => ({
        smsProvider: 'kavenegar',
        smsApiKey: 'secret-key',
        smsLineNumber: '1000',
        smsProxyUrl: ''
      })
    })
    vi.stubGlobal('Cloud', undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('blocks direct provider send without proxy on non-localhost', async () => {
    await import('../js/sms.js')
    const SmsProvider = globalThis.window.SmsProvider
    const r = await SmsProvider.sendStudio('09121234567', 'hello')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/پراکسی|proxy/i)
  })

  it('allows send when proxyUrl is set (fetch mocked)', async () => {
    vi.stubGlobal('DB', {
      get: () => ({
        smsProxyUrl: 'https://abc.supabase.co/functions/v1/send-sms'
      })
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true })
    })))
    await import('../js/sms.js')
    const SmsProvider = globalThis.window.SmsProvider
    const r = await SmsProvider.sendStudio('09121234567', 'hello')
    expect(r.ok).toBe(true)
    expect(fetch).toHaveBeenCalled()
  })
})
