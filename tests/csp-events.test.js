import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'

const boot = (actions = {}) => {
  const listeners = new Map()
  const document = {
    addEventListener(type, handler) { listeners.set(type, handler) }
  }
  const window = { ...actions }
  const console = { error: vi.fn() }
  vm.runInNewContext(fs.readFileSync('js/csp-events.js', 'utf8'), { window, document, console })
  return { listeners, window, console }
}

const trigger = attributes => ({
  closest(selector) {
    return selector.includes('[data-csp-action]') ? this : null
  },
  click: vi.fn(),
  getAttribute(name) { return attributes[name] ?? null },
  hasAttribute(name) { return Object.hasOwn(attributes, name) }
})

describe('CSP-safe application event dispatcher', () => {
  it('dispatches only an allow-listed action with its declared argument', () => {
    const selectPreset = vi.fn()
    const { listeners } = boot({ GlassTheme: { selectPreset } })
    const target = trigger({
      'data-csp-action': 'GlassTheme.selectPreset',
      'data-csp-arg': 'aurora'
    })

    listeners.get('click')({
      type: 'click', target,
      stopPropagation: vi.fn(), preventDefault: vi.fn()
    })

    expect(selectPreset).toHaveBeenCalledOnce()
    expect(selectPreset).toHaveBeenCalledWith('aurora')
  })

  it('passes the real change event and optional argument to upload handlers', () => {
    const onUpload = vi.fn()
    const { listeners } = boot({ GlassTheme: { onUpload } })
    const target = trigger({
      'data-csp-action': 'GlassTheme.onUpload',
      'data-csp-event': 'change',
      'data-csp-pass-event': '',
      'data-csp-arg': 'portal-glass-picker'
    })
    const event = { type: 'change', target, stopPropagation: vi.fn(), preventDefault: vi.fn() }

    listeners.get('change')(event)

    expect(onUpload).toHaveBeenCalledWith(event, 'portal-glass-picker')
  })

  it('blocks DOM-controlled function names outside the action allow-list', () => {
    const logout = vi.fn()
    const { listeners, console } = boot({ Auth: { logout } })
    const target = trigger({ 'data-csp-action': 'Auth.logout' })

    listeners.get('click')({
      type: 'click', target,
      stopPropagation: vi.fn(), preventDefault: vi.fn()
    })

    expect(logout).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith('Blocked unknown CSP action')
  })

  it('turns keyboard activation on delegated role buttons into one click', () => {
    const { listeners } = boot()
    const target = trigger({ 'data-csp-action': 'PortalDashboard.openProject' })
    const preventDefault = vi.fn()

    listeners.get('keydown')({ key: ' ', target, preventDefault })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(target.click).toHaveBeenCalledOnce()
  })
})
