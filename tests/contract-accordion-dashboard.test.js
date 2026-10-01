import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'

const contractSource = fs.readFileSync('contract.js', 'utf8')
const coreSource = fs.readFileSync('studio-m/js/core.js', 'utf8')
const dashboardSource = fs.readFileSync('studio-m/js/dashboard.js', 'utf8')

describe('Contract Draft Saving & Validation', () => {
  it('allows saving draft with partial fields while requiring fields for finalize', () => {
    const dom = {
      'groom-name': { value: 'علی' },
      'bride-name': { value: '' }, // bride missing
      'groom-phone': { value: '09121112233' },
      'bride-phone': { value: '' },
      'event-date': { value: '1405/08/10' },
      'pkg-cameras': { value: '2' },
      'pkg-quality': { value: '4k' },
      'deposit': { value: '5,000,000' }
    }

    const context = {
      window: { location: { search: '' } },
      document: {
        getElementById: vi.fn(id => dom[id] || null),
        addEventListener: vi.fn(),
        querySelector: vi.fn(() => null),
        createElement: vi.fn(() => ({ className: '', style: {}, textContent: '', appendChild: vi.fn(), remove: vi.fn() })),
        body: { appendChild: vi.fn() }
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn()
      },
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
      Utils: { todayJalali: () => '1405/07/10' },
      state: { total: 20000000, verify: {} },
      getAssignedStaff: () => [],
      getStaffRate: () => 0,
      getVerificationSnapshot: () => ({}),
      todayFa: () => '1405/07/10',
      digitsOnly: (s) => (s || '').replace(/\D/g, ''),
      parseMoney: (s) => parseInt((s || '').replace(/\D/g, ''), 10) || 0,
      generateContractNum: () => '050810-01',
      normalizePhoneField: (id) => dom[id]?.value || '',
      chk: () => false
    }

    vm.runInNewContext(contractSource, context)

    // Finalize should fail because bride is missing
    const finalObj = context.buildContractObject(true)
    expect(finalObj).toBeNull()

    // Draft should succeed even with missing bride
    const draftObj = context.buildContractObject(false)
    expect(draftObj).not.toBeNull()
    expect(draftObj.couple).toContain('علی')
    expect(draftObj.status).toBe('draft')
    expect(draftObj.deposit).toBe(5000000)
  })
})

describe('Sidebar Nav Accordion Toggle', () => {
  it('toggles is-collapsed class and saves to localStorage', () => {
    let collapsedClass = false
    const navGroupEl = {
      classList: {
        toggle: vi.fn((cls) => {
          collapsedClass = !collapsedClass
          return collapsedClass
        })
      }
    }

    let storedJson = '[]'
    const context = {
      window: {},
      document: {
        querySelector: vi.fn(selector => {
          if (selector.includes('data-nav-group="hr"')) return navGroupEl
          return null
        }),
        addEventListener: vi.fn()
      },
      localStorage: {
        getItem: vi.fn(() => storedJson),
        setItem: vi.fn((key, val) => { storedJson = val })
      },
      AppConfig: { APP_VERSION: '2.0.0' }
    }

    vm.runInNewContext(coreSource, context)
    const SM = context.SM || context.window.SM

    // Toggle hr group to collapsed
    SM.toggleNavGroup('hr')
    expect(navGroupEl.classList.toggle).toHaveBeenCalledWith('is-collapsed')
    expect(storedJson).toContain('hr')

    // Toggle hr group again to expand
    SM.toggleNavGroup('hr')
    expect(storedJson).not.toContain('hr')
  })
})

describe('Dashboard Reset Layout', () => {
  it('resets section order and hidden state to defaults', async () => {
    const studioObj = {
      id: 'st1',
      dashboardLayout: {
        order: ['workflow', 'kpis'],
        hidden: ['finance', 'expenses']
      }
    }

    const context = {
      window: {},
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn()
      },
      SM: {
        studio: () => studioObj,
        toast: vi.fn(),
        navigate: vi.fn()
      },
      DB: {
        set: vi.fn(),
        flush: vi.fn()
      },
      SecureDB: {
        merge: vi.fn()
      }
    }

    vm.runInNewContext(dashboardSource, context)
    const SMDashboard = context.SMDashboard || context.window.SMDashboard

    await SMDashboard.resetLayoutConfig()
    expect(SMDashboard.getLayoutConfig().hidden).toEqual([])
    expect(SMDashboard.getLayoutConfig().order).toEqual(SMDashboard.defaultSectionOrder())
    expect(context.SM.toast).toHaveBeenCalledWith('چیدمان پیشخوان به حالت پیش‌فرض بازگشت', 'info')
    expect(context.SM.navigate).toHaveBeenCalledWith('dashboard')
  })
})
