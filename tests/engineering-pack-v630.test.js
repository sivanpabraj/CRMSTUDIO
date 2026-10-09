import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Engineering Pack v6.3.0 — Versions and Cache', () => {
  it('has version 6.3.0 in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'))
    expect(pkg.version).toBe('6.3.0')
  })

  it('has cache version mandani-studio-v48 in sw.js', () => {
    const sw = fs.readFileSync(path.resolve(__dirname, '../sw.js'), 'utf8')
    expect(sw).toContain("const CACHE_VERSION = 'mandani-studio-v48'")
    expect(sw).toContain('/* Studio ERP — Service Worker v48')
  })

  it('matches version in js/config.js', () => {
    const config = fs.readFileSync(path.resolve(__dirname, '../js/config.js'), 'utf8')
    expect(config).toContain("APP_VERSION: '6.3.0'")
    expect(config).toContain("SW_CACHE: 'mandani-studio-v48'")
    expect(config).toContain('DB_VERSION: 21')
  })
})

describe('Engineering Pack v6.3.0 — EngRouter', () => {
  let EngRouter

  beforeEach(async () => {
    globalThis.location = {
      pathname: '/',
      search: '',
      href: 'http://localhost/'
    }
    const module = await import('../js/eng-connectivity-hub.js')
    EngRouter = globalThis.EngRouter || module.default
  })

  it('correctly detects root vs studio-m environment', () => {
    expect(EngRouter.inStudioM()).toBe(false)
    expect(EngRouter.prefix()).toBe('')

    globalThis.location.pathname = '/studio-m/'
    expect(EngRouter.inStudioM()).toBe(true)
    expect(EngRouter.prefix()).toBe('../')
  })

  it('resolves correct landing for staff and studio_manager', () => {
    globalThis.location.pathname = '/'

    const staffUser = { username: 'staff1', portalType: 'staff', roles: ['photographer'] }
    expect(EngRouter.landingFor(staffUser)).toBe('index.html?view=portal')

    const managerUser = { username: 'admin', roles: ['studio_manager'] }
    expect(EngRouter.landingFor(managerUser)).toBe('studio-m/')

    const guestUser = null
    expect(EngRouter.landingFor(guestUser)).toBe('index.html')
  })
})

describe('Engineering Pack v6.3.0 — EngExpenseLink', () => {
  it('enriches transaction payload with contract and personnel fields', async () => {
    await import('../js/eng-expense-link.js')
    const EngExpenseLink = globalThis.EngExpenseLink
    expect(EngExpenseLink).toBeDefined()

    const rawTx = {
      amount: 5000000,
      category: 'salary_personnel'
    }
    const enriched = EngExpenseLink.enrichPayload(rawTx)
    expect(enriched.amount).toBe(5000000)
    expect(enriched.category).toBe('salary_personnel')
  })
})

describe('Engineering Pack v6.3.0 — EngRemainingComplete', () => {
  it('registers and boots without throwing in SSR/Node', async () => {
    globalThis.AppConfig = { APP_VERSION: '6.3.0', SW_CACHE: 'mandani-studio-v48' }
    await import('../js/eng-remaining-complete.js')
    const EngRemainingComplete = globalThis.EngRemainingComplete
    expect(EngRemainingComplete).toBeDefined()
    expect(typeof EngRemainingComplete.forceSyncPull).toBe('function')
    EngRemainingComplete.boot()
    expect(globalThis.__MANDANI_BUILD__).toBeDefined()
    expect(globalThis.__MANDANI_BUILD__.version).toBe('6.3.0')
    expect(globalThis.__MANDANI_BUILD__.sw).toBe('mandani-studio-v48')
  })
})
