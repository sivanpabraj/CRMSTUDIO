/**
 * فاز C — Write-through: وقتی نشست SaaS هست، تراکنش/قرارداد مهم به API v2 هم می‌رود
 * بدون شکستن مسیر محلی
 */
(function (w) {
  'use strict'

  function hasSaas() {
    return typeof SaasContext !== 'undefined' && !!SaasContext.getToken?.() && !!SaasContext.getStudioId?.()
  }

  async function post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: SaasContext.headers(),
      body: JSON.stringify(body)
    })
    return res.json().catch(() => ({ ok: false }))
  }

  function boot() {
    if (w.__saasWriteBridge) return
    w.__saasWriteBridge = true

    if (typeof SecureDB !== 'undefined' && SecureDB.insert && !SecureDB.__saasWrite) {
      SecureDB.__saasWrite = true
      const orig = SecureDB.insert.bind(SecureDB)
      SecureDB.insert = async function (table, data) {
        const row = await orig(table, data)
        if (!hasSaas() || !data || data._skipSaas) return row
        try {
          if (table === 'transactions') {
            post('/api/v2/transactions', {
              type: data.type,
              amount: data.amount,
              date: data.date,
              bankId: data.bankId,
              contractId: data.contractId,
              personnelId: data.personnelId,
              purposeCategory: data.purposeCategory,
              purpose: data.purpose || data.notes,
              client: data.client,
              payload: data
            }).catch(() => {})
          } else if (table === 'contracts') {
            post('/api/v2/contracts', {
              contractNum: data.contractNum,
              bride: data.bride,
              groom: data.groom,
              couple: data.couple,
              phone: data.phone || data.groomPhone,
              bridePhone: data.bridePhone,
              groomPhone: data.groomPhone,
              eventDate: data.eventDate,
              totalPrice: data.totalPrice || data.price,
              paidAmount: data.paidAmount || data.paid,
              status: data.status,
              payload: data
            }).catch(() => {})
          } else if (table === 'personnel') {
            post('/api/v2/personnel', {
              name: data.name,
              phone: data.phone,
              roles: data.roles,
              status: data.status,
              payload: data
            }).catch(() => {})
          } else if (table === 'persProjects') {
            post('/api/v2/afish', {
              contractId: data.contractId,
              personnelId: data.personnelId,
              roleId: data.roleId || data.role,
              accepted: data.accepted,
              payload: data
            }).catch(() => {})
          } else if (table === 'banks') {
            post('/api/v2/banks', {
              name: data.name,
              bankName: data.bank,
              account: data.account,
              card: data.card,
              iban: data.iban,
              balance: data.balance,
              payload: data
            }).catch(() => {})
          }
        } catch (e) {
          console.warn('[saas-write]', e)
        }
        return row
      }
    }

    // بعد از ورود SaaS، یک‌بار hydrate
    w.addEventListener?.('saas-studio-changed', () => {
      if (typeof SaasDual !== 'undefined') {
        SaasDual.hydrateLocalFromSnapshot?.().catch(() => {})
      }
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 600))
  } else setTimeout(boot, 600)
  setTimeout(boot, 2000)

  w.SaasWriteBridge = { boot, hasSaas }
})(typeof window !== 'undefined' ? window : globalThis)
