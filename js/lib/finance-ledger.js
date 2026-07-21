/**
 * Pure helpers for bank / cheque ledger consistency.
 * Canonical bank fields: account, iban (legacy: accountNumber, shaba)
 * Canonical cheque fields: type, number, client (legacy: direction, chequeNumber, party)
 */

export function chequeType(c) {
  if (!c) return 'incoming'
  return c.type || c.direction || 'incoming'
}

export function chequeNumber(c) {
  if (!c) return ''
  return c.number || c.chequeNumber || ''
}

export function chequeParty(c) {
  if (!c) return ''
  return c.client || c.drawer || c.party || ''
}

export function normalizeCheque(c) {
  if (!c || typeof c !== 'object') return c
  const type = chequeType(c)
  const number = chequeNumber(c)
  const client = chequeParty(c)
  return {
    ...c,
    type,
    direction: type,
    number,
    chequeNumber: number,
    client,
    party: client,
    drawer: c.drawer || client,
    status: c.status || 'pending'
  }
}

export function normalizeBank(b) {
  if (!b || typeof b !== 'object') return b
  const account = b.account || b.accountNumber || ''
  const iban = b.iban || b.shaba || ''
  return {
    ...b,
    account,
    accountNumber: account,
    iban,
    shaba: iban,
    card: b.card || '',
    holder: b.holder || '',
    balance: Number(b.balance) || 0
  }
}

export function bankDelta(balance, type, amount) {
  const bal = Number(balance) || 0
  const amt = Number(amount) || 0
  if (!amt) return bal
  return type === 'deposit' ? bal + amt : bal - amt
}

/**
 * Contract `paid` tracks post-deposit installments only.
 * Initial contract_deposit is stored on contract.deposit and must not inflate paid.
 */
export function nextContractPaid(contract, purposeCategory, amount, { reverse = false } = {}) {
  if (!contract || !amount) return null
  if (purposeCategory !== 'contract_payment') return null
  const delta = reverse ? -Number(amount) : Number(amount)
  const paid = Math.max(0, (Number(contract.paid) || 0) + delta)
  const balance = Math.max(0, (Number(contract.total) || 0) - (Number(contract.deposit) || 0) - paid)
  return { paid, balance }
}

/** Simulated pass: returns next bank balance and tx type, or error. */
export function previewPassCheque(cheque, bank) {
  const ch = normalizeCheque(cheque)
  if (!ch) return { ok: false, msg: 'چک یافت نشد' }
  if (ch.status !== 'pending') return { ok: false, msg: 'این چک قبلاً پاس یا باطل شده' }
  if (!bank) return { ok: false, msg: 'حساب بانکی مرتبط یافت نشد' }
  const amount = Number(ch.amount) || 0
  if (amount <= 0) return { ok: false, msg: 'مبلغ چک نامعتبر است' }
  const type = chequeType(ch)
  const bal = Number(bank.balance) || 0
  if (type === 'outgoing' && bal < amount) {
    return { ok: false, msg: 'موجودی حساب برای پاس این چک کافی نیست' }
  }
  const txType = type === 'incoming' ? 'deposit' : 'withdrawal'
  return {
    ok: true,
    type,
    amount,
    txType,
    newBalance: bankDelta(bal, txType, amount)
  }
}
