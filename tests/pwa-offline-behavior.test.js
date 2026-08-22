import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function workerHarness({ cacheControl = '', manifestVersion = '1.0.1' } = {}) {
  const listeners = {}
  const cache = { addAll: vi.fn(async () => undefined), put: vi.fn(async () => undefined) }
  const response = {
    ok: true, status: 200, type: 'basic',
    json: vi.fn(async () => ({ version: manifestVersion, assets: ['studio-m/js/dashboard.js', 'css/icons.css'] })),
    clone: () => response,
    headers: { get: () => cacheControl }
  }
  const context = {
    URL, Set, Promise,
    self: {
      location: { origin: 'https://studio.example', href: 'https://studio.example/sw.js' },
      registration: { scope: 'https://studio.example/' },
      addEventListener: (name, handler) => { listeners[name] = handler },
      clients: { claim: vi.fn() }
    },
    caches: {
      open: vi.fn(async () => cache), keys: vi.fn(async () => []),
      delete: vi.fn(async () => true), match: vi.fn(async () => undefined)
    },
    fetch: vi.fn(async () => response)
  }
  vm.runInNewContext(readFileSync('sw.js', 'utf8'), context, { filename: 'sw.js' })
  return { listeners, context, cache }
}

describe('PWA offline and privacy behavior', () => {
  it('installs a version-matched complete asset manifest', async () => {
    const { listeners, cache } = workerHarness()
    let promise
    listeners.install({ waitUntil: value => { promise = value } })
    await promise
    const urls = cache.addAll.mock.calls[0][0]
    expect(urls.includes('https://studio.example/studio-m/js/dashboard.js')).toBe(true)
    expect(urls.includes('https://studio.example/css/icons.css')).toBe(true)
  })

  it('rejects a stale offline manifest instead of activating a mixed release', async () => {
    const { listeners } = workerHarness({ manifestVersion: '0.9.0' })
    let promise
    listeners.install({ waitUntil: value => { promise = value } })
    await expect(promise).rejects.toThrow('version mismatch')
  })

  it('never intercepts or caches same-origin API and write requests', () => {
    const { listeners } = workerHarness()
    for (const request of [
      { method: 'GET', url: 'https://studio.example/api/customer-private' },
      { method: 'POST', url: 'https://studio.example/js/save' }
    ]) {
      const respondWith = vi.fn()
      listeners.fetch({ request, respondWith })
      expect(respondWith).not.toHaveBeenCalled()
    }
  })
})
