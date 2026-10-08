import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Portal Pro Suite', () => {
  let docElements = {}
  let localStorageStore = {}

  beforeEach(async () => {
    localStorageStore = {}
    const makeEl = (extra = {}) => ({
      addEventListener: vi.fn(),
      focus: vi.fn(),
      style: {},
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn(() => false)
      },
      innerHTML: '',
      value: '',
      prepend: vi.fn(),
      appendChild: vi.fn(),
      remove: vi.fn(),
      getAttribute: vi.fn(() => ''),
      setAttribute: vi.fn(),
      ...extra
    })

    docElements = {
      'portal-app': makeEl(),
      'portal-content': makeEl({ innerHTML: '<div class="project-card">علی و مریم (عکاس)</div>' }),
      'portal-pro-search-input': makeEl({ value: '' }),
      'modal-event-date': makeEl({ value: '۱۴۰۳/۰۸/۱۰' }),
      'modal-deadline': makeEl({ value: '۱۴۰۳/۰۸/۲۵' }),
      'modal-notes': makeEl({ value: 'هماهنگ با باغ' })
    }

    const doc = {
      readyState: 'complete',
      body: makeEl({
        setAttribute: vi.fn((k, v) => { doc.body[k] = v })
      }),
      getElementById: (id) => docElements[id] || null,
      querySelector: (sel) => {
        if (sel === '.portal-header-actions') return makeEl()
        if (sel === '.portal-search-clear') return makeEl()
        return null
      },
      querySelectorAll: () => [],
      createElement: () => makeEl(),
      addEventListener: vi.fn()
    }

    globalThis.window = globalThis
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('document', doc)
    vi.stubGlobal('localStorage', {
      getItem: (k) => localStorageStore[k] || null,
      setItem: (k, v) => { localStorageStore[k] = String(v) }
    })
    vi.stubGlobal('Utils', {
      toast: vi.fn(),
      escapeHtml: (s) => String(s || ''),
      todayJalali: () => '۱۴۰۳/۰۷/۱۵'
    })
    vi.stubGlobal('SecureDB', {
      update: vi.fn().mockResolvedValue(true),
      insert: vi.fn().mockResolvedValue({ id: 'pers_1' })
    })
    vi.stubGlobal('DB', {
      filter: vi.fn(() => [
        { id: 'proj_1', couple: 'سارا و نیما', role: 'عکاس تالار', roleId: 'photographer', accepted: true, status: 'active' },
        { id: 'proj_2', couple: 'مریم و علی', role: 'تدوین‌گر', roleId: 'editor', accepted: null, status: 'pending' }
      ]),
      find: vi.fn((tbl, fn) => {
        const list = [
          { id: 'proj_1', couple: 'سارا و نیما', role: 'عکاس تالار', roleId: 'photographer', accepted: true, status: 'active' },
          { id: 'proj_2', couple: 'مریم و علی', role: 'تدوین‌گر', roleId: 'editor', accepted: null, status: 'pending' }
        ]
        return list.find(fn) || null
      }),
      get: vi.fn(() => []),
      log: vi.fn()
    })
    vi.stubGlobal('RolesHelper', {
      title: (r) => r,
      emoji: () => '🎬'
    })
    vi.stubGlobal('PortalDashboard', {
      render: vi.fn()
    })
    vi.stubGlobal('Portal', {
      showSection: vi.fn(),
      _resolvePersonnel: vi.fn()
    })
    vi.stubGlobal('Auth', {
      getUser: () => ({ id: 'u1', name: 'همکار' }),
      isLoggedIn: () => true
    })

    await import('../js/portal-pro.js')
  })

  it('toggles and persists dark / light themes cleanly', () => {
    const pro = globalThis.PortalPro
    expect(pro).toBeDefined()

    pro.setTheme('light')
    expect(pro.state.theme).toBe('light')
    expect(localStorageStore['portal_theme']).toBe('light')

    pro.toggleTheme()
    expect(pro.state.theme).toBe('dark')
    expect(localStorageStore['portal_theme']).toBe('dark')
  })

  it('updates project status with one click', async () => {
    const pro = globalThis.PortalPro
    await pro.updateProjectStatus('proj_1', 'delivered_to_manager')

    expect(globalThis.SecureDB.update).toHaveBeenCalledWith('persProjects', 'proj_1', expect.objectContaining({
      status: 'delivered_to_manager'
    }))
  })

  it('confirms project acceptance with ceremony and deadline dates', async () => {
    const pro = globalThis.PortalPro
    await pro.confirmAccept('proj_2')

    expect(globalThis.SecureDB.update).toHaveBeenCalledWith('persProjects', 'proj_2', expect.objectContaining({
      accepted: true,
      status: 'active',
      date: '۱۴۰۳/۰۸/۱۰',
      deadline: '۱۴۰۳/۰۸/۲۵',
      notes: 'هماهنگ با باغ'
    }))
  })

  it('filters project search query', () => {
    const pro = globalThis.PortalPro
    pro.onSearch('مریم')
    expect(pro.state.searchQuery).toBe('مریم')

    pro.clearSearch()
    expect(pro.state.searchQuery).toBe('')
  })
})
