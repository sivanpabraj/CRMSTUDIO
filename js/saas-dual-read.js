/**
 * فاز B — Dual-read: ترجیح API v2، در صورت خطا fallback به IndexedDB/DB محلی
 */
(function (w) {
  'use strict'

  async function apiGet(path) {
    if (!w.SaasContext?.getToken?.()) {
      return { ok: false, offline: true }
    }
    try {
      const res = await fetch(path, { headers: w.SaasContext.headers() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: data.error, status: res.status }
      return data
    } catch (e) {
      return { ok: false, error: e.message, network: true }
    }
  }

  function localTable(name) {
    try {
      if (typeof DB !== 'undefined' && DB.get) return DB.get(name) || []
    } catch { /* */ }
    return []
  }

  function mapContract(row) {
    if (!row) return row
    return {
      id: row.id,
      contractNum: row.contract_num || row.contractNum,
      bride: row.bride,
      groom: row.groom,
      couple: row.couple || [row.bride, row.groom].filter(Boolean).join(' و '),
      phone: row.phone,
      bridePhone: row.bride_phone || row.bridePhone,
      groomPhone: row.groom_phone || row.groomPhone,
      eventDate: row.event_date || row.eventDate,
      totalPrice: Number(row.total_price ?? row.totalPrice ?? 0),
      paidAmount: Number(row.paid_amount ?? row.paidAmount ?? 0),
      status: row.status,
      ...((row.payload && typeof row.payload === 'object') ? row.payload : {})
    }
  }

  const SaasDual = {
    async contracts() {
      const remote = await apiGet('/api/v2/contracts')
      if (remote.ok && Array.isArray(remote.items)) {
        return { source: 'api', items: remote.items.map(mapContract) }
      }
      return { source: 'local', items: localTable('contracts') }
    },

    async banks() {
      const remote = await apiGet('/api/v2/banks')
      if (remote.ok && Array.isArray(remote.items)) return { source: 'api', items: remote.items }
      return { source: 'local', items: localTable('banks') }
    },

    async transactions() {
      const remote = await apiGet('/api/v2/transactions')
      if (remote.ok && Array.isArray(remote.items)) return { source: 'api', items: remote.items }
      return { source: 'local', items: localTable('transactions') }
    },

    async personnel() {
      const remote = await apiGet('/api/v2/personnel')
      if (remote.ok && Array.isArray(remote.items)) return { source: 'api', items: remote.items }
      return { source: 'local', items: localTable('personnel') }
    },

    async afish() {
      const remote = await apiGet('/api/v2/afish')
      if (remote.ok && Array.isArray(remote.items)) return { source: 'api', items: remote.items }
      return { source: 'local', items: localTable('persProjects') }
    },

    /** پر کردن کش محلی از snapshot سرور (وقتی v2 زنده است) */
    async hydrateLocalFromSnapshot() {
      const snap = await apiGet('/api/v2/studio/snapshot')
      if (!snap.ok || typeof DB === 'undefined') return { ok: false, ...snap }
      try {
        if (snap.contracts) DB.set('contracts', snap.contracts.map(mapContract))
        if (snap.banks) DB.set('banks', snap.banks)
        if (snap.transactions) DB.set('transactions', snap.transactions)
        if (snap.personnel) DB.set('personnel', snap.personnel)
        if (snap.persProjects) DB.set('persProjects', snap.persProjects)
        await DB.flush?.()
        return { ok: true, source: 'api', at: snap.at }
      } catch (e) {
        return { ok: false, error: e.message }
      }
    },

    async createTransaction(body) {
      if (!w.SaasContext?.getToken?.()) {
        return { ok: false, error: 'SaaS session نیست — از مسیر محلی استفاده کنید' }
      }
      try {
        const res = await fetch('/api/v2/transactions', {
          method: 'POST',
          headers: w.SaasContext.headers(),
          body: JSON.stringify(body)
        })
        return await res.json()
      } catch (e) {
        return { ok: false, error: e.message }
      }
    }
  }

  w.SaasDual = SaasDual
})(typeof window !== 'undefined' ? window : globalThis)
