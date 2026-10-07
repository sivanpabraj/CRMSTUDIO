import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('SessionSign v2', () => {
  beforeEach(() => {
    const store = {}
    const ss = {}
    vi.stubGlobal('localStorage', {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: (k) => { delete store[k] }
    })
    vi.stubGlobal('sessionStorage', {
      getItem: (k) => (k in ss ? ss[k] : null),
      setItem: (k, v) => { ss[k] = String(v) },
      removeItem: (k) => { delete ss[k] }
    })
    vi.stubGlobal('location', { hostname: 'localhost' })
    vi.stubGlobal('crypto', {
      getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 17 + 3) % 256
        return arr
      },
      subtle: undefined
    })
    vi.stubGlobal('Utils', {
      jsHmac: (secret, data) => `hmac:${secret.slice(0, 8)}:${data}`
    })
    vi.resetModules()
  })

  async function load() {
    await import('../js/session-sign.js')
    return globalThis.SessionSign || window.SessionSign
  }

  it('signs and verifies a session on localhost', async () => {
    const SessionSign = await load()
    const session = {
      userId: 'u1',
      expiresAt: Date.now() + 60_000,
      csrf: 'csrf1',
      loginAt: Date.now()
    }
    const signed = await SessionSign.sign(session)
    expect(signed.sig).toBeTruthy()
    expect(signed.v).toBe(2)
    expect(await SessionSign.verify(signed)).toBe(true)
  })

  it('rejects tampered session', async () => {
    const SessionSign = await load()
    const signed = await SessionSign.sign({
      userId: 'u1',
      expiresAt: Date.now() + 60_000,
      csrf: 'c',
      loginAt: 1
    })
    const bad = { ...signed, userId: 'hacker' }
    expect(await SessionSign.verify(bad)).toBe(false)
  })

  it('fail-closed on production when signature missing', async () => {
    vi.stubGlobal('location', { hostname: 'app.example.com' })
    const SessionSign = await load()
    const ok = await SessionSign.verify({
      userId: 'u1',
      expiresAt: Date.now() + 60_000,
      csrf: 'c',
      loginAt: 1
    })
    expect(ok).toBe(false)
  })

  it('allows unsigned session only on localhost', async () => {
    vi.stubGlobal('location', { hostname: 'localhost' })
    const SessionSign = await load()
    const ok = await SessionSign.verify({
      userId: 'u1',
      expiresAt: Date.now() + 60_000,
      csrf: 'c',
      loginAt: 1
    })
    expect(ok).toBe(true)
  })
})
