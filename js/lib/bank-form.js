/**
 * Pure helpers for bank account form saves.
 * Ledger-managed balance must never be overwritten on metadata edit.
 */

export function bankMetadataPatch(fields = {}) {
  const account = fields.account || fields.accountNumber || ''
  const iban = fields.iban || fields.shaba || ''
  return {
    name: fields.name || fields.title || '',
    bank: fields.bank || '',
    holder: fields.holder || '',
    card: fields.card || '',
    account,
    accountNumber: account,
    iban,
    shaba: iban
  }
}

/** @returns {{ mode: 'update'|'insert', id?: string, patch?: object, row?: object }} */
export function bankSavePlan(item, fields = {}) {
  const patch = bankMetadataPatch(fields)
  if (item?.id) {
    return { mode: 'update', id: item.id, patch }
  }
  return {
    mode: 'insert',
    row: { ...patch, balance: Number(fields.balance) || 0 }
  }
}

if (typeof window !== 'undefined') {
  window.bankSavePlan = bankSavePlan
  window.bankMetadataPatch = bankMetadataPatch
}
