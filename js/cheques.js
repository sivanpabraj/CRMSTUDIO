/* ══════════════════════════════════════════════
   MAN — Cheque Management (گرفتن / دادن چک)
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

  list() {
    return DB.get('cheques') || []
  },

  pending() {
    return this.list().filter(c => c.status === 'pending')
  },

  stats() {
    const all = this.list()
    const pending = all.filter(c => c.status === 'pending')
    const incoming = pending.filter(c => c.direction === 'incoming')
    const outgoing = pending.filter(c => c.direction === 'outgoing')
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
    const notifs = DB.get('notifications')

    for (const ch of cheques) {
      const days = Utils.daysUntil(ch.dueDate)
      if (days === null) continue
      const refKey = `cheque_${ch.id}`
      const existing = notifs.find(n => n.refKey === refKey)
      const dir = this.DIRECTION[ch.direction]?.short || 'چک'
      const bank = DB.find('banks', b => b.id === ch.bankId)
      const bankName = bank?.name || '—'
      let title, text, type

      if (days < 0) {
        title = `سررسید گذشته — چک ${dir}`
        text = `مبلغ ${Utils.fmtNum(ch.amount)} — ${ch.party || '—'} — سررسید: ${ch.dueDate} — حساب: ${bankName}`
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
          link: 'finance'
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
    const ch = DB.find('cheques', c => c.id === id)
    if (!ch) return { ok: false, msg: 'چک یافت نشد' }
    if (ch.status !== 'pending') return { ok: false, msg: 'این چک قبلاً پاس یا باطل شده' }

    const bank = DB.find('banks', b => b.id === ch.bankId)
    if (!bank) return { ok: false, msg: 'حساب بانکی مرتبط یافت نشد' }

    const amount = ch.amount || 0
    if (amount <= 0) return { ok: false, msg: 'مبلغ چک نامعتبر است' }
    if (ch.direction === 'outgoing' && (bank.balance || 0) < amount) {
      return { ok: false, msg: 'موجودی حساب برای پاس این چک کافی نیست' }
    }

    const newBalance = ch.direction === 'incoming'
      ? (bank.balance || 0) + amount
      : (bank.balance || 0) - amount
    await SecureDB.update('banks', ch.bankId, { balance: newBalance })

    const txType = ch.direction === 'incoming' ? 'deposit' : 'withdrawal'
    const tx = await SecureDB.insert('transactions', {
      type: txType,
      amount,
      date: Utils.todayJalali(),
      bankId: ch.bankId,
      ref: ch.chequeNumber || '',
      party: ch.party || '—',
      category: ch.direction === 'incoming' ? 'دریافت چک' : (ch.category || 'پرداخت چک'),
      description: `پاس چک${ch.description ? ' — ' + ch.description : ''}`,
      chequeId: ch.id,
      contractId: ch.contractId || ''
    })

    await SecureDB.update('cheques', id, {
      status: 'passed',
      passDate: Utils.todayJalali(),
      transactionId: tx.id
    })

    if (ch.direction === 'incoming' && ch.contractId) {
      const c = DB.find('contracts', x => x.id === ch.contractId)
      if (c) {
        await SecureDB.update('contracts', ch.contractId, {
          balance: Math.max(0, (c.balance || 0) - amount)
        })
      }
    }

    DB.log('cheque_pass', { id, amount, direction: ch.direction, bankId: ch.bankId })
    this.syncNotifications()
    return { ok: true }
  },

  async revertPass(id) {
    const ch = DB.find('cheques', c => c.id === id)
    if (!ch || ch.status !== 'passed') return

    if (ch.transactionId) {
      const t = DB.find('transactions', x => x.id === ch.transactionId)
      if (t && t.bankId) {
        const bank = DB.find('banks', b => b.id === t.bankId)
        if (bank) {
          const revert = t.type === 'deposit'
            ? (bank.balance || 0) - t.amount
            : (bank.balance || 0) + t.amount
          DB.update('banks', t.bankId, { balance: revert })
        }
      }
      await SecureDB.update('transactions', ch.transactionId, { _deleted: true })
    }

    if (ch.direction === 'incoming' && ch.contractId) {
      const c = DB.find('contracts', x => x.id === ch.contractId)
      if (c) await SecureDB.update('contracts', ch.contractId, { balance: (c.balance || 0) + (ch.amount || 0) })
    }

    await SecureDB.update('cheques', id, { status: 'pending', passDate: '', transactionId: '' })
    this.syncNotifications()
  }
}

window.ChequeManager = ChequeManager

window.ChequeManager = ChequeManager
