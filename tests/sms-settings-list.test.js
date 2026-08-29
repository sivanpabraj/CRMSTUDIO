import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { paginate } from '../js/lib/list-page.js'

function smsHarness() {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }))
  const context = {
    window: {}, fetch,
    Utils: { normalizePhone: value => String(value) },
    Cloud: {
      isConfigured: () => true,
      resolvedConfig: () => ({
        url: 'https://project.supabase.co', anonKey: 'public-anon', studioId: 'studio-1'
      }),
      session: async () => ({ access_token: 'user-jwt' }),
    },
    crypto: { randomUUID: () => 'command-0001' },
  }
  vm.runInNewContext(readFileSync('js/sms.js', 'utf8'), context)
  return { provider: context.window.SmsProvider, fetch }
}

describe('server-only SMS client', () => {
  it('always calls the project Edge Function with the authenticated session', async () => {
    const { provider, fetch } = smsHarness()
    await expect(provider.sendStudio('09121234567', 'پیام', 'generic')).resolves.toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledOnce()
    const [url, request] = fetch.mock.calls[0]
    expect(url).toBe('https://project.supabase.co/functions/v1/send-sms')
    expect(request.headers.Authorization).toBe('Bearer user-jwt')
    const body = JSON.parse(request.body)
    expect(body).toMatchObject({ studioId: 'studio-1', phones: ['09121234567'], purpose: 'generic' })
    expect(body).not.toHaveProperty('apiKey')
    expect(body).not.toHaveProperty('username')
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
