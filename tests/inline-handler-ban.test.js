import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'

describe('CSP-safe Studio M event dispatch', () => {
  it('invokes a registered action through delegated DOM events with decoded arguments', () => {
    const listeners = new Map()
    const action = vi.fn()
    const document = {
      readyState: 'complete',
      addEventListener(type, handler) { listeners.set(type, handler) }
    }
    const window = { TestActions: { save: action } }
    vm.runInNewContext(fs.readFileSync('studio-m/js/events.js', 'utf8'), { window, document, console })
    const target = {
      closest: selector => selector.includes('data-sm-fn') ? target : null,
      hasAttribute: () => false,
      getAttribute: name => name === 'data-sm-fn' ? 'TestActions.save' : name === 'data-sm-args' ? '["lead-1",3]' : null
    }
    const preventDefault = vi.fn()
    listeners.get('click')({ target, preventDefault, stopPropagation: vi.fn() })
    expect(action).toHaveBeenCalledWith('lead-1', 3)
    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it('activates role=button actions by keyboard without double dispatch', () => {
    const listeners = new Map()
    const document = { readyState: 'complete', addEventListener: (type, handler) => listeners.set(type, handler) }
    const window = {}
    vm.runInNewContext(fs.readFileSync('studio-m/js/events.js', 'utf8'), { window, document, console })
    const click = vi.fn()
    const target = { closest: selector => selector.includes('role="button"') ? { click } : null }
    const preventDefault = vi.fn()
    listeners.get('keydown')({ key: ' ', target, preventDefault })
    expect(click).toHaveBeenCalledOnce()
    expect(preventDefault).toHaveBeenCalledOnce()
  })
})
