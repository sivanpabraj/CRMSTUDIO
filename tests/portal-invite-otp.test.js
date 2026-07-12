import { describe, it, expect, vi, beforeAll } from 'vitest'
import { webcrypto } from 'node:crypto'

describe('PortalInvite OTP hash', () => {
  beforeAll(() => {
    vi.stubGlobal('crypto', webcrypto)
    vi.stubGlobal('Utils', {
      normalizePhone: p => String(p || '').replace(/\D/g, ''),
      generateOtp6: () => '123456',
      legacyHashPassword: async (pw, salt) => {
        const enc = new TextEncoder()
        const data = enc.encode(String(salt) + String(pw))
        const hash = await crypto.subtle.digest('SHA-256', data)
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
      }
    })
    vi.stubGlobal('AppConfig', { DEFAULT_STUDIO_NAME: 'Test Studio' })
    vi.stubGlobal('DB', { get: () => ({ name: 'Studio' }), find: () => null })
    vi.stubGlobal('SecureDB', { update: vi.fn(), insert: vi.fn() })
    vi.stubGlobal('Access', {})
    vi.stubGlobal('Auth', { validatePassword: () => null, hashCredentials: async () => ({ password: 'x', salt: 'y' }) })
    vi.stubGlobal('SmsProvider', null)
    vi.stubGlobal('MessagingShared', null)
    vi.stubGlobal('location', { origin: 'http://localhost', pathname: '/studio-m/' })
    vi.stubGlobal('window', globalThis)
  })

  it('stores hashed OTP not plain code', async () => {
    await import('../js/portal-invite.js')
    const PortalInvite = globalThis.PortalInvite

    const stored = await PortalInvite._hashOtpCode('654321')
    expect(stored.codeHash).toMatch(/^[a-f0-9]{64}$/)
    expect(stored.codeSalt).toBeTruthy()
    expect(stored.code).toBeUndefined()

    expect(await PortalInvite._verifyOtpCode('654321', stored)).toBe(true)
    expect(await PortalInvite._verifyOtpCode('000000', stored)).toBe(false)
  })

  it('supports legacy plain code during migration', async () => {
    const PortalInvite = globalThis.PortalInvite
    expect(await PortalInvite._verifyOtpCode('111111', { code: '111111' })).toBe(true)
    expect(await PortalInvite._verifyOtpCode('222222', { code: '111111' })).toBe(false)
  })
})
