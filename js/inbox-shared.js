/* ═════════════════════════════════════════════════════════════════
   Mandani Studio — صندوق پیام، گفتگو و تبادل اطلاعات قرارداد
   پشتیبانی از تیک‌های دوگانه (✓✓)، ارسال اطلاعات قرارداد و اعلان صوتی
   ═════════════════════════════════════════════════════════════════ */

const InboxShared = {
  AUTHOR_LABELS: {
    customer: 'مشتری (عروس و داماد)',
    manager: 'مدیریت استودیو',
    staff: 'پرسنل / همکار',
    admin: 'مدیر ارشد سیستم',
    system: 'سیستم هوشمند'
  },

  STATUS: {
    pending: { label: 'منتظر تأیید مدیر', badge: 'warning' },
    sent_to_editing: { label: 'تأیید — در تدوین / عکس‌خانه', badge: 'success' },
    rejected: { label: 'رد شده', badge: 'danger' },
    open: { label: 'باز و در جریان', badge: 'info' }
  },

  nowParts() {
    const d = new Date()
    return {
      date: typeof Utils !== 'undefined' ? Utils.todayJalali() : new Date().toLocaleDateString('fa-IR'),
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      iso: d.toISOString()
    }
  },

  typeInfo(type) {
    return (typeof PortalShared !== 'undefined' && PortalShared.REQUEST_TYPES?.[type])
      || { icon: '📝', label: type || 'پیام / درخواست' }
  },

  statusInfo(status) {
    return this.STATUS[status] || { label: status || '—', badge: 'muted' }
  },

  /**
   * فرمت کردن اطلاعات قرارداد به عنوان کارت خلاصه جهت ارسال در چت
   */
  buildContractSnippet(contract) {
    if (!contract) return null
    const cId = contract.id || ''
    const cNum = contract.contractNum || cId
    const couple = contract.couple || `${contract.bride || ''} و ${contract.groom || ''}`.trim() || 'زوج گرامی'
    const eventDate = contract.eventDate || contract.date || '—'
    const totalAmount = Number(contract.finalAmount || contract.totalAmount || contract.total || 0)
    const deposit = Number(contract.deposit || 0)

    // محاسبه تراکنش‌های ثبت شده
    const txList = (typeof DB !== 'undefined' && DB.get ? DB.get('transactions') : []).filter(t => t.contractId === cId)
    const txTotal = txList.reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
    const hasDepositInTx = txList.some(t => t.purposeCategory === 'contract_deposit' || String(t.purpose || t.desc || '').includes('بیعانه'))
    const totalPaid = hasDepositInTx ? txTotal : (deposit + txTotal)
    const remaining = Math.max(0, totalAmount - totalPaid)
    const stage = contract.stage || 'recording'
    const stageLabel = (typeof PortalShared !== 'undefined' && PortalShared.PIPELINE_STAGES?.[stage]?.label) || 'در جریان اجرا'

    return {
      type: 'contract_info_card',
      contractId: cId,
      contractNum: String(cNum),
      couple,
      eventDate,
      venue: contract.venue || '',
      stage,
      stageLabel,
      totalAmount,
      totalPaid,
      remaining,
      services: Array.isArray(contract.items) ? contract.items.map(i => i.title || i.name).filter(Boolean).slice(0, 4) : []
    }
  },

  /**
   * رندر کارت اطلاعات قرارداد در داخل حباب گفتگو
   */
  renderContractCard(info) {
    if (!info) return ''
    const isPaid = (info.remaining || 0) <= 0
    const servicesText = Array.isArray(info.services) && info.services.length 
      ? info.services.join(' · ') 
      : 'خدمات تصویربرداری و عکاسی حرفه‌ای'

    return `
      <div class="chat-contract-card" style="margin:8px 0;padding:12px 14px;border-radius:14px;background:linear-gradient(135deg,rgba(245,158,11,0.08) 0%,rgba(15,15,20,0.85) 100%);border:1px solid rgba(245,158,11,0.3);box-shadow:0 4px 16px rgba(0,0,0,0.3)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:6px">
          <div style="font-weight:700;color:#f59e0b;font-size:12.5px;display:flex;align-items:center;gap:6px">
            <i class="fas fa-file-contract"></i>
            <span>خلاصه اطلاعات قرارداد #${typeof Utils !== 'undefined' ? Utils.escapeHtml(info.contractNum) : info.contractNum}</span>
          </div>
          <span style="font-size:11px;padding:2px 8px;border-radius:6px;background:${isPaid ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)'};color:${isPaid ? '#4ade80' : '#fbbf24'};font-weight:600">
            ${isPaid ? '✓ تسویه کامل' : '⏳ دارای مانده'}
          </span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px 12px;font-size:11.5px;color:rgba(255,255,255,0.85);margin-bottom:8px">
          <div><span style="opacity:0.6">زوج:</span> <strong>${typeof Utils !== 'undefined' ? Utils.escapeHtml(info.couple) : info.couple}</strong></div>
          <div><span style="opacity:0.6">تاریخ مراسم:</span> <strong dir="ltr">${typeof Utils !== 'undefined' ? Utils.escapeHtml(info.eventDate) : info.eventDate}</strong></div>
          <div><span style="opacity:0.6">مرحله:</span> <span style="color:#60a5fa">${typeof Utils !== 'undefined' ? Utils.escapeHtml(info.stageLabel) : info.stageLabel}</span></div>
          <div><span style="opacity:0.6">مانده حساب:</span> <strong style="color:${isPaid ? '#4ade80' : '#f87171'}">${typeof Utils !== 'undefined' ? Utils.fmtNum(info.remaining) : info.remaining} تومان</strong></div>
        </div>
        <div style="font-size:11px;color:rgba(255,255,255,0.6);border-top:1px dashed rgba(255,255,255,0.08);padding-top:6px;display:flex;justify-content:space-between;align-items:center">
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80%"><i class="fas fa-camera"></i> ${typeof Utils !== 'undefined' ? Utils.escapeHtml(servicesText) : servicesText}</span>
          <span style="font-size:10px;opacity:0.5">سیستم یکپارچه استودیو</span>
        </div>
      </div>`
  },

  /**
   * رندر تیک‌های دونفره شبیه واتساپ/تلگرام (✓ و ✓✓)
   * @param {Object} entry - رکورد پیام در ترد
   * @param {string} viewerRole - نقش بیننده جاری: 'customer' | 'staff' | 'manager' | 'admin'
   */
  renderTicks(entry, viewerRole) {
    if (!entry) return ''
    const isSender = (entry.author === viewerRole) || 
      (viewerRole === 'admin' && entry.author === 'manager') ||
      (viewerRole === 'manager' && entry.author === 'admin')

    // فقط فرستنده تیک وضعیت ارسال خود را می‌بیند
    if (!isSender) return ''

    // بررسی اینکه آیا طرف مقابل پیام را خوانده است
    let isRead = false
    const readBy = entry.readBy || {}

    if (entry.author === 'customer') {
      // پیام مشتری را مدیر یا پرسنل خوانده باشد
      isRead = Boolean(readBy.manager || readBy.staff || readBy.admin || entry.readByStaff || entry.read)
    } else {
      // پیام مدیر یا پرسنل را مشتری (یا همکار) خوانده باشد
      isRead = Boolean(readBy.customer || (entry.targetRole === 'staff' && readBy.staff))
    }

    if (isRead) {
      // تیک دوگانه فعال (خوانده شد - رنگ فیروزه‌ای / سبز واتساپ)
      return `<span class="chat-tick chat-tick--read" title="خوانده شد توسط مخاطب (✓✓)" style="color:#38bdf8;font-size:11px;margin-inline-start:4px;display:inline-flex;align-items:center"><i class="fas fa-check-double"></i></span>`
    } else {
      // تیک دوگانه خاکستری (تحویل داده شده به سرور / دیتابیس)
      return `<span class="chat-tick chat-tick--delivered" title="تحویل داده شد (✓✓)" style="color:rgba(255,255,255,0.4);font-size:11px;margin-inline-start:4px;display:inline-flex;align-items:center"><i class="fas fa-check-double"></i></span>`
    }
  },

  ensureThread(req) {
    if (req.thread?.length) return req.thread
    const parts = this.nowParts()
    return [{
      id: 'orig',
      author: 'customer',
      authorName: req.customerName || 'مشتری',
      authorRole: 'مشتری',
      text: req.text || '',
      date: req.createdAt || parts.date,
      time: req.createdTime || parts.time,
      at: req.lastActivityAt || req.createdAt || parts.iso,
      action: 'request',
      status: 'delivered',
      readBy: {
        customer: true,
        manager: Boolean(req.read),
        staff: Boolean(req.readByStaff)
      }
    }]
  },

  /**
   * ثبت پیام جدید در ترد با صدا، تیک و وضعیت خوانده‌شدن
   */
  appendThread(requestId, entry) {
    const req = DB.find('customerRequests', r => r.id === requestId)
    if (!req) return null

    const parts = this.nowParts()
    const thread = [...(req.thread?.length ? req.thread : this.ensureThread(req))]

    const author = entry.author || 'manager'
    const readBy = {
      customer: author === 'customer',
      manager: author === 'manager' || author === 'admin',
      staff: author === 'staff',
      admin: author === 'admin'
    }

    const row = {
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: entry.date || parts.date,
      time: entry.time || parts.time,
      at: parts.iso,
      author,
      authorName: entry.authorName || this.AUTHOR_LABELS[author] || '',
      authorRole: entry.authorRole || this.AUTHOR_LABELS[author] || '',
      text: entry.text || '',
      action: entry.action || 'reply',
      status: 'delivered',
      readBy,
      contractInfo: entry.contractInfo || null
    }

    thread.push(row)

    const patch = { 
      thread, 
      lastActivityAt: parts.iso,
      read: author === 'manager' || author === 'admin', // برای مدیر خوانده‌شده محسوب می‌شود اگر خودش فرستاده باشد
      readByStaff: author === 'staff'
    }

    if (entry.status) patch.status = entry.status

    DB.update('customerRequests', requestId, patch)

    // پخش صدا متناسب با نوع پیام
    if (typeof AudioNotifier !== 'undefined') {
      if (entry.contractInfo) {
        AudioNotifier.playContract()
      } else {
        AudioNotifier.playSent()
      }
    }

    // ارسال فوری به سرور برای تحویل بلادرنگ
    if (typeof ServerSync !== 'undefined' && ServerSync.pushNow) {
      ServerSync.pushNow().catch(() => {})
    }

    return row
  },

  /**
   * نشانه‌گذاری تمام پیام‌های دریافت شده به عنوان «خوانده شد» توسط نقش فعلی
   */
  markThreadRead(requestId, viewerRole = 'manager') {
    const req = DB.find('customerRequests', r => r.id === requestId)
    if (!req) return false

    let changed = false
    const thread = this.ensureThread(req).map(t => {
      if (t.author !== viewerRole) {
        if (!t.readBy) t.readBy = {}
        if (!t.readBy[viewerRole]) {
          t.readBy[viewerRole] = true
          t.status = 'read'
          changed = true
        }
      }
      return t
    })

    const patch = { thread }
    if (viewerRole === 'manager' || viewerRole === 'admin') {
      if (!req.read) { patch.read = true; changed = true; }
    } else if (viewerRole === 'staff') {
      if (!req.readByStaff) { patch.readByStaff = true; changed = true; }
    } else if (viewerRole === 'customer') {
      if (!req.readByCustomer) { patch.readByCustomer = true; changed = true; }
    }

    if (changed) {
      DB.update('customerRequests', requestId, patch)
      if (typeof ServerSync !== 'undefined' && ServerSync.schedulePush) {
        ServerSync.schedulePush()
      }
    }

    return changed
  },

  formatWhen(date, time) {
    if (!date) return '—'
    if (typeof Utils === 'undefined') return time ? `${date} ${time}` : date
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

if (typeof window !== 'undefined') {
  window.InboxShared = InboxShared
}
