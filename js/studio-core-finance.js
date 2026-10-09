/**
 * Studio Core Finance — یک منبع حقیقت برای مانده قرارداد
 * استفاده: StudioFinance.forContract(c)
 */
;(function (w) {
  'use strict'

  function parseAmount(v) {
    if (v === null || v === undefined) return 0
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0
    const s = String(v)
      .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[^\d.-]/g, '')
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : 0
  }

  const StudioFinance = {
    version: '1.1.0',

    parseAmount(v) {
      return parseAmount(v)
    },

    totalOf(c) {
      if (!c) return 0
      let total = parseAmount(c.total || c.totalPrice || c.finalAmount || c.price || c.amount || 0)
      if (total === 0 && Array.isArray(c.lineItems) && c.lineItems.length > 0) {
        total = c.lineItems.reduce((s, i) => s + parseAmount(i.amount || i.price || 0), 0)
      }
      const discount = parseAmount(c.discount || 0)
      if (discount > 0 && total > discount) {
        total -= discount
      }
      return total
    },

    paidOf(c) {
      if (!c) return 0
      const deposit = parseAmount(c.deposit || c.prepayment || 0)
      const paidField = parseAmount(c.paid || c.paidAmount || 0)
      let linked = 0
      try {
        const tx = (typeof DB !== 'undefined' && DB.get('transactions')) || []
        linked = tx
          .filter((t) => t && t.contractId === c.id && (t.type === 'deposit' || t.type === 'income' || t.type === 'payment'))
          .reduce((s, t) => s + parseAmount(t.amount), 0)
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
      const isSettled = debt <= 0 && total > 0
      const pctPaid = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 100

      return {
        total,
        paid,
        debt,
        remaining: debt,
        balance: debt,
        settled: isSettled,
        isSettled,
        pctPaid,
        couple: c?.couple || `${c?.bride || ''} و ${c?.groom || ''}`.trim(),
        contractNum: c?.contractNum || '',
        id: c?.id,
        totalFormatted: this.formatToman(total),
        paidFormatted: this.formatToman(paid),
        remainingFormatted: this.formatToman(debt)
      }
    },

    fmt(n) {
      try {
        if (typeof Utils !== 'undefined' && Utils.fmtNum) return Utils.fmtNum(n)
      } catch { /* */ }
      return parseAmount(n).toLocaleString('fa-IR')
    },

    formatToman(amount) {
      return `${this.fmt(amount)} تومان`
    },

    formatRial(amount) {
      const n = Math.round(parseAmount(amount)) * 10
      return `${n.toLocaleString('fa-IR')} ریال`
    }
  }

  w.StudioFinance = StudioFinance
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = StudioFinance
  }
})(typeof window !== 'undefined' ? window : globalThis)
