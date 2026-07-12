/* ══════════════════════════════════════════════
   صندوق مشتری — گفتگو و گروه‌بندی زوج‌به‌زوج
   ══════════════════════════════════════════════ */

const InboxShared = {
  AUTHOR_LABELS: {
    customer: 'مشتری',
    manager: 'مدیر',
    staff: 'پرسنل',
    system: 'سیستم'
  },

  STATUS: {
    pending: { label: 'منتظر تأیید مدیر', badge: 'warning' },
    sent_to_editing: { label: 'تأیید — در تدوین / عکس‌خانه', badge: 'success' },
    rejected: { label: 'رد شده', badge: 'danger' },
    open: { label: 'باز', badge: 'info' }
  },

  nowParts() {
    const d = new Date()
    return {
      date: Utils.todayJalali(),
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      iso: new Date().toISOString()
    }
  },

  typeInfo(type) {
    return (typeof PortalShared !== 'undefined' && PortalShared.REQUEST_TYPES?.[type])
      || { icon: '📝', label: type || 'درخواست' }
  },

  statusInfo(status) {
    return this.STATUS[status] || { label: status || '—', badge: 'muted' }
  },

  ensureThread(req) {
    if (req.thread?.length) return req.thread
    return [{
      id: 'orig',
      author: 'customer',
      authorName: req.customerName || 'مشتری',
      text: req.text || '',
      date: req.createdAt || '',
      time: req.createdTime || '',
      at: req.lastActivityAt || req.createdAt || '',
      action: 'request'
    }]
  },

  appendThread(requestId, entry) {
    const req = DB.find('customerRequests', r => r.id === requestId)
    if (!req) return null
    const parts = this.nowParts()
    const thread = [...(req.thread?.length ? req.thread : this.ensureThread(req))]
    const row = {
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: entry.date || parts.date,
      time: entry.time || parts.time,
      at: parts.iso,
      author: entry.author || 'manager',
      authorName: entry.authorName || '',
      text: entry.text || '',
      action: entry.action || 'reply'
    }
    thread.push(row)
    const patch = { thread, lastActivityAt: parts.iso }
    if (entry.status) patch.status = entry.status
    if (entry.readByStaff != null) patch.readByStaff = entry.readByStaff
    if (entry.read != null) patch.read = entry.read
    DB.update('customerRequests', requestId, patch)
    return row
  },

  formatWhen(date, time) {
    if (!date) return '—'
    const p = Utils.parseJalali(date)
    const day = p ? `${Utils.jalaliMonthName(p.jm)} ${p.jd.toLocaleString('fa-IR')}` : date
    return time ? `${day} — ${time}` : day
  },

  groupByCouple(requests) {
    const map = new Map()
    ;(requests || []).forEach(r => {
      const key = r.contractId || r.customerName || r.id
      if (!map.has(key)) {
        const contract = r.contractId ? DB.find('contracts', c => c.id === r.contractId) : null
        const couple = (r.customerName || contract?.couple || `${contract?.bride || ''} و ${contract?.groom || ''}`).trim()
        map.set(key, {
          key,
          contractId: r.contractId,
          contractNum: r.contractNum || contract?.contractNum || contract?.id,
          couple: couple || '—',
          eventDate: contract?.eventDate || contract?.date,
          phone: r.customerPhone || contract?.phoneGroom || contract?.phoneBride,
          requests: []
        })
      }
      map.get(key).requests.push(r)
    })
    const groups = [...map.values()]
    groups.forEach(g => {
      g.requests.sort((a, b) =>
        String(b.lastActivityAt || b.createdAt || '').localeCompare(String(a.lastActivityAt || a.createdAt || ''))
      )
      g.pending = g.requests.filter(x => x.status === 'pending').length
      g.latest = g.requests[0]
    })
    groups.sort((a, b) => {
      const la = a.latest?.lastActivityAt || a.latest?.createdAt || ''
      const lb = b.latest?.lastActivityAt || b.latest?.createdAt || ''
      return String(lb).localeCompare(String(la))
    })
    return groups
  }
}

window.InboxShared = InboxShared
