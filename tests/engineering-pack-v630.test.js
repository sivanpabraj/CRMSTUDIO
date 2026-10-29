import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Engineering Pack — Versions and Cache', () => {
  it('has version 1.0.0 in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'))
    expect(pkg.version).toBe('1.0.0')
  })

  it('has cache version mandani-studio-v48 in sw.js', () => {
    const sw = fs.readFileSync(path.resolve(__dirname, '../sw.js'), 'utf8')
    expect(sw).toContain("const CACHE_VERSION = 'mandani-studio-v48'")
    expect(sw).toContain('/* Studio ERP — Service Worker v48')
  })

  it('matches version in js/config.js', () => {
    const config = fs.readFileSync(path.resolve(__dirname, '../js/config.js'), 'utf8')
    expect(config).toContain("APP_VERSION: '1.0.0'")
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

describe('Engineering Pack — EngRemainingComplete', () => {
  it('registers and boots without throwing in SSR/Node', async () => {
    globalThis.AppConfig = { APP_VERSION: '1.0.0', SW_CACHE: 'mandani-studio-v48' }
    await import('../js/eng-remaining-complete.js')
    const EngRemainingComplete = globalThis.EngRemainingComplete
    expect(EngRemainingComplete).toBeDefined()
    expect(typeof EngRemainingComplete.forceSyncPull).toBe('function')
    EngRemainingComplete.boot()
    expect(globalThis.__MANDANI_BUILD__).toBeDefined()
    expect(globalThis.__MANDANI_BUILD__.version).toBe('1.0.0')
    expect(globalThis.__MANDANI_BUILD__.sw).toBe('mandani-studio-v48')
  })
})

describe('SaaS Multi-Tenant — SaasContext & StudioPicker', () => {
  it('manages studioId and headers in SaasContext', async () => {
    await import('../js/saas-studio-context.js')
    const ctx = globalThis.SaasContext
    expect(ctx).toBeDefined()
    ctx.setStudioId('studio_123')
    expect(ctx.getStudioId()).toBe('studio_123')
    const headers = ctx.headers({ 'X-Custom': '1' })
    expect(headers['X-Studio-Id']).toBe('studio_123')
    expect(headers['X-Custom']).toBe('1')
  })

  it('evaluates ensureStudioSelected correctly', async () => {
    const ctx = globalThis.SaasContext
    ctx.setStudioId('')
    expect(ctx.ensureStudioSelected().ok).toBe(true) // 0 memberships

    ctx.setSession({
      accessToken: 'test-token',
      memberships: [
        { studioId: 's1', studioName: 'Studio 1' },
        { studioId: 's2', studioName: 'Studio 2' }
      ]
    })
    ctx.setStudioId('')
    const check = ctx.ensureStudioSelected()
    expect(check.needSelect).toBe(true)
    expect(check.memberships).toHaveLength(2)

    await import('../js/saas-studio-picker.js')
    expect(globalThis.SaasStudioPicker).toBeDefined()
  })

  it('provides dual-read fallbacks in SaasDual', async () => {
    globalThis.DB = {
      get: (table) => {
        if (table === 'contracts') return [{ id: 'c1', bride: 'سارا', groom: 'امید' }]
        if (table === 'banks') return [{ id: 'b1', name: 'ملت' }]
        return []
      }
    }
    await import('../js/saas-dual-read.js')
    const SaasDual = globalThis.SaasDual
    expect(SaasDual).toBeDefined()

    // Without token, falls back to local
    const cRes = await SaasDual.contracts()
    expect(cRes.source).toBe('local')
    expect(cRes.items).toHaveLength(1)
    expect(cRes.items[0].id).toBe('c1')

    const bRes = await SaasDual.banks()
    expect(bRes.source).toBe('local')
    expect(bRes.items).toHaveLength(1)

    const txRes = await SaasDual.createTransaction({ amount: 1000 })
    expect(txRes.ok).toBe(false) // No active SaaS session
  })
})

