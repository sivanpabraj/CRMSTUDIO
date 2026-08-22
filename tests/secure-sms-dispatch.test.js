import { describe, expect, it } from 'vitest'
import {
  isAllowedOrigin,
  normalizeIranPhone,
  readBoundedJson,
  validateSmsPayload,
} from '../supabase/functions/_shared/request-policy.js'

describe('SMS Edge request policy (behavior)', () => {
  const valid = {
    studioId: '20000000-0000-4000-8000-000000000001',
    purpose: 'cheque_reminder',
    idempotencyKey: 'sms-command-0001',
    phone: '+989123456789',
    text: 'یادآوری سررسید چک',
  }

  it('normalizes only valid Iranian mobile numbers', () => {
    expect(normalizeIranPhone('+98 912 345 6789')).toBe('09123456789')
    expect(normalizeIranPhone('9123456789')).toBe('09123456789')
    expect(normalizeIranPhone('02112345678')).toBeNull()
  })

  it('rejects application attempts to impersonate Auth OTP/reset', () => {
    expect(validateSmsPayload({ ...valid, purpose: 'otp_login' })).toEqual({ ok: false, error: 'purpose_not_allowed' })
    expect(validateSmsPayload({ ...valid, purpose: 'password_reset' })).toEqual({ ok: false, error: 'purpose_not_allowed' })
  })

  it('accepts a bounded, idempotent business message', () => {
    expect(validateSmsPayload(valid)).toMatchObject({ ok: true, purpose: 'cheque_reminder', phones: ['09123456789'] })
  })

  it('fails closed for unconfigured and foreign browser origins', () => {
    expect(isAllowedOrigin('https://crm.example', '')).toBe(false)
    expect(isAllowedOrigin('https://evil.example', 'https://crm.example')).toBe(false)
    expect(isAllowedOrigin('https://crm.example', 'https://crm.example')).toBe(true)
  })

  it('enforces the byte limit without trusting Content-Length', async () => {
    const req = new Request('https://edge.test', { method: 'POST', body: JSON.stringify({ text: 'x'.repeat(100) }) })
    await expect(readBoundedJson(req, 32)).rejects.toThrow('request_too_large')
  })
})
