import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

function loadDb({ initial = null, persist = vi.fn(async () => true) } = {}) {
  const context = {
    AppConfig: {
      DB_KEY: 'db', IDB_STORE: 'data', IDB_BACKUP_STORE: 'backups', BACKUP_PREFIX: 'backup:',
      LEGACY_DB_KEYS: [], APP_VERSION: '1.1.0', DEFAULT_STUDIO_NAME: 'CRMSTUDIO',
    },
    IdbStore: {
      get: vi.fn(async () => structuredClone(initial)), set: persist,
      migrateFromLocalStorage: vi.fn(async () => null), saveBackup: vi.fn(async () => true),
      listBackups: vi.fn(async () => []), deleteBackup: vi.fn(async () => true), remove: vi.fn(async () => true),
    },
    Utils: { todayJalali: () => '1405-06-01', toast: vi.fn() },
    localStorage: { getItem: vi.fn(() => null), removeItem: vi.fn(), setItem: vi.fn() },
    console, crypto: webcrypto, structuredClone, TextEncoder, setTimeout, clearTimeout,
  }
  context.window = { addEventListener: vi.fn() }
  vm.createContext(context)
  const source = readFileSync('js/db.js', 'utf8').replace(
    'DB.init()\nwindow.DB = DB',
    'globalThis.__MIGRATIONS__ = DB_MIGRATIONS\nwindow.DB = DB',
  )
  vm.runInContext(source, context)
  return { db: context.window.DB, migrations: context.__MIGRATIONS__, persist }
}

describe('DB durability boundary (executed implementation)', () => {
  it('rejects quota failure instead of reporting success', async () => {
    const quota = new DOMException('quota full', 'QuotaExceededError')
    const { db } = loadDb({ persist: vi.fn(async () => { throw quota }) })
    db._data = { _meta: { dbVersion: 23 }, contracts: [] }
    db.set('contracts', [{ id: 'c1' }])
    await expect(db.flush()).rejects.toBe(quota)
    expect(db._dirty).toBe(true)
  })

  it('startup is fail-closed when IndexedDB cannot persist defaults', async () => {
    const { db } = loadDb({ persist: vi.fn(async () => { throw new Error('idb unavailable') }) })
    db.init()
    await expect(db.ready).rejects.toThrow('idb unavailable')
    expect(db._data).toBeNull()
    expect(db._initError).toBeInstanceOf(Error)
  })

  it('returns defensive copies instead of mutable internal references', () => {
    const { db } = loadDb()
    db._data = { _meta: { dbVersion: 23 }, contracts: [{ id: 'c1', total: 10 }] }
    const leaked = db.get('contracts')
    leaked[0].total = 999
    leaked.push({ id: 'attacker' })
    expect(db.get('contracts')).toEqual([{ id: 'c1', total: 10 }])
  })

  it('purges every legacy SMS credential during the v24 migration', async () => {
    const persist = vi.fn(async () => true)
    const { db } = loadDb({ persist })
    db._data = {
      _meta: { dbVersion: 23 },
      studioInfo: {
        name: 'Studio', smsApiKey: 'secret', smsUsername: 'legacy-user',
        smsProvider: 'legacy-provider', smsLineNumber: '5000', smsMorningReminders: true,
      },
    }
    await db._migrate()
    expect(db._data._meta.dbVersion).toBe(24)
    expect(db._data.studioInfo).toMatchObject({ name: 'Studio', smsMorningReminders: true })
    for (const key of Object.keys(db._data.studioInfo)) {
      expect(/^sms/i.test(key) && /(key|secret|token|password|username|provider|line|proxy)/i.test(key)).toBe(false)
    }
    expect(persist).toHaveBeenCalledOnce()
  })

  it('rolls back the entire migration when one step fails', async () => {
    const { db, migrations, persist } = loadDb()
    const old = { _meta: { dbVersion: 22 }, contracts: [{ id: 'keep-me' }], studioInfo: {} }
    db._data = structuredClone(old)
    migrations[23] = (data) => {
      data.contracts.length = 0
      throw new Error('migration interrupted')
    }
    await expect(db._migrate()).rejects.toThrow('migration interrupted')
    expect(db._data).toEqual(old)
    expect(persist).not.toHaveBeenCalled()
  })
})
