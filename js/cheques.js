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
    const rows = typeof DB.active === 'function'
      ? DB.active('cheques')
      : (DB.get('cheques') || []).filter(c => !c._deleted)
    return rows.map(c => this.normalizeFields(c))
  },

  pending() {
    return this.list().filter(c => c.status === 'pending')
  },

  find(id) {
    const raw = DB.find('cheques', c => c.id === id)
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
      const bank = DB.find('banks', b => b.id === ch.bankId)
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
      const ch = DB.find('cheques', c => c.id === id)
      if (!ch || ch.status !== 'pending') await SecureDB.update('notifications', n.id, { read: true })
    }
  },

  async passCheque(id) {
    const ch = this.find(id)
    if (!ch) return { ok: false, msg: 'چک یافت نشد' }
    if (ch.status !== 'pending') return { ok: false, msg: 'این چک قبلاً پاس یا باطل شده' }
    if (!ch.bankId) return { ok: false, msg: 'حساب بانکی مرتبط یافت نشد' }

    const bank = DB.find('banks', b => b.id === ch.bankId)
    if (!bank) return { ok: false, msg: 'حساب بانکی مرتبط یافت نشد' }

    const amount = ch.amount || 0
    if (amount <= 0) return { ok: false, msg: 'مبلغ چک نامعتبر است' }

    const dir = this.typeOf(ch)
    if (dir === 'outgoing' && (bank.balance || 0) < amount) {
      return { ok: false, msg: 'موجودی حساب برای پاس این چک کافی نیست' }
    }

    const purpose = dir === 'incoming' ? 'دریافت چک' : (ch.purpose || ch.category || 'پرداخت چک')

    // FinanceSync is mandatory for cheque ledger writes
    if (typeof FinanceSync !== 'undefined') {
      const ledgerOpts = {
        amount,
        bankId: ch.bankId,
        date: Utils.todayJalali(),
        contractId: ch.contractId || '',
        client: this.partyOf(ch),
        purposeCategory: dir === 'incoming'
          ? (ch.contractId ? 'contract_payment' : 'other_income')
          : 'other',
        purpose,
        paymentMethod: 'cheque',
        transactionRef: this.numberOf(ch),
        notes: ch.notes || '',
        desc: `پاس چک ${this.numberOf(ch)}${ch.purpose ? ' — ' + ch.purpose : ''}`,
        syncInvoice: true,
        allowOverdraft: dir !== 'outgoing'
      }
      const res = dir === 'incoming'
        ? await FinanceSync.recordDeposit(ledgerOpts)
        : await FinanceSync.recordWithdrawal(ledgerOpts)
      if (!res.ok) return { ok: false, msg: res.error || 'خطا در پاس چک' }

      try {
        await SecureDB.update('transactions', res.transactionId, { chequeId: ch.id })
        await SecureDB.update('cheques', id, {
          status: 'passed',
          passDate: Utils.todayJalali(),
          transactionId: res.transactionId,
          type: dir,
          direction: dir,
          number: this.numberOf(ch),
          chequeNumber: this.numberOf(ch),
          client: this.partyOf(ch),
          party: this.partyOf(ch)
        })
      } catch (e) {
        try {
          await FinanceSync.deleteTransaction(res.transactionId)
        } catch (re) {
          if (typeof SMObservability !== 'undefined') {
            SMObservability.captureError('finance_rollback:chequePassCompensate', re, { rollback: true })
          }
        }
        return { ok: false, msg: e.message || 'خطا در پاس چک — تغییرات برگشت داده شد' }
      }

      DB.log('cheque_pass', { id, amount, direction: dir, bankId: ch.bankId })
      await this.syncNotifications()
      return { ok: true, transactionId: res.transactionId }
    }

    return { ok: false, msg: 'ماژول مالی در دسترس نیست — از Studio M استفاده کنید' }
  },

  async bounceCheque(id, reason = '') {
    const ch = this.find(id)
    if (!ch) return { ok: false, msg: 'چک یافت نشد' }
    if (ch.status !== 'pending') return { ok: false, msg: 'فقط چک در انتظار قابل برگشت است' }

    await SecureDB.update('cheques', id, {
      status: 'bounced',
      bounceDate: Utils.todayJalali(),
      bounceReason: reason || '',
      type: this.typeOf(ch),
      direction: this.typeOf(ch),
      number: this.numberOf(ch),
      chequeNumber: this.numberOf(ch)
    })
    DB.log('cheque_bounce', { id, reason })
    await this.syncNotifications()
    return { ok: true }
  },

  async cancelCheque(id) {
    const ch = this.find(id)
    if (!ch) return { ok: false, msg: 'چک یافت نشد' }
    if (ch.status === 'passed') return { ok: false, msg: 'ابتدا پاس چک را لغو کنید' }
    if (ch.status === 'cancelled') return { ok: false, msg: 'قبلاً ابطال شده' }

    await SecureDB.update('cheques', id, { status: 'cancelled' })
    DB.log('cheque_cancel', { id })
    await this.syncNotifications()
    return { ok: true }
  },

  async revertPass(id) {
    const ch = this.find(id)
    if (!ch || ch.status !== 'passed') return { ok: false, msg: 'چک پاس‌شده یافت نشد' }

    if (ch.transactionId) {
      if (typeof FinanceSync === 'undefined') {
        return { ok: false, msg: 'ماژول مالی در دسترس نیست' }
      }
      const t = DB.find('transactions', x => x.id === ch.transactionId)
      if (t && !t._deleted) {
        const res = await FinanceSync.deleteTransaction(ch.transactionId)
        if (!res.ok) return { ok: false, msg: res.error || 'خطا در برگشت تراکنش چک' }
      }
    }

    await SecureDB.update('cheques', id, { status: 'pending', passDate: '', transactionId: '' })
    DB.log('cheque_revert_pass', { id })
    await this.syncNotifications()
    return { ok: true }
  }
}

window.ChequeManager = ChequeManager
