import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const coreSource = readFileSync('studio-m/js/core.js', 'utf8')
const uiSource = readFileSync('studio-m/js/ui.js', 'utf8')

function coreHarness(allowed = ['dashboard']) {
  const classes = new Set()
  const media = { matches: true, addEventListener: vi.fn() }
  const document = {
    documentElement: {},
    body: { dataset: {}, classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) } },
    getElementById: () => null,
    querySelectorAll: () => []
  }
  const Auth = {
    isLoggedIn: () => true, getUser: () => ({ id: 'u1' }), getSession: () => ({}), getCsrfToken: vi.fn()
  }
  const Access = {
    canAccessStudioM: () => true,
    filterStudioRoutes: routes => routes.filter(route => allowed.includes(route.id))
  }
  const location = { hash: '', pathname: '/studio-m/index.html', search: '' }
  const window = { matchMedia: () => media, location: { replace: vi.fn() } }
  const context = {
    window, document, location, Auth, Access,
    localStorage: { getItem: () => null, setItem: vi.fn() },
    setTimeout, clearTimeout, console
  }
  vm.runInNewContext(coreSource, context)
  return { SM: window.SM, location, classes, media }
}

function modalHarness({ focusables = true } = {}) {
  const listeners = new Map()
  const root = { innerHTML: '', appendChild: vi.fn() }
  const focusable = id => ({ id, offsetParent: {}, focus() { document.activeElement = this } })
  const opener = focusable('opener')
  const first = focusable('first')
  const last = focusable('last')
  const dialog = focusable('dialog')
  const overlay = {
    className: '', innerHTML: '', addEventListener: vi.fn(),
    querySelectorAll: () => focusables ? [first, last] : [],
    querySelector: selector => selector === '[role="dialog"]' ? dialog : (focusables && selector.includes('input') ? first : null)
  }
  const document = {
    activeElement: opener,
    getElementById: id => id === 'sm-modal-root' ? root : null,
    createElement: () => overlay,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type) }
  }
  const context = {
    window: {}, document,
    SM: { t: key => key, esc: String, toast: vi.fn() },
    SMEvents: { attrs: () => '' },
    setTimeout: fn => { fn(); return 1 }
  }
  vm.runInNewContext(uiSource, context)
  return { UI: context.window.SMUI, document, listeners, opener, first, last, dialog, root }
}

describe('frontend launch gates', () => {
  it('canonicalizes denied and unknown routes to the allowed dashboard', () => {
    const { SM, location } = coreHarness(['dashboard', 'calendar'])
    SM.navigate('accounting')
    expect(SM.state.route).toBe('dashboard')
    expect(location.hash).toBe('dashboard')
    SM.navigate('internal-debug')
    expect(SM.state.route).toBe('dashboard')
  })

  it('applies the OS reduced-motion setting', () => {
    const { SM, classes } = coreHarness()
    SM.initPrefs()
    expect(classes.has('sm-reduced-motion')).toBe(true)
  })

  it('traps focus, closes on Escape and restores the opener', () => {
    const h = modalHarness()
    h.UI.modal('عنوان', '<input>')
    expect(h.document.activeElement).toBe(h.first)
    h.document.activeElement = h.last
    const tab = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() }
    h.listeners.get('keydown')(tab)
    expect(h.document.activeElement).toBe(h.first)
    h.listeners.get('keydown')({ key: 'Escape', preventDefault: vi.fn() })
    expect(h.root.innerHTML).toBe('')
    expect(h.document.activeElement).toBe(h.opener)
  })

  it('keeps Tab inside a dialog with no interactive controls', () => {
    const h = modalHarness({ focusables: false })
    h.UI.modal('پیام', '<p>متن</p>')
    const event = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() }
    h.listeners.get('keydown')(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(h.document.activeElement).toBe(h.dialog)
  })
})
