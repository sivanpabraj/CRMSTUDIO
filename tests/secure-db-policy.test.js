import { describe, it, expect } from 'vitest'
import { canWriteCollection, SECURE_DB_FINANCE } from '../js/lib/secure-db-policy.js'

describe('secure-db-policy (real module)', () => {
  it('allows securityState and logs without CSRF', () => {
    expect(canWriteCollection({ collection: 'securityState', csrfValid: false })).toBe(true)
    expect(canWriteCollection({ collection: 'logs', csrfValid: false })).toBe(true)
  })

  it('blocks normal collections without CSRF', () => {
    expect(canWriteCollection({ collection: 'contracts', csrfValid: false })).toBe(false)
  })

  it('allows system sync / auth internal bypass', () => {
    expect(canWriteCollection({ collection: 'contracts', systemSync: true, csrfValid: false })).toBe(true)
    expect(canWriteCollection({ collection: 'users', authInternal: true, csrfValid: false })).toBe(true)
  })

  it('requires manage_finance or manager for finance collections', () => {
    expect(SECURE_DB_FINANCE.has('transactions')).toBe(true)
    expect(canWriteCollection({
      collection: 'transactions', csrfValid: true, manageFinance: false, isManager: false
    })).toBe(false)
    expect(canWriteCollection({
      collection: 'transactions', csrfValid: true, manageFinance: true
    })).toBe(true)
    expect(canWriteCollection({
      collection: 'banks', csrfValid: true, isManager: true
    })).toBe(true)
  })

  it('allows non-finance with valid CSRF', () => {
    expect(canWriteCollection({ collection: 'bookings', csrfValid: true })).toBe(true)
  })
})
