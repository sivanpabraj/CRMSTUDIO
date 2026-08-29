import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadConfig({ hostname, flag }) {
  vi.resetModules()
  vi.stubGlobal('window', {})
  vi.stubGlobal('location', { hostname })
  if (flag === undefined) delete globalThis.__SM_BUILD_FLAGS__
  else vi.stubGlobal('__SM_BUILD_FLAGS__', { localDemo: flag })
  await import('../js/config.js')
  return window.AppConfig
}

describe('local demo identity gate', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps local identity disabled on localhost without the explicit build flag', async () => {
    const config = await loadConfig({ hostname: 'localhost' })
    expect(config.allowsLocalIdentity()).toBe(false)
  })

  it('keeps local identity disabled on production even when a flag is injected', async () => {
    const config = await loadConfig({ hostname: 'crm.example.com', flag: true })
    expect(config.allowsLocalIdentity()).toBe(false)
  })

  it('allows local identity only when localhost and the explicit flag both match', async () => {
    const config = await loadConfig({ hostname: '127.0.0.1', flag: true })
    expect(config.allowsLocalIdentity()).toBe(true)
  })
})
