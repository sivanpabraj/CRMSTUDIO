import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderSafePackageCard, safePackageColor } from '../js/lib/contract-render-security.js'

let listeners
let ElementStub
let calls

function eventTarget(attributes) {
  const element = new ElementStub()
  element.dataset = {
    step: attributes['data-step'],
    role: attributes['data-role'],
    ratio: attributes['data-ratio'],
    packageId: attributes['data-package-id'],
    format: attributes['data-format']
  }
  element.getAttribute = name => attributes[name] ?? null
  element.closest = selector => selector === `[${Object.keys(attributes)[0]}]` ? element : null
  return element
}

describe('contract CSP delegated behavior', () => {
  beforeEach(async () => {
    vi.resetModules()
    listeners = new Map()
    ElementStub = class Element {}
    calls = {
      gotoStep: vi.fn(),
      onVerifyPhoneChange: vi.fn(),
      updateCamOperators: vi.fn(),
      calcTotals: vi.fn()
    }
    const noOp = vi.fn()
    vi.stubGlobal('Element', ElementStub)
    vi.stubGlobal('document', {
      addEventListener(type, handler) { listeners.set(type, handler) },
      getElementById: vi.fn(() => null)
    })
    vi.stubGlobal('window', { location: { href: '' } })
    vi.stubGlobal('Bootstrap', { start: vi.fn() })
    vi.stubGlobal('DB', { get: () => ({}) })
    vi.stubGlobal('Auth', undefined)
    for (const [name, fn] of Object.entries({
      ...calls,
      saveContractDraft: noOp,
      sendVerifySms: noOp,
      confirmVerify: noOp,
      quickDeposit: noOp,
      openInvoice: noOp,
      exportPDF: noOp,
      printContract: noOp,
      finalizeContract: noOp,
      applyContractPackage: noOp,
      clearContractPackage: noOp,
      setPdfFormat: noOp,
      syncPreview: noOp,
      onContractTypesChange: noOp,
      toggleQualityPrice: noOp,
      toggleAlbumFields: noOp,
      togglePrintFields: noOp,
      togglePhotoPackFields: noOp,
      onDepositBankChange: noOp
    })) vi.stubGlobal(name, fn)
    await import('../js/contract-page.js')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('dispatches navigation without evaluating handler text', () => {
    const preventDefault = vi.fn()
    listeners.get('click')({
      type: 'click',
      target: eventTarget({ 'data-contract-action': 'goto-step', 'data-step': '2' }),
      preventDefault
    })
    expect(calls.gotoStep).toHaveBeenCalledWith(2)
    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it('dispatches phone input and composite camera recalculation', () => {
    listeners.get('input')({
      type: 'input',
      target: eventTarget({ 'data-contract-input': 'verify-phone', 'data-role': 'bride' })
    })
    listeners.get('change')({
      type: 'change',
      target: eventTarget({ 'data-contract-change': 'cameras' })
    })
    expect(calls.onVerifyPhoneChange).toHaveBeenCalledWith('bride')
    expect(calls.updateCamOperators).toHaveBeenCalledOnce()
    expect(calls.calcTotals).toHaveBeenCalledOnce()
  })

  it('ignores an unknown action instead of evaluating it', () => {
    listeners.get('click')({
      type: 'click',
      target: eventTarget({ 'data-contract-action': 'alert(document.cookie)' }),
      preventDefault: vi.fn()
    })
    expect(calls.gotoStep).not.toHaveBeenCalled()
  })

  it('renders hostile package fields as inert text and rejects CSS script payloads', () => {
    const html = renderSafePackageCard({
      packageItem: {
        id: 'pkg" onmouseover="steal()',
        name: '<img src=x onerror=steal()>',
        color: 'red;background:url(javascript:steal())'
      },
      tier: { icon: '<svg onload=steal()>', label: '<script>steal()</script>', color: 'expression(steal())' },
      totalLabel: '<img src=x>',
      features: ['<svg onload=steal()>']
    })
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('background:url')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('&lt;img')
    expect(html).toContain('--pkg-color:#64748b')
    expect(safePackageColor('#A1b2C3')).toBe('#A1b2C3')
  })
})
