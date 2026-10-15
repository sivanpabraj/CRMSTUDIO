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

  function mapBank(b) {
    if (!b) return b
    return {
      id: b.id,
      name: b.name,
      bank: b.bank_name || b.name,
      bankName: b.bank_name || b.name,
      account: b.account,
      card: b.card,
      iban: b.iban,
      balance: Number(b.balance || 0),
      createdAt: b.created_at,
      ...((b.payload && typeof b.payload === 'object') ? b.payload : {})
    }
  }

  function mapTransaction(t) {
    if (!t) return t
    return {
      id: t.id,
      type: t.type,
      amount: Number(t.amount || 0),
      date: t.date_jalali,
      dateJalali: t.date_jalali,
      bankId: t.bank_id,
      contractId: t.contract_id,
      personnelId: t.personnel_id,
      purposeCategory: t.purpose_category,
      purpose: t.purpose,
      notes: t.purpose,
      client: t.client_name,
      createdAt: t.created_at,
      ...((t.payload && typeof t.payload === 'object') ? t.payload : {})
    }
  }

  function mapPersonnel(p) {
    if (!p) return p
    return {
      id: p.id,
      userId: p.user_id,
      name: p.name,
      phone: p.phone,
      roles: p.roles || [],
      status: p.status,
      createdAt: p.created_at,
      ...((p.payload && typeof p.payload === 'object') ? p.payload : {})
    }
  }

  function mapAfish(a) {
    if (!a) return a
    return {
      id: a.id,
      contractId: a.contract_id,
      personnelId: a.personnel_id,
      roleId: a.role_id,
      accepted: a.accepted,
      createdAt: a.created_at,
      ...((a.payload && typeof a.payload === 'object') ? a.payload : {})
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
      if (remote.ok && Array.isArray(remote.items)) return { source: 'api', items: remote.items.map(mapBank) }
      return { source: 'local', items: localTable('banks') }
    },

    async transactions() {
      const remote = await apiGet('/api/v2/transactions')
      if (remote.ok && Array.isArray(remote.items)) return { source: 'api', items: remote.items.map(mapTransaction) }
      return { source: 'local', items: localTable('transactions') }
    },

    async personnel() {
      const remote = await apiGet('/api/v2/personnel')
      if (remote.ok && Array.isArray(remote.items)) return { source: 'api', items: remote.items.map(mapPersonnel) }
      return { source: 'local', items: localTable('personnel') }
    },

    async afish() {
      const remote = await apiGet('/api/v2/afish')
      if (remote.ok && Array.isArray(remote.items)) return { source: 'api', items: remote.items.map(mapAfish) }
      return { source: 'local', items: localTable('persProjects') }
    },

    /** پر کردن کش محلی از snapshot سرور (وقتی v2 زنده است) */
    async hydrateLocalFromSnapshot() {
      const snap = await apiGet('/api/v2/studio/snapshot')
      if (!snap.ok || typeof DB === 'undefined') return { ok: false, ...snap }
      try {
        if (snap.contracts) DB.set('contracts', snap.contracts.map(mapContract))
        if (snap.banks) DB.set('banks', snap.banks.map(mapBank))
        if (snap.transactions) DB.set('transactions', snap.transactions.map(mapTransaction))
        if (snap.personnel) DB.set('personnel', snap.personnel.map(mapPersonnel))
        if (snap.persProjects) DB.set('persProjects', snap.persProjects.map(mapAfish))
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
