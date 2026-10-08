import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import vm from 'vm'

describe('Portal Staff Resiliency & Anti-Looping Logout', () => {
  let context
  let logoutCalled = false

  beforeEach(() => {
    logoutCalled = false
    const store = {
      personnel: []
    }

    context = {
      window: {},
      console,
      Date,
      Math,
      String,
      Array,
      Object,
      JSON,
      setTimeout: (fn) => fn(),
      clearTimeout: () => {},
      location: { href: 'index.html?view=portal', search: '?view=portal' },
      document: {
        body: {
          classList: {
            add: vi.fn(),
            remove: vi.fn(),
            contains: vi.fn(() => false)
          }
        },
        getElementById: vi.fn((id) => {
          if (id === 'portal-app') {
            return {
              innerHTML: '',
              querySelector: vi.fn(() => null)
            }
          }
          if (id === 'portal-content') {
            return { innerHTML: '', setAttribute: vi.fn(), dataset: {} }
          }
          return null
        }),
        querySelectorAll: vi.fn(() => []),
        querySelector: vi.fn(() => null)
      },
      Utils: {
        escapeHtml: (s) => String(s || ''),
        normalizePhone: (p) => String(p || '').replace(/\D/g, '')
      },
      Access: {
        canAccessStudioM: () => false,
        getRoleBadge: () => ({ emoji: '👤', title: 'پرسنل' }),
        isStaffOnly: () => true,
        isPersonnel: () => true
      },
      Auth: {
        getUser: () => ({
          id: 'user_staff_1',
          name: 'رضا تدوین‌گر',
          phone: '09190003344',
          roles: ['editor'],
          portalType: 'staff'
        }),
        isLoggedIn: () => true,
        logout: () => { logoutCalled = true }
      },
      DB: {
        findPersonnelByUserId: (uid) => store.personnel.find(p => p.userId === uid) || null,
        findPersonnelByPhone: (ph) => store.personnel.find(p => p.phone === ph) || null,
        get: (tbl) => store[tbl] || [],
        set: (tbl, val) => { store[tbl] = val },
        filter: () => []
      },
      Portal: {
        state: { currentSection: 'overview' },
        showSection: vi.fn()
      }
    }
    context.window = context

    // Load portal-shell.js
    const shellCode = fs.readFileSync(path.resolve(__dirname, '../js/portal-shell.js'), 'utf8')
    vm.runInNewContext(shellCode, context)
  })

  it('auto-creates personnel record and never calls Auth.logout()', () => {
    // Initially personnel table is empty
    expect(context.DB.get('personnel').length).toBe(0)

    // Call renderPortal()
    context.Portal.renderPortal()

    // 1. Must NOT call Auth.logout()
    expect(logoutCalled).toBe(false)

    // 2. Must automatically create personnel record in DB
    const personnelList = context.DB.get('personnel')
    expect(personnelList.length).toBe(1)
    expect(personnelList[0].userId).toBe('user_staff_1')
    expect(personnelList[0].name).toBe('رضا تدوین‌گر')
    expect(personnelList[0].roles).toContain('editor')
  })

  it('renders portal-shell with active class so glass-app never hides it', () => {
    const portalAppEl = { innerHTML: '' }
    context.document.getElementById = vi.fn((id) => id === 'portal-app' ? portalAppEl : null)

    context.Portal.renderPortalShell()

    expect(portalAppEl.innerHTML).toContain('portal-shell active')
    expect(portalAppEl.innerHTML).toContain('رضا تدوین‌گر')
  })
})
