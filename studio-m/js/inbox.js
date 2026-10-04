/* ═════════════════════════════════════════════════════════════════
   Studio M — صندوق پیام و تبادل اطلاعات (مدیر و ادمین)
   پشتیبانی از تیک‌های دوگانه، کارت اطلاعات قرارداد و اعلان صوتی
   ═════════════════════════════════════════════════════════════════ */

const SMInbox = {
  _tab: 'all',

  setTab(tab) {
    this._tab = tab
    SM.navigate('inbox')
  },

  _requests(user) {
    let list = typeof Access !== 'undefined'
      ? Access.filterVisibleRequests(user)
      : (DB.get('customerRequests') || [])
    if (this._tab === 'pending') list = list.filter(r => r.status === 'pending')
    else if (this._tab === 'done') list = list.filter(r => r.status === 'sent_to_editing')
    else if (this._tab === 'rejected') list = list.filter(r => r.status === 'rejected')

    const q = SM.getModuleSearch('inbox')
    if (q) {
      list = list.filter(r =>
        [r.customerName, r.text, r.contractNum, r.type, r.createdAt, r.createdTime].join(' ').toLowerCase().includes(q)
      )
    }
    return list
  },

  render(el) {
    if (SM.state.viewStack.length) return
    const user = SM.user()
    const all = typeof Access !== 'undefined' ? Access.filterVisibleRequests(user) : (DB.get('customerRequests') || [])
    const reqs = this._requests(user)
    const groups = typeof InboxShared !== 'undefined' ? InboxShared.groupByCouple(reqs) : []
    const pending = all.filter(r => r.status === 'pending').length

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        ${SMUI.sectionHead('صندوق پیام و ارتباطات', 'تبادل پیام و اطلاعات قرارداد بین مشتری، پرسنل و مدیر', pending ? SMUI.badge(`${pending} منتظر`, 'warning') : '')}
        <div style="display:flex;align-items:center;gap:6px">
          ${typeof AudioNotifier !== 'undefined' ? AudioNotifier.renderToggleButton('sm-btn sm-btn-ghost sm-btn-sm') : ''}
        </div>
      </div>
      ${SMUI.statCards([
        { label: 'کل گفتگوها', value: SM.fmt(all.length), color: 'var(--sm-accent)' },
        { label: 'منتظر پاسخ مدیر', value: SM.fmt(pending), color: 'var(--sm-warning)' },
        { label: 'زوج / قرارداد', value: SM.fmt(InboxShared.groupByCouple(all).length), color: 'var(--sm-info)' },
        { label: 'تأییدشده و فعال', value: SM.fmt(all.filter(r => r.status === 'sent_to_editing').length), color: 'var(--sm-success)' }
      ])}
      ${SMUI.tabs([
        { id: 'all', fa: 'همه پیام‌ها', en: 'All', icon: 'fa-inbox', onclick: "SMInbox.setTab('all')" },
        { id: 'pending', fa: 'منتظر تأیید', en: 'Pending', icon: 'fa-clock', onclick: "SMInbox.setTab('pending')" },
        { id: 'done', fa: 'تأییدشده', en: 'Approved', icon: 'fa-check', onclick: "SMInbox.setTab('done')" },
        { id: 'rejected', fa: 'رد شده', en: 'Rejected', icon: 'fa-times', onclick: "SMInbox.setTab('rejected')" }
      ], this._tab)}
      ${SMUI.moduleSearch('inbox', 'جستجو — نام زوج، قرارداد، متن...')}
      <div style="margin-top:16px">${groups.length ? groups.map(g => this._coupleCard(g)).join('') :
        SMUI.empty('fa-inbox', 'پیامی وجود ندارد', 'مشتری و پرسنل از پورتال خود پیام می‌دهند — پیام‌ها با تیک دوگانه و نوتیفیکیشن صوتی اینجا نمایش داده می‌شوند')}</div>`
  },

  _coupleCard(g) {
    const latest = g.latest
    const st = InboxShared.statusInfo(latest?.status)
    const type = InboxShared.typeInfo(latest?.type)
    const when = InboxShared.formatWhen(latest?.createdAt, latest?.createdTime)

    return `<div class="sm-inbox-couple" onclick="SMInbox.viewCouple('${g.contractId || g.key}')">
      <div class="sm-inbox-couple-head">
        <div>
          <div class="sm-inbox-couple-name">${SM.esc(g.couple)}</div>
          <div class="sm-inbox-couple-meta">
            <span>قرارداد ${SM.esc(g.contractNum || '—')}</span>
            ${g.eventDate ? `<span>مراسم ${SM.esc(g.eventDate)}</span>` : ''}
            ${g.phone ? `<span dir="ltr">${SM.esc(g.phone)}</span>` : ''}
          </div>
        </div>
        <div class="sm-inbox-couple-side">
          ${g.pending ? SMUI.badge(`${g.pending} جدید`, 'warning') : ''}
          ${SMUI.badge(`${g.requests.length} پیام`, 'info')}
        </div>
      </div>
      <div class="sm-inbox-couple-preview">
        <span class="sm-inbox-type">${type.icon} ${SM.esc(type.label)}</span>
        ${SMUI.badge(st.label, st.badge)}
        <p>${SM.esc((latest?.text || '').slice(0, 120))}${(latest?.text || '').length > 120 ? '…' : ''}</p>
        <div class="sm-inbox-when"><i class="fas fa-clock"></i> ${SM.esc(when)}</div>
      </div>
    </div>`
  },

  viewCouple(contractKey) {
    const user = SM.user()
    const reqs = this._requests(user).filter(r => (r.contractId || r.customerName) === contractKey || r.contractId === contractKey)
    if (!reqs.length) {
      const all = (typeof Access !== 'undefined' ? Access.filterVisibleRequests(user) : DB.get('customerRequests'))
        .filter(r => r.contractId === contractKey || r.customerName === contractKey)
      if (!all.length) return
      reqs.push(...all)
    }
    const g = InboxShared.groupByCouple(reqs)[0]
    if (!g) return

    // علامت‌گذاری خودکار پیام‌ها به عنوان خوانده شده توسط مدیر (جهت فعال‌سازی تیک دوگانه برای مشتری و پرسنل)
    reqs.forEach(r => {
      InboxShared.markThreadRead(r.id, 'manager')
    })

    SM.pushSubView(g.couple, () => `
      <div class="sm-inbox-detail-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:10px">
        <div>
          <h2 style="margin:0 0 4px 0">${SM.esc(g.couple)}</h2>
          <p style="margin:0;color:var(--sm-text-muted);font-size:12px">قرارداد ${SM.esc(g.contractNum || '—')}${g.eventDate ? ` · تاریخ مراسم: ${SM.esc(g.eventDate)}` : ''}</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${typeof AudioNotifier !== 'undefined' ? AudioNotifier.renderToggleButton('sm-btn sm-btn-ghost sm-btn-sm') : ''}
          ${g.contractId ? `<button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMInbox.sendContractInfoToCouple('${g.contractId}')"><i class="fas fa-file-contract"></i> ارسال کارت قرارداد به گفتگو</button>` : ''}
        </div>
      </div>
      ${g.requests.map(r => this._requestBlock(r)).join('')}`)
  },

  _requestBlock(r) {
    const type = InboxShared.typeInfo(r.type)
    const st = InboxShared.statusInfo(r.status)
    const thread = InboxShared.ensureThread(r)
    const canManage = SM.can('view_all')

    return `<div class="sm-inbox-request" style="margin-bottom:18px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px">
      <div class="sm-inbox-request-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px">
          <span>${type.icon} ${SM.esc(type.label)}</span>
          ${SMUI.badge(st.label, st.badge)}
        </div>
        <span class="sm-inbox-when" style="font-size:11px;color:var(--sm-text-muted)">${SM.esc(InboxShared.formatWhen(r.createdAt, r.createdTime))}</span>
      </div>
      <div class="sm-inbox-thread">
        ${thread.map(t => this._threadLine(t)).join('')}
      </div>

      <!-- نوار پاسخ سریع مدیر و ارسال اطلاعات قرارداد -->
      <div class="sm-inbox-quick-reply" style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06)">
        <div style="display:flex;gap:8px;align-items:flex-end">
          <textarea id="reply-text-${r.id}" class="sm-input" rows="2" placeholder="پاسخ مستقیم مدیر (برای مشتری و پرسنل ارسال می‌شود)..." style="flex:1;resize:none;font-size:12.5px;padding:8px 10px;background:rgba(0,0,0,0.3)"></textarea>
          <div style="display:flex;flex-direction:column;gap:4px">
            <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMInbox.sendInlineReply('${r.id}')" style="min-width:90px">
              <i class="fas fa-paper-plane"></i> ارسال
            </button>
            <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMInbox.sendContractCardDirect('${r.id}')" title="ارسال کارت وضعیت قرارداد به مشتری و پرسنل" style="font-size:11px">
              <i class="fas fa-file-invoice"></i> کارت قرارداد
            </button>
          </div>
        </div>
      </div>

      ${canManage && r.status === 'pending' ? `<div class="sm-inbox-actions" style="margin-top:10px;display:flex;gap:6px">
        <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" onclick="SMInbox.approve('${r.id}')"><i class="fas fa-check"></i> تأیید → ارجاع به تدوین</button>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" onclick="SMInbox.reject('${r.id}')"><i class="fas fa-times"></i> رد درخواست</button>
      </div>` : ''}
    </div>`
  },

  _threadLine(t) {
    const author = InboxShared.AUTHOR_LABELS[t.author] || t.author
    const cls = t.author || 'customer'
    const actionNote = t.action === 'approve' ? ' · تأیید'
      : t.action === 'reject' ? ' · رد'
      : t.action === 'staff_read' ? ' · مشاهده پرسنل' : ''

    const ticks = InboxShared.renderTicks(t, 'manager')
    const contractCard = t.contractInfo ? InboxShared.renderContractCard(t.contractInfo) : ''

    return `<div class="sm-inbox-msg sm-inbox-msg--${cls}" style="margin-bottom:8px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,0.04);border-inline-start:3px solid ${cls === 'customer' ? '#38bdf8' : cls === 'staff' ? '#4ade80' : '#f59e0b'}">
      <div class="sm-inbox-msg-head" style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:4px">
        <strong>${SM.esc(t.authorName || author)}</strong>
        <div style="display:flex;align-items:center;gap:4px">
          <span>${SM.esc(InboxShared.formatWhen(t.date, t.time))}${actionNote}</span>
          ${ticks}
        </div>
      </div>
      ${t.text ? `<p style="margin:0;font-size:12.5px;color:rgba(255,255,255,0.85);line-height:1.6">${SM.esc(t.text)}</p>` : ''}
      ${contractCard}
    </div>`
  },

  sendInlineReply(id) {
    const input = document.getElementById(`reply-text-${id}`)
    const text = input?.value?.trim()
    if (!text) return SM.toast('متن پاسخ را وارد کنید', 'error')

    const user = SM.user()
    InboxShared.appendThread(id, {
      author: 'manager',
      authorName: user?.name || 'مدیریت استودیو',
      authorRole: 'مدیر استودیو',
      text,
      action: 'reply'
    })

    input.value = ''
    SM.toast('پاسخ ارسال شد و برای طرفین ثبت گردید', 'success')
    this._refreshView(id)
  },

  sendContractCardDirect(requestId) {
    const req = DB.find('customerRequests', r => r.id === requestId)
    if (!req) return
    const contract = req.contractId ? DB.find('contracts', c => c.id === req.contractId) : null
    if (!contract) return SM.toast('قراردادی برای این درخواست یافت نشد', 'error')

    const snippet = InboxShared.buildContractSnippet(contract)
    const user = SM.user()

    InboxShared.appendThread(requestId, {
      author: 'manager',
      authorName: user?.name || 'مدیریت استودیو',
      authorRole: 'مدیر استودیو',
      text: `خلاصه اطلاعات و وضعیت اجرای قرارداد شماره ${snippet.contractNum} جهت بررسی طرفین ضمیمه شد.`,
      action: 'contract_share',
      contractInfo: snippet
    })

    SM.toast('کارت اطلاعات قرارداد با موفقیت در گفتگو ارسال شد', 'success')
    this._refreshView(requestId)
  },

  sendContractInfoToCouple(contractId) {
    const contract = DB.find('contracts', c => c.id === contractId)
    if (!contract) return SM.toast('قرارداد یافت نشد', 'error')

    // یافتن یا ایجاد یک گفتگو برای این زوج
    let req = DB.find('customerRequests', r => r.contractId === contractId)
    if (!req) {
      const parts = InboxShared.nowParts()
      const couple = contract.couple || `${contract.bride || ''} و ${contract.groom || ''}`.trim()
      req = DB.insert('customerRequests', {
        contractId: contract.id,
        contractNum: contract.contractNum || contract.id,
        type: 'contract_info',
        text: 'ارسال اطلاعات رسمی قرارداد استودیو',
        status: 'open',
        read: true,
        readByStaff: false,
        readByCustomer: false,
        customerName: couple,
        customerPhone: contract.groomPhone || contract.bridePhone || '',
        createdAt: parts.date,
        createdTime: parts.time,
        lastActivityAt: parts.iso,
        thread: []
      })
    }

    const snippet = InboxShared.buildContractSnippet(contract)
    const user = SM.user()
    InboxShared.appendThread(req.id, {
      author: 'manager',
      authorName: user?.name || 'مدیریت استودیو',
      authorRole: 'مدیر استودیو',
      text: `اطلاعات رسمی قرارداد شماره ${snippet.contractNum} جهت دسترسی زوج و تیم استودیو ارسال گردید.`,
      action: 'contract_share',
      contractInfo: snippet
    })

    SM.toast('اطلاعات قرارداد به گفتگو اضافه شد', 'success')
    this._refreshView(req.id)
  },

  approve(id) {
    const req = DB.find('customerRequests', r => r.id === id)
    if (!req) return
    const user = SM.user()
    const contract = DB.find('contracts', c => c.id === req.contractId)
    const typeLabel = InboxShared.typeInfo(req.type).label
    const dest = ['photo_select', 'album', 'print'].includes(req.type) ? 'عکس‌خانه' : 'تدوین'

    InboxShared.appendThread(id, {
      author: 'manager',
      authorName: user?.name || 'مدیر',
      text: `درخواست با موفقیت تأیید شد — ارجاع به واحد ${dest}`,
      action: 'approve',
      status: 'sent_to_editing',
      read: true
    })
    DB.update('customerRequests', id, { approvedAt: Utils.todayJalali(), approvedBy: user?.name || '' })

    if (['photo_select', 'album', 'print'].includes(req.type) && typeof PhotoHouse !== 'undefined') {
      if (req.type === 'photo_select') {
        PhotoHouse.upsertPhotoSelection({
          contractId: req.contractId,
          contractNum: req.contractNum,
          couple: req.customerName || '',
          maxPhotos: 50,
          notes: req.text
        })
      }
    } else {
      DB.insert('tasks', {
        title: `درخواست مشتری: ${typeLabel}`,
        text: req.text,
        contractId: req.contractId,
        status: 'pending',
        createdAt: Utils.todayJalali()
      })
    }
    if (typeof NotifyHub !== 'undefined') NotifyHub.customerRequestApproved(req, contract)
    SM.toast('تأیید و ارجاع شد', 'success')
    this._refreshView(id)
  },

  reject(id) {
    const user = SM.user()
    InboxShared.appendThread(id, {
      author: 'manager',
      authorName: user?.name || 'مدیر',
      text: 'درخواست پس از بررسی توسط مدیریت پذیرفته نشد.',
      action: 'reject',
      status: 'rejected',
      read: true
    })
    DB.update('customerRequests', id, { rejectedAt: Utils.todayJalali() })
    SM.toast('رد شد', 'info')
    this._refreshView(id)
  },

  _refreshView(requestId) {
    const req = DB.find('customerRequests', r => r.id === requestId)
    const key = req?.contractId || req?.customerName
    if (SM.state.viewStack.length && key) {
      SM.state.viewStack.pop()
      this.viewCouple(key)
    } else SM.navigate('inbox')
  }
}

SMModules.inbox = {
  setTab(tab) { SMInbox.setTab(tab) },
  render(el) { SMInbox.render(el) },
  approve(id) { SMInbox.approve(id) },
  reject(id) { SMInbox.reject(id) }
}

window.SMInbox = SMInbox
