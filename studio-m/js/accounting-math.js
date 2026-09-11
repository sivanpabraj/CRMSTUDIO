/* Studio M — pure accounting helpers (no DOM) */
(function (root) {
  const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

  const EXPENSE_MIX = [
    { id: 'personnel', label: 'حقوق', cats: ['personnel'], color: '#C9A96E' },
    { id: 'print', label: 'چاپ و آلبوم', cats: ['print'], color: '#0071E3' },
    { id: 'equipment', label: 'تجهیزات', cats: ['equipment'], color: '#5B8DEF' },
    { id: 'ops', label: 'اجاره و قبض', cats: ['rent', 'utility'], color: '#8B7355' },
    { id: 'other', label: 'سایر', cats: ['other', 'transfer', 'cancellation_refund'], color: '#6B7C93' }
  ]

  function maskCard(num) {
    const s = String(num || '').replace(/\s/g, '')
    const d = s.replace(/\D/g, '')
    if (d.length < 8) return s || '—'
    return `${d.slice(0, 4)} •••• •••• ${d.slice(-4)}`
  }

  function fmtSheba(iban) {
    const s = String(iban || '').replace(/\s/g, '').toUpperCase()
    if (!s) return '—'
    return s.replace(/(.{4})/g, '$1 ').trim()
  }

  function cardOf(bank) {
    if (!bank) return ''
    return bank.card || bank.cardNumber || ''
  }

  function shebaOf(bank) {
    if (!bank) return ''
    return bank.iban || bank.shaba || ''
  }

  function accountOf(bank) {
    if (!bank) return ''
    return bank.account || bank.accountNumber || ''
  }

  function monthKey(jdate) {
    return String(jdate || '').slice(0, 7)
  }

  function bankBalanceSum(banks) {
    return (banks || []).reduce((s, b) => s + (+b.balance || 0), 0)
  }

  function monthTotals(txs, key) {
    let deposit = 0
    let withdrawal = 0
    for (const t of txs || []) {
      if (monthKey(t.date) !== key) continue
      if (t.type === 'deposit') deposit += +t.amount || 0
      else if (t.type === 'withdrawal') withdrawal += +t.amount || 0
    }
    return { deposit, withdrawal, net: deposit - withdrawal }
  }

  function cashflow12(txs, todayJ) {
    const parts = String(todayJ || '').split('/')
    let y = +parts[0] || 1405
    let m = +parts[1] || 1
    const slots = []
    for (let i = 0; i < 12; i++) {
      slots.unshift({
        y,
        m,
        key: `${y}/${String(m).padStart(2, '0')}`,
        label: JALALI_MONTHS[m - 1] || String(m)
      })
      m -= 1
      if (m < 1) {
        m = 12
        y -= 1
      }
    }
    const list = txs || []
    const rows = slots.map(slot => ({ ...slot, ...monthTotals(list, slot.key) }))
    const peak = Math.max(1, ...rows.map(x => Math.max(x.deposit, x.withdrawal)))
    return rows.map(x => ({
      ...x,
      depositPct: Math.round((x.deposit / peak) * 100),
      withdrawalPct: Math.round((x.withdrawal / peak) * 100)
    }))
  }

  function expenseMix(txs) {
    const withdrawals = (txs || []).filter(t => t.type === 'withdrawal')
    const buckets = EXPENSE_MIX.map(g => ({ id: g.id, label: g.label, color: g.color, cats: g.cats, amount: 0 }))
    const other = buckets.find(b => b.id === 'other')
    for (const t of withdrawals) {
      const cat = t.purposeCategory || 'other'
      const bucket = buckets.find(b => b.cats.includes(cat)) || other
      bucket.amount += +t.amount || 0
    }
    const total = buckets.reduce((s, b) => s + b.amount, 0)
    return {
      total,
      items: buckets.map(b => ({
        id: b.id,
        label: b.label,
        color: b.color,
        amount: b.amount,
        pct: total ? Math.round((b.amount / total) * 100) : 0
      }))
    }
  }

  root.SMAccMath = {
    JALALI_MONTHS,
    EXPENSE_MIX,
    maskCard,
    fmtSheba,
    cardOf,
    shebaOf,
    accountOf,
    monthKey,
    bankBalanceSum,
    monthTotals,
    cashflow12,
    expenseMix
  }
})(typeof window !== 'undefined' ? window : globalThis)
