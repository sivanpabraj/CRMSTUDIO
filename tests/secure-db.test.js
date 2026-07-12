import { describe, it, expect, vi } from 'vitest'
import { validateCsrfBound } from '../js/lib/csrf.js'

/** Minimal SecureDB _canWrite logic for unit test */
function canWrite(opts = {}) {
  const {
    authInternal = false,
    systemSync = false,
    collection = '',
    setupPhase = false,
    csrfValid = false
  } = opts
  if (authInternal || systemSync) return true
  if (collection === 'securityState' || collection === 'logs') return true
  if (setupPhase) return true
  return csrfValid
}

describe('SecureDB delete policy', () => {
  it('blocks delete without CSRF like other writes', () => {
    expect(canWrite({ collection: 'contracts', csrfValid: false })).toBe(false)
  })

  it('allows delete during system sync', () => {
    expect(canWrite({ collection: 'contracts', systemSync: true, csrfValid: false })).toBe(true)
  })
})

describe('SecureDB write policy', () => {
  it('allows securityState without session', () => {
    expect(canWrite({ collection: 'securityState', csrfValid: false })).toBe(true)
  })

  it('allows logs without session', () => {
    expect(canWrite({ collection: 'logs', csrfValid: false })).toBe(true)
  })

  it('blocks normal collections without CSRF', () => {
    expect(canWrite({ collection: 'contracts', csrfValid: false })).toBe(false)
  })

  it('allows system sync bypass', () => {
    expect(canWrite({ collection: 'contracts', systemSync: true, csrfValid: false })).toBe(true)
  })

  it('allows auth internal bypass', () => {
    expect(canWrite({ collection: 'users', authInternal: true, csrfValid: false })).toBe(true)
  })

  it('setup phase ends mid-transaction when manager is inserted', () => {
    expect(canWrite({ collection: 'personnel', setupPhase: false, csrfValid: false })).toBe(false)
    expect(canWrite({ collection: 'personnel', authInternal: true, setupPhase: false, csrfValid: false })).toBe(true)
  })
})

describe('CSRF session bind regression', () => {
  it('rejects token from different user session', () => {
    const session = { userId: 'u1', csrf: 'tok' }
    expect(validateCsrfBound('tok', session, 'u2')).toBe(false)
  })
})
