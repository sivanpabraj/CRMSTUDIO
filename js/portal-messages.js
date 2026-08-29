/* ══════════════════════════════════════════════
   Studio M — Role-scoped Customer Messages (Staff)
   ══════════════════════════════════════════════ */

const PortalMessages = {
  unreadCount(user) {
    return this._visible(user).filter(r => !r.readByStaff).length
  },

  _visible(user) {
    if (typeof Access === 'undefined') return []
    return Access.filterVisibleRequests(user).slice().reverse()
  },

  render(user, personnel) {
    const el = document.getElementById('portal-content')
    if (!el) return
    const items = this._visible(user)
    const groups = typeof InboxShared !== 'undefined' ? InboxShared.groupByCouple(items) : []

    el.innerHTML = `
      <div class="portal-section">
        <h2>💬 پیام‌های مشتری</h2>
        <p style="font-size:12px;color:rgba(255,255,255,0.45);margin:0 0 16px;line-height:1.7">
          درخواست‌های مربوط به پروژه و نقش شما — زوج‌به‌زوج. مدیر همه را در صندوق مشتری می‌بیند.
        </p>
        ${groups.length ? groups.map(g => this._coupleBlock(g, user, personnel)).join('') : `
          <div class="empty-state"><i class="fas fa-inbox"></i><p>پیامی برای نقش شما ثبت نشده</p></div>`}
      </div>`
  },

  _coupleBlock(g, user, personnel) {
    return `<div class="portal-inbox-couple">
      <div class="portal-inbox-couple-head">
        <strong>${Utils.escapeHtml(g.couple)}</strong>
        <span>قرارداد ${Utils.escapeHtml(g.contractNum || '—')}</span>
      </div>
      ${g.requests.map(r => this._card(r, user, personnel)).join('')}
    </div>`
  },

  _card(req, user, _personnel) {
    const type = InboxShared?.typeInfo?.(req.type) || PortalShared.REQUEST_TYPES[req.type] || { icon: '📝', label: 'درخواست' }
    const st = InboxShared?.statusInfo?.(req.status) || { label: req.status, badge: 'muted' }
    const thread = typeof InboxShared !== 'undefined' ? InboxShared.ensureThread(req) : [{ author: 'customer', text: req.text, date: req.createdAt, time: req.createdTime }]
    const canAct = typeof Access !== 'undefined' && Access.canViewCustomerRequest(user, req)

    return `
      <div class="invite-card portal-inbox-card" style="margin-bottom:12px;${req.readByStaff ? 'opacity:.85' : ''}">
        <div class="project-card-title">${type.icon} ${Utils.escapeHtml(type.label)}</div>
        <div class="project-card-meta">
          <span>${Utils.escapeHtml(InboxShared?.formatWhen?.(req.createdAt, req.createdTime) || req.createdAt || '')}</span>
          <span>${Utils.escapeHtml(st.label)}</span>
        </div>
        <div class="portal-inbox-thread">
          ${thread.map(t => `
            <div class="portal-inbox-msg portal-inbox-msg--${t.author || 'customer'}">
              <div class="portal-inbox-msg-head">
                <strong>${Utils.escapeHtml(t.authorName || InboxShared?.AUTHOR_LABELS?.[t.author] || t.author)}</strong>
                <span>${Utils.escapeHtml(InboxShared?.formatWhen?.(t.date, t.time) || '')}</span>
              </div>
              <p>${Utils.escapeHtml(t.text || '')}</p>
              ${t.author === 'staff' ? `<span class="portal-inbox-receipt"><i class="fas fa-check-double"></i> ${t.readBy?.includes('customer') ? 'خوانده‌شده توسط مشتری' : 'ارسال‌شده'}</span>` : ''}
            </div>`).join('')}
        </div>
        ${canAct ? `<div class="actions" style="margin-top:10px">
          ${!req.readByStaff ? `<button class="accept" data-csp-action="PortalMessages.markRead" data-csp-arg="${Utils.escapeHtml(req.id)}">✓ مشاهده شد</button>` : ''}
          <button class="reject" data-csp-action="PortalMessages.reply" data-csp-arg="${Utils.escapeHtml(req.id)}">پاسخ پرسنل</button>
        </div>` : ''}
      </div>`
  },

  async markRead(id) {
    const user = Auth.getUser()
    const personnel = DB.findPersonnelByUserId(user?.id) || DB.findPersonnelByPhone(user?.phone)
    const req = DB.find('customerRequests', r => r.id === id)
    if (!req || !Access.canViewCustomerRequest(user, req)) {
      Utils.toast('دسترسی ندارید', 'error')
      return
    }
    await SecureDB.update('customerRequests', id, { readByStaff: true, readByStaffAt: new Date().toISOString() })
    InboxShared?.markRead?.(id, 'staff')
    if (typeof InboxShared !== 'undefined') {
      InboxShared.appendThread(id, {
        author: 'staff',
        authorName: personnel?.name || user?.name || 'پرسنل',
        text: 'درخواست مشاهده شد.',
        action: 'staff_read',
        readByStaff: true
      })
    }
    Utils.toast('ثبت شد — مدیر در صندوق مشتری می‌بیند', 'success')
    Portal.showSection('messages')
  },

  async reply(id) {
    const user = Auth.getUser()
    const personnel = DB.findPersonnelByUserId(user?.id) || DB.findPersonnelByPhone(user?.phone)
    const req = DB.find('customerRequests', r => r.id === id)
    if (!req || !Access.canViewCustomerRequest(user, req)) {
      Utils.toast('دسترسی ندارید', 'error')
      return
    }
    const text = prompt('پاسخ شما برای مشتری (مدیر هم می‌بیند):')
    if (!text?.trim()) return
    if (typeof InboxShared !== 'undefined') {
      InboxShared.appendThread(id, {
        author: 'staff',
        authorName: personnel?.name || user?.name || 'پرسنل',
        text: text.trim(),
        action: 'reply',
        readByStaff: true
      })
    }
    await SecureDB.update('customerRequests', id, { readByStaff: true })
    Utils.toast('پاسخ ثبت شد', 'success')
    Portal.showSection('messages')
  }
}

window.PortalMessages = PortalMessages
