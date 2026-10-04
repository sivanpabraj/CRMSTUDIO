/* ═════════════════════════════════════════════════════════════════
   Studio M — پورتال پیام و تبادل اطلاعات پرسنل
   پشتیبانی از تیک‌های دوگانه (✓✓)، ارسال کارت قرارداد و اعلان صوتی
   ═════════════════════════════════════════════════════════════════ */

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

    // علامت‌گذاری خودکار پیام‌ها به عنوان مشاهده‌شده توسط پرسنل (فعال‌سازی تیک دوگانه برای مشتری و مدیر)
    items.forEach(req => {
      InboxShared.markThreadRead(req.id, 'staff')
    })

    el.innerHTML = `
      <div class="portal-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <h2 style="margin:0">💬 پیام‌ها و تبادل اطلاعات پروژه</h2>
          <div style="display:flex;align-items:center;gap:6px">
            ${typeof AudioNotifier !== 'undefined' ? AudioNotifier.renderToggleButton('portal-btn portal-btn-sm') : ''}
          </div>
        </div>
        <p style="font-size:12px;color:rgba(255,255,255,0.5);margin:0 0 16px;line-height:1.7">
          درخواست‌ها و پیام‌های پروژه‌های مرتبط با شما — گفتگو با عروس، داماد و مدیریت استودیو همراه با تیک دوگانه (✓✓).
        </p>
        ${groups.length ? groups.map(g => this._coupleBlock(g, user, personnel)).join('') : `
          <div class="empty-state"><i class="fas fa-inbox"></i><p>پیامی برای پروژه‌های شما ثبت نشده است</p></div>`}
      </div>`
  },

  _coupleBlock(g, user, personnel) {
    return `<div class="portal-inbox-couple" style="margin-bottom:16px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:14px">
      <div class="portal-inbox-couple-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:8px">
        <div>
          <strong style="font-size:14px;color:#fff">${Utils.escapeHtml(g.couple)}</strong>
          <span style="font-size:11px;color:rgba(255,255,255,0.5);margin-inline-start:8px">قرارداد ${Utils.escapeHtml(g.contractNum || '—')}</span>
        </div>
        ${g.contractId ? `
          <button type="button" class="portal-btn portal-btn-sm" onclick="PortalMessages.sendContractSnippet('${g.requests[0]?.id}', '${g.contractId}')" style="font-size:11px;background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3)">
            <i class="fas fa-file-contract"></i> ارسال کارت قرارداد
          </button>` : ''}
      </div>
      ${g.requests.map(r => this._card(r, user, personnel)).join('')}
    </div>`
  },

  _card(req, user, personnel) {
    const type = InboxShared?.typeInfo?.(req.type) || PortalShared.REQUEST_TYPES[req.type] || { icon: '📝', label: 'درخواست' }
    const st = InboxShared?.statusInfo?.(req.status) || { label: req.status, badge: 'muted' }
    const thread = typeof InboxShared !== 'undefined' ? InboxShared.ensureThread(req) : [{ author: 'customer', text: req.text, date: req.createdAt, time: req.createdTime }]
    const canAct = typeof Access !== 'undefined' && Access.canViewCustomerRequest(user, req)

    return `
      <div class="invite-card portal-inbox-card" style="margin-bottom:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div class="project-card-title" style="font-size:12.5px;font-weight:600;color:#fff">${type.icon} ${Utils.escapeHtml(type.label)}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4)">
            <span>${Utils.escapeHtml(InboxShared?.formatWhen?.(req.createdAt, req.createdTime) || req.createdAt || '')}</span>
            <span style="margin-inline-start:6px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.08)">${Utils.escapeHtml(st.label)}</span>
          </div>
        </div>

        <div class="portal-inbox-thread" style="display:flex;flex-direction:column;gap:8px;margin:10px 0">
          ${thread.map(t => {
            const author = t.authorName || InboxShared?.AUTHOR_LABELS?.[t.author] || t.author
            const cls = t.author || 'customer'
            const ticks = InboxShared.renderTicks(t, 'staff')
            const contractCard = t.contractInfo ? InboxShared.renderContractCard(t.contractInfo) : ''

            return `
              <div class="portal-inbox-msg portal-inbox-msg--${cls}" style="padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.04);border-inline-start:3px solid ${cls === 'customer' ? '#38bdf8' : cls === 'manager' ? '#f59e0b' : '#4ade80'}">
                <div class="portal-inbox-msg-head" style="display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:4px">
                  <strong>${Utils.escapeHtml(author)}</strong>
                  <div style="display:flex;align-items:center;gap:4px">
                    <span>${Utils.escapeHtml(InboxShared?.formatWhen?.(t.date, t.time) || '')}</span>
                    ${ticks}
                  </div>
                </div>
                ${t.text ? `<p style="margin:0;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.85)">${Utils.escapeHtml(t.text)}</p>` : ''}
                ${contractCard}
              </div>`
          }).join('')}
        </div>

        ${canAct ? `
          <!-- فرم ارسال پیام سریع پرسنل -->
          <div class="portal-inbox-reply-box" style="margin-top:10px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.08)">
            <div style="display:flex;gap:6px">
              <input type="text" id="staff-reply-${req.id}" class="portal-input" placeholder="پاسخ یا گزارش شما (برای مشتری و مدیر قابل مشاهده است)..." style="flex:1;font-size:12px;padding:8px 10px;background:rgba(0,0,0,0.25);border-radius:8px" onkeydown="if(event.key==='Enter') PortalMessages.submitReply('${req.id}')" />
              <button class="portal-btn portal-btn-primary" onclick="PortalMessages.submitReply('${req.id}')" style="min-width:70px;font-size:12px">
                <i class="fas fa-paper-plane"></i> ارسال
              </button>
            </div>
          </div>` : ''}
      </div>`
  },

  async submitReply(id) {
    const input = document.getElementById(`staff-reply-${id}`)
    const text = input?.value?.trim()
    if (!text) {
      Utils.toast('متن پاسخ را بنویسید', 'error')
      return
    }

    const user = Auth.getUser()
    const personnel = DB.findPersonnelByUserId(user?.id) || DB.findPersonnelByPhone(user?.phone)
    const req = DB.find('customerRequests', r => r.id === id)
    if (!req || !Access.canViewCustomerRequest(user, req)) {
      Utils.toast('دسترسی ندارید', 'error')
      return
    }

    const staffName = personnel?.name || user?.name || 'پرسنل استودیو'
    const roleTitle = personnel?.role || user?.portalType || 'پرسنل'

    InboxShared.appendThread(id, {
      author: 'staff',
      authorName: `${staffName} (${roleTitle})`,
      authorRole: roleTitle,
      text,
      action: 'reply',
      readByStaff: true
    })

    await SecureDB.update('customerRequests', id, { readByStaff: true })
    Utils.toast('پاسخ پرسنل ثبت و برای طرفین ارسال شد', 'success')
    Portal.showSection('messages')
  },

  sendContractSnippet(requestId, contractId) {
    const contract = DB.find('contracts', c => c.id === contractId)
    if (!contract) return Utils.toast('قرارداد یافت نشد', 'error')

    const user = Auth.getUser()
    const personnel = DB.findPersonnelByUserId(user?.id) || DB.findPersonnelByPhone(user?.phone)
    const snippet = InboxShared.buildContractSnippet(contract)

    InboxShared.appendThread(requestId, {
      author: 'staff',
      authorName: personnel?.name || user?.name || 'پرسنل استودیو',
      authorRole: personnel?.role || 'پرسنل',
      text: `کارت اطلاعات قرارداد شماره ${snippet.contractNum} جهت بررسی هماهنگی‌های پروژه ارسال شد.`,
      action: 'contract_share',
      contractInfo: snippet,
      readByStaff: true
    })

    Utils.toast('کارت قرارداد در گفتگو ارسال شد', 'success')
    Portal.showSection('messages')
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
    InboxShared.markThreadRead(id, 'staff')
    Utils.toast('وضعیت خوانده‌شده برای مدیر و مشتری ثبت گردید', 'success')
    Portal.showSection('messages')
  }
}

if (typeof window !== 'undefined') {
  window.PortalMessages = PortalMessages
}
