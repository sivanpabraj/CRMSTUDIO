/**
 * Soft plan / quota gates for public SaaS (no payment gateway yet).
 * Enforced client-side as UX guard; server billing is a later phase.
 */

export const PLAN_LIMITS = {
  trial: {
    maxActiveContracts: 25,
    maxBanks: 3,
    maxMonthlyMoneyOps: 100,
    label: 'آزمایشی'
  },
  starter: {
    maxActiveContracts: 100,
    maxBanks: 8,
    maxMonthlyMoneyOps: 500,
    label: 'استارتر'
  },
  pro: {
    maxActiveContracts: 10000,
    maxBanks: 50,
    maxMonthlyMoneyOps: 50000,
    label: 'حرفه‌ای'
  }
}

export function resolvePlanTier(info = {}) {
  const raw = String(info.planTier || info.licenseTier || 'trial').toLowerCase()
  if (raw === 'pro' || raw === 'business' || raw === 'enterprise') return 'pro'
  if (raw === 'starter' || raw === 'basic' || raw === 'paid') return 'starter'
  return 'trial'
}

export function planLimitsFor(info = {}) {
  return PLAN_LIMITS[resolvePlanTier(info)] || PLAN_LIMITS.trial
}

/** Jalali period key YYYY/MM from Utils.todayJalali or ISO fallback */
export function currentPeriodMonth(todayJalali) {
  const s = String(todayJalali || '')
  const m = s.match(/^(\d{4}\/\d{2})/)
  if (m) return m[1]
  const d = new Date()
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function countMoneyOpsInPeriod(transactions = [], periodMonth) {
  return (transactions || []).filter(t => {
    if (!t || t._deleted) return false
    const pm = t.periodMonth || String(t.date || '').slice(0, 7)
    return pm === periodMonth
  }).length
}

/**
 * @returns {{ ok: true } | { ok: false, error: string, code: string }}
 */
export function assertMoneyOpAllowed(info, transactions, todayJalali) {
  const limits = planLimitsFor(info)
  const period = currentPeriodMonth(todayJalali)
  const used = countMoneyOpsInPeriod(transactions, period)
  if (used >= limits.maxMonthlyMoneyOps) {
    return {
      ok: false,
      code: 'plan_quota',
      error: `سقف عملیات مالی پلن ${limits.label} (${limits.maxMonthlyMoneyOps}/ماه) پر شده — پلن را ارتقا دهید`
    }
  }
  return { ok: true, used, limit: limits.maxMonthlyMoneyOps, period }
}

export function assertBankCreateAllowed(info, banks = []) {
  const limits = planLimitsFor(info)
  const active = (banks || []).filter(b => b && !b._deleted).length
  if (active >= limits.maxBanks) {
    return {
      ok: false,
      code: 'plan_quota',
      error: `سقف حساب بانکی پلن ${limits.label} (${limits.maxBanks}) پر شده`
    }
  }
  return { ok: true }
}

if (typeof window !== 'undefined') {
  window.PlanLimits = {
    PLAN_LIMITS,
    resolvePlanTier,
    planLimitsFor,
    assertMoneyOpAllowed,
    assertBankCreateAllowed,
    currentPeriodMonth,
    countMoneyOpsInPeriod
  }
}
