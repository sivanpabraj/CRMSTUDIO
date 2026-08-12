/**
 * Pure SecureDB write-policy helpers (testable without browser Auth/DB).
 */

export const SECURE_DB_FINANCE = new Set([
  'transactions', 'banks', 'cheques', 'invoices', 'expenses', 'salaryPayments', 'financeOutbox'
])

export function canWriteCollection(opts = {}) {
  const {
    collection = '',
    authInternal = false,
    systemSync = false,
    setupPhase = false,
    csrfValid = false,
    manageFinance = false,
    isManager = false,
    financeCollections = SECURE_DB_FINANCE
  } = opts

  if (authInternal || systemSync) return true
  if (collection === 'securityState' || collection === 'logs') return true
  if (setupPhase) return true
  if (!csrfValid) return false
  if (!financeCollections.has(collection)) return true
  return !!(manageFinance || isManager)
}

if (typeof window !== 'undefined') {
  window.canWriteCollection = canWriteCollection
  window.SECURE_DB_FINANCE = SECURE_DB_FINANCE
}
