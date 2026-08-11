/* Studio M — صندوق مشتری (مدیر): زوج‌به‌زوج · تاریخ · گفتگو */

const SMInbox = {
  _tab: 'all',

  setTab(tab) {
    this._tab = tab
    SM.navigate('inbox')
  },

  _requests(user) {
    let list = typeof Access !== 'undefined'
      ? Access.filterVisibleRequests(user)
      : (DB.active('customerRequests') || [])
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
    const all = typeof Access !== 'undefined' ? Access.filterVisibleRequests(user) : (DB.active('customerRequests') || [])
    const reqs = this._requests(user)
    const groups = typeof InboxShared !== 'undefined' ? InboxShared.groupByCouple(reqs) : []
    const pending = all.filter(r => r.status === 'pending').length

    el.innerHTML = `
      ${SMUI.sectionHead('صندوق مشتری', 'درخواست‌ها زوج‌به‌زوج — مشتری، مدیر و پرسنل', pending ? SMUI.badge(`${pending} منتظر`, 'warning') : '')}
      ${SMUI.statCards([
        { label: 'کل گفتگو', value: SM.fmt(all.length), color: 'var(--sm-accent)' },
        { label: 'منتظر مدیر', value: SM.fmt(pending), color: 'var(--sm-warning)' },
        { label: 'زوج / قرارداد', value: SM.fmt(InboxShared.groupByCouple(all).length), color: 'var(--sm-info)' },
        { label: 'تأیید‌شده', value: SM.fmt(all.filter(r => r.status === 'sent_to_editing').length), color: 'var(--sm-success)' }
      ])}
      ${SMUI.tabs([
        { id: 'all', fa: 'همه', en: 'All', icon: 'fa-inbox', fn: 'SMInbox.setTab', args: ['all'] },
        { id: 'pending', fa: 'منتظر تأیید', en: 'Pending', icon: 'fa-clock', fn: 'SMInbox.setTab', args: ['pending'] },
        { id: 'done', fa: 'تأییدشده', en: 'Approved', icon: 'fa-check', fn: 'SMInbox.setTab', args: ['done'] },
        { id: 'rejected', fa: 'رد شده', en: 'Rejected', icon: 'fa-times', fn: 'SMInbox.setTab', args: ['rejected'] }
      ], this._tab)}
      ${SMUI.moduleSearch('inbox', 'جستجو — نام زوج، قرارداد، متن...')}
      <div style="margin-top:16px">${groups.length ? groups.map(g => this._coupleCard(g)).join('') :
        SMUI.empty('fa-inbox', 'درخواستی نیست', 'مشتری از پورتال درخواست می‌دهد — اینجا برای مدیر نمایش داده می‌شود')}</div>`
  },

  _coupleCard(g) {
    const latest = g.latest
    const st = InboxShared.statusInfo(latest?.status)
    const type = InboxShared.typeInfo(latest?.type)
    const when = InboxShared.formatWhen(latest?.createdAt, latest?.createdTime)

    return `<div class="sm-inbox-couple" ${SMEvents.attrs('SMInbox.viewCouple', [g.contractId || g.key])}>
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
          ${SMUI.badge(`${g.requests.length} درخواست`, 'info')}
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
      const all = (typeof Access !== 'undefined' ? Access.filterVisibleRequests(user) : DB.active('customerRequests'))
        .filter(r => r.contractId === contractKey || r.customerName === contractKey)
      if (!all.length) return
      reqs.push(...all)
    }
    const g = InboxShared.groupByCouple(reqs)[0]
    if (!g) return

    SM.pushSubView(g.couple, () => `
      <div class="sm-inbox-detail-head">
        <div>
          <h2>${SM.esc(g.couple)}</h2>
          <p>قرارداد ${SM.esc(g.contractNum || '—')}${g.eventDate ? ` · مراسم ${SM.esc(g.eventDate)}` : ''}</p>
        </div>
      </div>
      ${g.requests.map(r => this._requestBlock(r)).join('')}`)
  },

  _requestBlock(r) {
    InboxShared.markRead(r.id, 'manager')
    r = DB.find('customerRequests', row => row.id === r.id) || r
    const type = InboxShared.typeInfo(r.type)
    const st = InboxShared.statusInfo(r.status)
    const thread = InboxShared.ensureThread(r)
    const canManage = SM.can('view_all')

    return `<div class="sm-inbox-request">
      <div class="sm-inbox-request-head">
        <span>${type.icon} ${SM.esc(type.label)}</span>
        ${SMUI.badge(st.label, st.badge)}
        <span class="sm-inbox-when">${SM.esc(InboxShared.formatWhen(r.createdAt, r.createdTime))}</span>
      </div>
      <div class="sm-inbox-thread">
        ${thread.map(t => this._threadLine(t)).join('')}
      </div>
      ${canManage ? `<div class="sm-inbox-actions">
        ${r.status === 'pending' ? `
          <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" ${SMEvents.attrs('SMInbox.approve', [r.id])}>تأیید → تدوین</button>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMInbox.reject', [r.id])}>رد</button>` : ''}
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMInbox.reply', [r.id])}><i class="fas fa-reply"></i> پاسخ مدیر</button>
      </div>` : ''}
    </div>`
  },

  _threadLine(t) {
    const author = InboxShared.AUTHOR_LABELS[t.author] || t.author
    const cls = t.author || 'customer'
    const actionNote = t.action === 'approve' ? ' · تأیید'
      : t.action === 'reject' ? ' · رد'
      : t.action === 'staff_read' ? ' · مشاهده پرسنل' : ''
    const receipt = ['manager', 'staff'].includes(t.author)
      ? `<span class="sm-inbox-receipt"><i class="fas fa-check-double"></i> ${t.readBy?.includes('customer') ? 'خوانده‌شده توسط مشتری' : 'ارسال‌شده'}</span>`
      : ''
    return `<div class="sm-inbox-msg sm-inbox-msg--${cls}">
      <div class="sm-inbox-msg-head">
        <strong>${SM.esc(t.authorName || author)}</strong>
        <span>${SM.esc(InboxShared.formatWhen(t.date, t.time))}${actionNote}</span>
      </div>
      <p>${SM.esc(t.text || '')}</p>
      ${receipt}
    </div>`
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
      text: `تأیید شد — ارجاع به ${dest}`,
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
      text: 'درخواست رد شد.',
      action: 'reject',
      status: 'rejected',
      read: true
    })
    DB.update('customerRequests', id, { rejectedAt: Utils.todayJalali() })
    SM.toast('رد شد', 'info')
    this._refreshView(id)
  },

  reply(id) {
    const req = DB.find('customerRequests', r => r.id === id)
    if (!req) return
    SMUI.modal('پاسخ مدیر به مشتری', `
      ${SMUI.formField('پیام', 'inbox-reply', { type: 'textarea', placeholder: 'پاسخ یا توضیح برای مشتری و پرسنل...' })}`, {
      width: 480,
      onSave: () => {
        const text = document.getElementById('inbox-reply')?.value?.trim()
        if (!text) return SM.toast('متن پاسخ را بنویسید', 'error')
        const user = SM.user()
        InboxShared.appendThread(id, {
          author: 'manager',
          authorName: user?.name || 'مدیر',
          text,
          action: 'reply'
        })
        SMUI.closeModal()
        SM.toast('پاسخ ثبت شد', 'success')
        this._refreshView(id)
      }
    })
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
