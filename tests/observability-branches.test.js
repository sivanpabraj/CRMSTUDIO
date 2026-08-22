import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SMObservability } from '../js/lib/observability.js'

describe('observability redaction and delivery behavior', () => {
  const original = {}

  beforeEach(() => {
    for (const name of ['DB', 'window', 'fetch', 'AppConfig']) original[name] = globalThis[name]
    SMObservability._buf = []
    SMObservability._bound = false
  })

  afterEach(() => {
    for (const name of ['DB', 'window', 'fetch', 'AppConfig']) {
      if (original[name] === undefined) delete globalThis[name]
      else globalThis[name] = original[name]
    }
    SMObservability._buf = []
    SMObservability._bound = false
    vi.restoreAllMocks()
  })

  it('redacts nested credentials, truncates depth and array/object/string bounds', () => {
    const oversizedObject = Object.fromEntries(Array.from({ length: 55 }, (_, index) => [`field${index}`, index]))
    const result = SMObservability._redact({
      password: 'plain',
      note: 'Bearer abc.def token=visible',
      values: Array.from({ length: 35 }, (_, index) => index),
      deep: { a: { b: { c: { d: { e: 'secret' } } } } },
      oversizedObject,
      fn: () => 'callable',
      nil: null,
      yes: true
    })
    expect(result.password).toBe('[redacted]')
    expect(result.note).not.toContain('abc.def')
    expect(result.note).toContain('token=[redacted]')
    expect(result.values).toHaveLength(30)
    expect(result.deep.a.b.c.d).toBe('[truncated]')
    expect(Object.keys(result.oversizedObject)).toHaveLength(50)
    expect(result.fn).toContain('callable')
    expect(result.nil).toBeNull()
    expect(result.yes).toBe(true)
  })

  it('writes a safe local DB log and bounds its in-memory buffer', () => {
    globalThis.DB = { log: vi.fn(), get: vi.fn(() => ({})) }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    SMObservability._max = 2
    SMObservability.captureEvent('one')
    SMObservability.captureEvent('two')
    const entry = SMObservability.captureError('', null, {})
    expect(entry).toMatchObject({ scope: 'app', message: 'unknown' })
    expect(globalThis.DB.log).toHaveBeenCalledWith('obs_error', 'app: unknown')
    expect(SMObservability.recent()).toHaveLength(2)
    expect(SMObservability.recent(1)[0].level).toBe('error')
    SMObservability._max = 100
  })

  it('does not recursively log persistence failures and tolerates a throwing DB logger', () => {
    globalThis.DB = { log: vi.fn(() => { throw new Error('persist') }), get: () => ({}) }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => SMObservability.captureError('persist', new Error('failed'), { noDbLog: true })).not.toThrow()
    expect(globalThis.DB.log).not.toHaveBeenCalled()
    expect(() => SMObservability.captureError('other', new Error('failed'))).not.toThrow()
  })

  it('binds browser error handlers once and converts non-Error rejections', () => {
    const listeners = {}
    globalThis.window = {
      addEventListener: vi.fn((name, callback) => { listeners[name] = callback })
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    SMObservability.bindGlobalHandlers()
    SMObservability.bindGlobalHandlers()
    listeners.error({ message: 'window boom' })
    listeners.unhandledrejection({ reason: 'promise boom' })
    expect(globalThis.window.addEventListener).toHaveBeenCalledTimes(2)
    expect(SMObservability.recent().map(entry => entry.scope))
      .toEqual(['window_error', 'unhandled_rejection'])
  })

  it('sends redacted events to configured remote sink without blocking callers', async () => {
    globalThis.DB = { get: vi.fn(() => ({ observabilityUrl: 'https://obs.example.test/events' })) }
    globalThis.AppConfig = { APP_VERSION: '1.0.1' }
    globalThis.fetch = vi.fn(async () => ({ ok: true }))
    const entry = SMObservability.captureEvent('remote', { token: 'private' })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://obs.example.test/events',
      expect.objectContaining({ method: 'POST', keepalive: true, mode: 'cors' })
    )
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body).toMatchObject({ scope: 'remote', app: 'studio-m', v: '1.0.1' })
    expect(body.meta.token).toBe('[redacted]')
    expect(entry.meta.token).toBe('[redacted]')
  })

  it('uses window sink fallback and quietly ignores missing/throwing transports', () => {
    globalThis.DB = { get: vi.fn(() => ({})) }
    globalThis.window = { __SM_OBS_URL: 'https://window.example.test/events' }
    globalThis.fetch = vi.fn(() => { throw new Error('network') })
    expect(() => SMObservability.captureEvent('throwing')).not.toThrow()
    delete globalThis.fetch
    expect(() => SMObservability.captureEvent('missing')).not.toThrow()
  })
})
