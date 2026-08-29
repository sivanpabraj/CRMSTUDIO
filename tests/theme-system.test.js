import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync('studio-m/js/theme-system.js', 'utf8')

function harness(initial = {}) {
  const storage = new Map(Object.entries(initial))
  const bodyClasses = new Set()
  const buttonAttributes = new Map()
  const themeMeta = { content: '' }
  const events = []
  const document = {
    body: {
      dataset: {},
      classList: {
        toggle: (name, enabled) => enabled ? bodyClasses.add(name) : bodyClasses.delete(name),
        contains: name => bodyClasses.has(name)
      }
    },
    documentElement: { style: {} },
    querySelector: selector => selector === 'meta[name="theme-color"]' ? themeMeta : null,
    querySelectorAll: () => [],
    getElementById: id => id === 'sm-sidebar-collapse' ? {
      setAttribute: (name, value) => buttonAttributes.set(name, value),
      set title(value) { buttonAttributes.set('title', value) }
    } : null,
    addEventListener: vi.fn(),
    dispatchEvent: event => events.push(event)
  }
  const SM = {
    state: {}, initPrefs: vi.fn(), renderShell: vi.fn(), navigate: vi.fn(), toast: vi.fn(), closeSidebar: vi.fn()
  }
  const window = { SM }
  const context = {
    window, document,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail } }
  }
  vm.runInNewContext(source, context, { filename: 'theme-system.js' })
  return { theme: window.SMThemeSystem, SM, storage, document, bodyClasses, buttonAttributes, themeMeta, events }
}

describe('STE100 theme system behavior', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('persists and applies supported themes while rejecting an unknown value', () => {
    const h = harness()
    expect(h.theme.apply('dark-glass')).toBe('dark-glass')
    expect(h.storage.get('sm_theme')).toBe('dark-glass')
    expect(h.document.body.dataset.theme).toBe('dark-glass')
    expect(h.document.documentElement.style.colorScheme).toBe('dark')
    expect(h.themeMeta.content).toBe('#080d12')
    expect(h.events.at(-1)).toMatchObject({ type: 'sm:themechange', detail: { theme: 'dark-glass' } })

    expect(h.theme.apply('attacker-controlled')).toBe('light')
    expect(h.document.body.dataset.theme).toBe('light')
  })

  it('cycles through light, dark and dark-glass in a stable order', () => {
    const h = harness({ sm_theme: 'light' })
    expect(h.theme.cycle()).toBe('dark')
    expect(h.theme.cycle()).toBe('dark-glass')
    expect(h.theme.cycle()).toBe('light')
    expect(h.SM.toast).toHaveBeenCalledTimes(3)
  })

  it('persists sidebar collapse and updates its accessibility state', () => {
    const h = harness()
    h.theme.setCollapsed(true)
    expect(h.storage.get('sm_sidebar_collapsed')).toBe('1')
    expect(h.bodyClasses.has('sm-sidebar-collapsed')).toBe(true)
    expect(h.buttonAttributes.get('aria-expanded')).toBe('false')
    h.theme.toggleCollapsed()
    expect(h.bodyClasses.has('sm-sidebar-collapsed')).toBe(false)
    expect(h.buttonAttributes.get('aria-expanded')).toBe('true')
  })
})
