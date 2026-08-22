import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function lazyHarness() {
  const appended = []
  const document = {
    createElement() {
      const listeners = new Map()
      return {
        dataset: {},
        addEventListener(type, handler) { listeners.set(type, handler) },
        dispatch(type) { listeners.get(type)?.() }
      }
    },
    head: { appendChild(script) { appended.push(script.src); Promise.resolve().then(() => script.dispatch('load')) } }
  }
  const context = { window: {}, document, Promise, Set, Map, Error }
  vm.runInNewContext(readFileSync('studio-m/js/lazy-modules.js', 'utf8'), context)
  return { lazy: context.window.SMLazyModules, appended }
}

function crmHarness(leads = []) {
  const context = {
    SMModules: {},
    SM: { getModuleSearch: () => '', esc: value => String(value).replace(/</g, '&lt;') },
    DB: { active: () => leads, find: (_name, fn) => leads.find(fn) },
    SMUI: {
      sectionHead: (_title, _desc, action) => action, moduleSearch: () => '', badge: value => value,
      rowActions: actions => actions.map(action => action.label).join('|'), table: (_headers, rows) => rows.join('')
    },
    SMEvents: { attrs: (fn, args = []) => `data-fn="${fn}" data-args='${JSON.stringify(args)}'` },
    window: {}, console
  }
  vm.runInNewContext(readFileSync('studio-m/js/modules-crm.js', 'utf8'), context)
  return context.SMModules.crm
}

describe('CRM route integration', () => {
  it('loads CRM only when the CRM route is requested', async () => {
    const { lazy, appended } = lazyHarness()
    expect(lazy.isLoaded('crm')).toBe(false)
    await lazy.ensure('crm')
    expect(appended).toEqual(['js/modules-crm.js'])
    expect(lazy.isLoaded('crm')).toBe(true)
  })

  it('renders escaped lead data and a contract conversion action', () => {
    const crm = crmHarness([{ id: 'l1', name: '<img>', phone: '09120000000', stage: 'new', source: 'وب' }])
    const root = { innerHTML: '' }
    crm.render(root)
    expect(root.innerHTML.includes('&lt;img>')).toBe(true)
    expect(root.innerHTML.includes('<img>')).toBe(false)
    expect(root.innerHTML.includes('تبدیل به قرارداد')).toBe(true)
  })

  it('maps an unknown pipeline state to the initial state', () => {
    expect(crmHarness().stageLabel('tampered-stage')).toBe('جدید')
  })
})
