/* ══════════════════════════════════════════════
   ChequeManager — پاس / برگشت / یادآوری چک
   Canonical: type, number, client (+ legacy aliases)
   ══════════════════════════════════════════════ */

const ChequeManager = {
  STATUS: {
    pending: { label: 'در انتظار پاس', cls: 'warning' },
    passed: { label: 'پاس شده', cls: 'success' },
    bounced: { label: 'برگشتی', cls: 'danger' },
    cancelled: { label: 'باطل', cls: 'gray' }
  },

  DIRECTION: {
    incoming: { label: 'گرفتن چک (دریافت)', short: 'دریافت', icon: 'fa-arrow-down', cls: 'success' },
    outgoing: { label: 'دادن چک (پرداخت)', short: 'پرداخت', icon: 'fa-arrow-up', cls: 'danger' }
  },

  typeOf(c) {
    return c?.type || c?.direction || 'incoming'
  },

  numberOf(c) {
    return c?.number || c?.chequeNumber || ''
  },

  partyOf(c) {
    return c?.client || c?.drawer || c?.party || ''
  },

  /** Unify legacy + Pro fields on a cheque record */
  normalizeFields(c) {
    if (!c) return c
    const type = this.typeOf(c)
    const number = this.numberOf(c)
    const client = this.partyOf(c)
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
  },

  list() {
    const rows = window.ErpRuntime?.hasTypedData?.()
      ? window.ErpRuntime.state().cheques
      : []
    return rows.map(c => this.normalizeFields(c))
  },

  pending() {
    return this.list().filter(c => c.status === 'pending')
  },

  find(id) {
    const raw = this.list().find(c => c.id === id)
    return raw ? this.normalizeFields(raw) : null
  },

  stats() {
    const all = this.list()
    const pending = all.filter(c => c.status === 'pending')
    const incoming = pending.filter(c => this.typeOf(c) === 'incoming')
    const outgoing = pending.filter(c => this.typeOf(c) === 'outgoing')
    const dueSoon = pending.filter(c => {
      const d = Utils.daysUntil(c.dueDate)
      return d !== null && d >= 0 && d <= 7
    })
    const overdue = pending.filter(c => {
      const d = Utils.daysUntil(c.dueDate)
      return d !== null && d < 0
    })
    return {
      total: all.length,
      pendingCount: pending.length,
      incomingCount: incoming.length,
      outgoingCount: outgoing.length,
      incomingAmount: incoming.reduce((s, c) => s + (c.amount || 0), 0),
      outgoingAmount: outgoing.reduce((s, c) => s + (c.amount || 0), 0),
      dueSoonCount: dueSoon.length,
      overdueCount: overdue.length,
      dueSoon,
      overdue,
      pending
    }
  },

  statusLabel(s) {
    return this.STATUS[s]?.label || s || '—'
  },

  directionLabel(d) {
    return this.DIRECTION[d]?.label || d || '—'
  },

  async syncNotifications() {
    const cheques = this.pending()
    const notifs = DB.get('notifications') || []

    for (const ch of cheques) {
      const days = Utils.daysUntil(ch.dueDate)
      if (days === null) continue
      const refKey = `cheque_${ch.id}`
      const existing = notifs.find(n => n.refKey === refKey)
      const dir = this.DIRECTION[this.typeOf(ch)]?.short || 'چک'
      const bank = (window.ErpRuntime?.state?.().bankAccounts || []).find(b => b.id === ch.bankId)
      const bankName = bank?.name || bank?.bank || '—'
      const party = this.partyOf(ch)
      let title, text, type

      if (days < 0) {
        title = `سررسید گذشته — چک ${dir}`
        text = `مبلغ ${Utils.fmtNum(ch.amount)} — ${party || '—'} — سررسید: ${ch.dueDate} — حساب: ${bankName}`
        type = 'danger'
      } else if (days <= 3) {
        title = `یادآوری پاس چک — ${dir}`
        text = `مبلغ ${Utils.fmtNum(ch.amount)} — ${days === 0 ? 'امروز' : Utils.fmtNum(days) + ' روز دیگر'} — حساب: ${bankName}`
        type = 'warning'
      } else continue

      if (existing) {
        await SecureDB.update('notifications', existing.id, { title, text, type, read: false })
      } else {
        await SecureDB.insert('notifications', {
          title, text, type, read: false, refKey,
          createdAt: Utils.todayJalali(),
          link: 'accounting'
        })
      }
    }

    for (const n of notifs.filter(x => x.refKey?.startsWith('cheque_'))) {
      const id = n.refKey.replace('cheque_', '')
      const ch = this.find(id)
      if (!ch || ch.status !== 'pending') await SecureDB.update('notifications', n.id, { read: true })
    }
  },

  async passCheque(id) {
    const ch = this.find(id)
    if (!ch) return { ok: false, msg: 'چک یافت نشد' }
    if (ch.status !== 'pending') return { ok: false, msg: 'این چک قبلاً پاس یا باطل شده' }
    if (!ch.bankId) return { ok: false, msg: 'حساب بانکی مرتبط یافت نشد' }

    const amount = ch.amount || 0
    if (amount <= 0) return { ok: false, msg: 'مبلغ چک نامعتبر است' }

    try {
      const res = await DomainApi.transitionCheque({
        chequeId: id, expectedVersion: ch.version, status: 'cleared'
      })
      await window.ErpRuntime?.refresh?.({ force: true })
      return { ok: true, transactionId: res.receipt?.transactionId }
    } catch (error) {
      return { ok: false, msg: error.message || 'خطا در وصول اتمیک چک' }
    }
  },

  async bounceCheque(id, reason = '') {
    const ch = this.find(id)
    if (!ch) return { ok: false, msg: 'چک یافت نشد' }
    if (ch.status !== 'pending') return { ok: false, msg: 'فقط چک در انتظار قابل برگشت است' }

    try {
      await DomainApi.transitionCheque({ chequeId: id, expectedVersion: ch.version, status: 'bounced' })
      await window.ErpRuntime?.refresh?.({ force: true })
    } catch (error) { return { ok: false, msg: error.message } }
    DB.log('cheque_bounce', { id, reason })
    await this.syncNotifications()
    return { ok: true }
  },

  async cancelCheque(id) {
    const ch = this.find(id)
    if (!ch) return { ok: false, msg: 'چک یافت نشد' }
    if (ch.status === 'passed') return { ok: false, msg: 'ابتدا پاس چک را لغو کنید' }
    if (ch.status === 'cancelled') return { ok: false, msg: 'قبلاً ابطال شده' }

    try {
      await DomainApi.transitionCheque({ chequeId: id, expectedVersion: ch.version, status: 'cancelled' })
      await window.ErpRuntime?.refresh?.({ force: true })
    } catch (error) { return { ok: false, msg: error.message } }
    DB.log('cheque_cancel', { id })
    await this.syncNotifications()
    return { ok: true }
  },

  async revertPass(id) {
    const ch = this.find(id)
    if (!ch || ch.status !== 'passed') return { ok: false, msg: 'چک پاس‌شده یافت نشد' }

    try {
      await DomainApi.transitionCheque({ chequeId: id, expectedVersion: ch.version, status: 'pending' })
      await window.ErpRuntime?.refresh?.({ force: true })
    } catch (error) { return { ok: false, msg: error.message } }
    DB.log('cheque_revert_pass', { id })
    await this.syncNotifications()
    return { ok: true }
  }
}

window.ChequeManager = ChequeManager
