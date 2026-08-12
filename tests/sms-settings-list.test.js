import { describe, it, expect } from 'vitest'
import { sanitizeSmsSettings } from '../js/lib/sms-settings.js'
import { paginate } from '../js/lib/list-page.js'

describe('sanitizeSmsSettings', () => {
  it('strips API secrets when proxy URL is set', () => {
    const out = sanitizeSmsSettings({
      smsProxyUrl: 'https://x.supabase.co/functions/v1/send-sms',
      smsApiKey: 'secret',
      smsUsername: 'user',
      smsProvider: 'kavenegar',
      smsLineNumber: '5000'
    })
    expect(out.smsApiKey).toBe('')
    expect(out.smsUsername).toBe('')
    expect(out.smsProxyUrl).toContain('send-sms')
    expect(out.smsLineNumber).toBe('5000')
  })

  it('strips secrets in production without proxy', () => {
    const out = sanitizeSmsSettings({
      smsApiKey: 'secret',
      smsUsername: 'user'
    }, { isLocalDev: false })
    expect(out.smsApiKey).toBe('')
    expect(out.smsUsername).toBe('')
  })

  it('allows local secrets without proxy for dev', () => {
    const out = sanitizeSmsSettings({
      smsApiKey: 'dev-key',
      smsUsername: 'dev'
    }, { isLocalDev: true })
    expect(out.smsApiKey).toBe('dev-key')
  })
})

describe('paginate', () => {
  it('slices pages correctly', () => {
    const items = Array.from({ length: 95 }, (_, i) => i)
    const p0 = paginate(items, 0, 40)
    expect(p0.items).toHaveLength(40)
    expect(p0.pages).toBe(3)
    expect(p0.hasNext).toBe(true)
    const p2 = paginate(items, 2, 40)
    expect(p2.items).toHaveLength(15)
    expect(p2.hasNext).toBe(false)
  })
})
