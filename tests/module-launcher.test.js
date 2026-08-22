import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function harness() {
  const listeners = new Map()
  const nodes = new Map()
  const document = {
    activeElement: null,
    body: { classList: { add() {}, remove() {} }, appendChild(node) { nodes.set(node.id, node) } },
    addEventListener(type, fn) { listeners.set(type, fn) },
    getElementById: id => nodes.get(id) || null,
    querySelector: () => null
  }
  const SM = {
    state: { route: 'dashboard' },
    visibleRoutes: () => [
      { id: 'dashboard', group: 'main', icon: 'fa-house' },
      { id: 'calendar', group: 'main', icon: 'fa-calendar' }
    ],
    t: key => ({ dashboard: 'داشبورد', calendar: 'تقویم', group_main: 'اصلی' })[key] || key,
    esc: String, navigate: vi.fn(), renderShell: vi.fn()
  }
  const context = { window: { SM }, document }
  vm.runInNewContext(readFileSync('studio-m/js/module-launcher.js', 'utf8'), context)
  return { Launcher: context.window.SMModuleLauncher, SM, document, listeners, nodes }
}

describe('module launcher behavior', () => {
  it('uses only permission-filtered routes', () => {
    const { Launcher, SM } = harness()
    SM.visibleRoutes = () => [{ id: 'dashboard', group: 'main', icon: 'fa-house' }]
    expect(Launcher.routes().map(route => route.id)).toEqual(['dashboard'])
  })

  it('opens via Ctrl+K and navigates only through SM', () => {
    const { Launcher, SM, listeners } = harness()
    Launcher.toggle = vi.fn()
    const preventDefault = vi.fn()
    listeners.get('keydown')({ ctrlKey: true, metaKey: false, key: 'k', preventDefault })
    expect(Launcher.toggle).toHaveBeenCalledOnce()
    Launcher.close = vi.fn()
    Launcher.select('calendar')
    expect(SM.navigate).toHaveBeenCalledWith('calendar')
  })

  it('supports arrow navigation and Escape', () => {
    const { Launcher, document, nodes } = harness()
    const items = [0, 1].map(() => ({ focus: vi.fn() }))
    items.forEach(item => item.focus.mockImplementation(() => { document.activeElement = item }))
    nodes.set('sm-launcher-overlay', { querySelectorAll: () => items })
    Launcher.onKeydown({ key: 'ArrowDown', preventDefault: vi.fn() })
    expect(items[0].focus).toHaveBeenCalledOnce()
    Launcher.close = vi.fn()
    Launcher.onKeydown({ key: 'Escape', preventDefault: vi.fn() })
    expect(Launcher.close).toHaveBeenCalledOnce()
  })
})
