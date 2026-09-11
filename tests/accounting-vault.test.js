import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'

const mathSource = fs.readFileSync('studio-m/js/accounting-math.js', 'utf8')
const accountingSource = fs.readFileSync('studio-m/js/accounting.js', 'utf8')
const css = fs.readFileSync('studio-m/css/studio-m.css', 'utf8')
const glassCss = fs.readFileSync('studio-m/css/dark-glass-theme.css', 'utf8')
const html = fs.readFileSync('studio-m/index.html', 'utf8')

function loadMath() {
  const sandbox = { window: {}, globalThis: null }
  sandbox.globalThis = sandbox
  vm.runInNewContext(mathSource, sandbox)
  return sandbox.window.SMAccMath
}

function accountingWith(data = {}) {
  const collections = {
    contracts: [], transactions: [], personnel: [], bookings: [], cheques: [],
    banks: [], invoices: [], ...data
  }
  const mathSandbox = { window: {}, globalThis: null }
  mathSandbox.globalThis = mathSandbox
  vm.runInNewContext(mathSource, mathSandbox)
  const context = {
    SMAccMath: mathSandbox.window.SMAccMath,
    localStorage: { getItem: () => null, setItem: () => {} },
    DB: {
      get: name => collections[name] || [],
      set: () => {},
      find: (name, predicate) => (collections[name] || []).find(predicate) || null,
      filter: () => []
    },
    Utils: { todayJalali: () => '1405/06/20' },
    SM: {
      fmt: n => String(n ?? 0),
      esc: v => String(v ?? ''),
      studio: () => ({}),
      navigate: () => {},
      getModuleSearch: () => '',
      toast: () => {}
    },
    SMUI: {
      sectionHead: (t, d, a = '') => `<header>${t}${d || ''}${a}</header>`,
      moduleSearch: () => '',
      tabs: (items, active) => items.map(i => `${i.label}:${i.id === active ? 'on' : 'off'}`).join('|'),
      badge: text => text,
      empty: (_i, title) => title,
      formField: () => '',
      modal: title => { context.lastModal = title }
    },
    SMH: { refresh: () => {}, remove: () => {} },
    SecureDB: {},
    FinanceSync: undefined,
    SMModules: {},
    document: { getElementById: () => null, createElement: () => ({}) },
    window: {},
    html2pdf: undefined
  }
  context.window = context
  vm.runInNewContext(accountingSource, context)
  return context.window.SMAccounting
}

describe('accounting vault math', () => {
  it('masks Iranian card numbers and formats sheba without exposing a security code', () => {
    const math = loadMath()
    expect(math.maskCard('6037991122228899')).toBe('6037 •••• •••• 8899')
    expect(math.fmtSheba('IR120170000000123456789012')).toMatch(/^IR12 /)
    expect(math.cardOf({ cardNumber: '6037991100001111' })).toBe('6037991100001111')
    expect(math.shebaOf({ shaba: 'IR00' })).toBe('IR00')
  })

  it('groups cashflow by Jalali month without mixing years', () => {
    const math = loadMath()
    const rows = math.cashflow12([
      { type: 'deposit', date: '1405/06/02', amount: 500 },
      { type: 'deposit', date: '1404/06/02', amount: 900 },
      { type: 'withdrawal', date: '1405/06/10', amount: 100 },
      { type: 'withdrawal', date: '1405/05/01', amount: 40 }
    ], '1405/06/20')
    expect(rows).toHaveLength(12)
    const current = rows.at(-1)
    expect(current.key).toBe('1405/06')
    expect(current.deposit).toBe(500)
    expect(current.withdrawal).toBe(100)
    expect(rows.find(r => r.key === '1405/05').withdrawal).toBe(40)
    expect(rows.some(r => r.key === '1404/06')).toBe(false)
  })

  it('maps withdrawals into stable expense-mix buckets', () => {
    const math = loadMath()
    const mix = math.expenseMix([
      { type: 'withdrawal', purposeCategory: 'personnel', amount: 70 },
      { type: 'withdrawal', purposeCategory: 'print', amount: 30 },
      { type: 'deposit', purposeCategory: 'contract_payment', amount: 999 }
    ])
    expect(mix.total).toBe(100)
    expect(mix.items.find(i => i.id === 'personnel').pct).toBe(70)
    expect(mix.items.find(i => i.id === 'print').pct).toBe(30)
  })
})

describe('accounting vault UI', () => {
  it('renders a gold/navy vault with masked cards and overview tabs', () => {
    const acc = accountingWith({
      banks: [{
        id: 'b1', name: 'ملت', bank: 'ملت', holder: 'استودیو مان',
        card: '6037991122228899', iban: 'IR120170000000123456789012', balance: 12500000
      }],
      transactions: [
        { id: 't1', type: 'deposit', date: '1405/06/02', amount: 200, bankId: 'b1', purpose: 'بیعانه' }
      ]
    })
    const el = { innerHTML: '' }
    acc.render(el)
    expect(el.innerHTML).toContain('sm-vault')
    expect(el.innerHTML).toContain('موجودی کل')
    expect(el.innerHTML).toContain('نمای کلی:on')
    expect(el.innerHTML).toContain('6037 •••• •••• 8899')
    expect(el.innerHTML).not.toContain('6037991122228899')
    expect(el.innerHTML.toLowerCase()).not.toMatch(/\bcvv\b/)
    expect(el.innerHTML).toContain('sm-vault-card is-gold')
  })

  it('keeps add/edit bank, deposit, withdrawal and cheque flows', () => {
    expect(accountingSource).toContain('addBank()')
    expect(accountingSource).toContain('_txForm')
    expect(accountingSource).toContain('addCheque()')
    expect(accountingSource).toContain('printReceipt')
    expect(accountingSource).toContain("label: 'نمای کلی'")
    expect(accountingSource).toContain("label: 'حساب‌ها'")
    expect(accountingSource).toContain("label: 'رفت‌وبرگشت'")
  })

  it('does not store or render a card security code and uses studio gold not lime', () => {
    expect(accountingSource.toLowerCase()).not.toMatch(/\bcvv\b/)
    expect(mathSource.toLowerCase()).not.toMatch(/\bcvv\b/)
    expect(css).toContain('--vault-gold: #C9A96E')
    expect(css).toContain('.sm-vault-card.is-gold')
    expect(css).toContain('.sm-vault-card.is-navy')
    expect(css.toLowerCase()).not.toMatch(/#c8f542|#d4ff3f|#b6ff3b|#c6ff4d/)
    expect(glassCss).toContain('.sm-vault')
    expect(html).toContain('js/accounting-math.js')
    expect(html.indexOf('js/accounting-math.js')).toBeLessThan(html.indexOf('js/accounting.js'))
  })
})
