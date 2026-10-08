/**
 * Studio Core Finance — یک منبع حقیقت برای مانده قرارداد
 * استفاده: StudioFinance.forContract(c)
 */
;(function (w) {
  'use strict'

  function num(v) {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  const StudioFinance = {
    version: '1.0.0',

    totalOf(c) {
      if (!c) return 0
      return num(c.total || c.totalPrice || c.finalAmount || c.price || c.amount || 0)
    },

    paidOf(c) {
      if (!c) return 0
      const deposit = num(c.deposit || c.prepayment || 0)
      const paidField = num(c.paid || c.paidAmount || 0)
      let linked = 0
      try {
        const tx = (typeof DB !== 'undefined' && DB.get('transactions')) || []
        linked = tx
          .filter((t) => t && t.contractId === c.id && (t.type === 'deposit' || t.type === 'income' || t.type === 'payment'))
          .reduce((s, t) => s + num(t.amount), 0)
      } catch { /* */ }
      // اگر تراکنش لینک‌شده هست همان اولویت دارد
      if (linked > 0) return linked
      return deposit + paidField
    },

    debtOf(c) {
      return Math.max(0, this.totalOf(c) - this.paidOf(c))
    },

    forContract(c) {
      const total = this.totalOf(c)
      const paid = this.paidOf(c)
      const debt = Math.max(0, total - paid)
      return {
        total,
        paid,
        debt,
        settled: debt <= 0 && total > 0,
        couple: c?.couple || `${c?.bride || ''} و ${c?.groom || ''}`.trim(),
        contractNum: c?.contractNum || '',
        id: c?.id
      }
    },

    fmt(n) {
      try {
        if (typeof Utils !== 'undefined' && Utils.fmtNum) return Utils.fmtNum(n)
      } catch { /* */ }
      return num(n).toLocaleString('fa-IR')
    }
  }

  w.StudioFinance = StudioFinance
})(typeof window !== 'undefined' ? window : globalThis)
