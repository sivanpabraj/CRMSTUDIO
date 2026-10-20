import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'

const utilsSource = fs.readFileSync('js/utils.js', 'utf8')
const dashboardSource = fs.readFileSync('studio-m/js/dashboard.js', 'utf8')
const backupSource = fs.readFileSync('js/backup-service.js', 'utf8')

describe('Email Validation and Normalization', () => {
  const context = { window: {} }
  vm.runInNewContext(utilsSource, context)
  const Utils = context.window.Utils

  it('validates email addresses correctly', () => {
    expect(Utils.isValidEmail('test@example.com')).toBe(true)
    expect(Utils.isValidEmail('studio.manager@gmail.com')).toBe(true)
    expect(Utils.isValidEmail('user+tag@domain.co.uk')).toBe(true)
    expect(Utils.isValidEmail('invalid-email')).toBe(false)
    expect(Utils.isValidEmail('user@')).toBe(false)
    expect(Utils.isValidEmail('@domain.com')).toBe(false)
    expect(Utils.isValidEmail('')).toBe(false)
    expect(Utils.isValidEmail(null)).toBe(false)
  })

  it('normalizes email addresses correctly', () => {
    expect(Utils.normalizeEmail('  TEST@Example.Com  ')).toBe('test@example.com')
    expect(Utils.normalizeEmail('User.Name@Gmail.com')).toBe('user.name@gmail.com')
    expect(Utils.normalizeEmail('')).toBe('')
  })
})

describe('Reorderable Dashboard Layout', () => {
  function getDashboard() {
    const studioObj = { id: 'st1', name: 'استودیو تست' }
    const context = {
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn()
      },
      DB: {
        get: () => [],
        set: vi.fn(),
        find: () => null,
        filter: () => [],
        flush: vi.fn()
      },
      Utils: {
        parseJalaliToday: () => ({ jy: 1405, jm: 5 }),
        jalaliMonthName: month => `ماه ${month}`,
        daysUntil: () => 5,
        todayJalali: () => '1405/05/25'
      },
      SM: {
        fmt: String,
        esc: String,
        studio: () => studioObj,
        user: () => ({ roles: ['studio_manager'] }),
        navigate: vi.fn(),
        isModuleDisabled: () => false,
        toast: vi.fn()
      },
      Access: {
        isSystemAdmin: () => false,
        isStudioManager: () => true
      },
      SMUI: { badge: text => text, empty: () => '', moduleSearch: () => '' },
      window: {}
    }
    vm.runInNewContext(dashboardSource, context)
    return { dashboard: context.window.SMDashboard, context, studioObj }
  }

  it('returns default section order with 7 sections', () => {
    const { dashboard } = getDashboard()
    const def = dashboard.defaultSectionOrder()
    expect(def).toEqual(['kpis', 'finance', 'expenses', 'assistant', 'workflow', 'events', 'transactions'])
  })

  it('retrieves and saves layout configuration correctly', async () => {
    const { dashboard, context } = getDashboard()
    const initialConfig = dashboard.getLayoutConfig()
    expect(initialConfig.order).toEqual(dashboard.defaultSectionOrder())
    expect(initialConfig.hidden).toEqual([])

    await dashboard.saveLayoutConfig(['finance', 'kpis'], ['transactions'])
    expect(context.DB.set).toHaveBeenCalled()

    const updatedConfig = dashboard.getLayoutConfig()
    expect(updatedConfig.order[0]).toBe('finance')
    expect(updatedConfig.order[1]).toBe('kpis')
    expect(updatedConfig.hidden).toContain('transactions')
  })

  it('moves sections up and down correctly', async () => {
    const { dashboard } = getDashboard()
    const initialOrder = dashboard.getLayoutConfig().order

    // Move second item up -> should become first
    const secondItem = initialOrder[1]
    await dashboard.moveSection(secondItem, 'up')
    expect(dashboard.getLayoutConfig().order[0]).toBe(secondItem)

    // Move first item down -> should return to second
    await dashboard.moveSection(secondItem, 'down')
    expect(dashboard.getLayoutConfig().order[1]).toBe(secondItem)
  })

  it('toggles section visibility on and off', async () => {
    const { dashboard } = getDashboard()
    await dashboard.toggleSectionVisibility('assistant')
    expect(dashboard.getLayoutConfig().hidden).toContain('assistant')

    await dashboard.toggleSectionVisibility('assistant')
    expect(dashboard.getLayoutConfig().hidden).not.toContain('assistant')
  })

  it('manages draggable KPI cards order and persistence', async () => {
    const { dashboard, context } = getDashboard()
    const defKpis = dashboard.defaultKpiOrder()
    expect(defKpis).toEqual(['monthIncome', 'monthExpense', 'net', 'outstanding', 'bankBalance', 'closeEvents'])

    const customKpis = ['bankBalance', 'net', 'monthIncome', 'monthExpense', 'outstanding', 'closeEvents']
    await dashboard.saveKpiOrder(customKpis)
    expect(context.DB.set).toHaveBeenCalled()

    const currentKpis = dashboard.getKpiOrder()
    expect(currentKpis[0]).toBe('bankBalance')
    expect(currentKpis[1]).toBe('net')
  })

  it('toggles section collapse state', async () => {
    const { dashboard, context } = getDashboard()
    expect(dashboard.isSectionCollapsed('workflow')).toBe(false)

    await dashboard.toggleCollapse('workflow')
    expect(context.DB.set).toHaveBeenCalled()
    expect(dashboard.isSectionCollapsed('workflow')).toBe(true)

    await dashboard.toggleCollapse('workflow')
    expect(dashboard.isSectionCollapsed('workflow')).toBe(false)
  })
})

describe('Backup Service Email and Folder Export', () => {
  it('creates email mailto link and opens Gmail window', async () => {
    let openedUrl = ''
    const context = {
      window: {
        open: vi.fn((url) => { openedUrl = url })
      },
      document: {
        createElement: vi.fn(() => ({ click: vi.fn(), setAttribute: vi.fn() })),
        body: { appendChild: vi.fn(), removeChild: vi.fn() }
      },
      DB: {
        get: vi.fn((key) => key === 'studioInfo' ? { name: 'استودیو ماندنی' } : null),
        exportJSON: vi.fn(() => '{"test": 1}')
      },
      SM: { studio: () => ({ name: 'استودیو ماندنی' }) },
      Utils: { todayJalali: () => '1405-01-01' },
      Blob: class { constructor(data, opts) { this.data = data; this.opts = opts } },
      URL: { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() },
      setTimeout: (fn) => fn(),
      clearTimeout: vi.fn()
    }

    vm.runInNewContext(backupSource, context)
    const BackupService = context.window.BackupService

    const res = await BackupService.sendToEmail('studio@example.com')
    expect(res.ok).toBe(true)
    expect(context.window.open).toHaveBeenCalled()
    expect(openedUrl).toContain('mail.google.com')
    expect(openedUrl).toContain('studio%40example.com')
  })
})
