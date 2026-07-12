/* ══════════════════════════════════════════════
   MAN — Customer Portal v2
   ══════════════════════════════════════════════ */

const CustomerPortal = {
  state: { contract: null },

  init() {
    document.body.classList.add('customer-app')
    document.getElementById('glass-rail')?.remove()
    return this._boot()
  },

  async _boot() {
    const session = typeof CustomerSession !== 'undefined' ? await CustomerSession.get() : null
    if (session?.contract) {
      // اعتبارسنجی جلسه: باید قرارداد واقعی و فعال باشد
      const live = DB.find('contracts', c => c.id === session.contract.id)
      if (!live || live.status === 'cancelled') {
        CustomerSession.clear()
        window.location.replace('index.html')
        return
      }
      if (typeof Studio !== 'undefined' && session.joinCode && !Studio.validateJoinCode(session.joinCode)) {
        CustomerSession.clear()
        window.location.replace('index.html')
        return
      }
      this.state.contract = live
      this.renderDashboard()
      return
    }
    window.location.replace('index.html')
  },

  renderLogin() {
    window.location.replace('index.html')
  },

  logout() {
    if (typeof CustomerSession !== 'undefined') CustomerSession.clear()
    else Utils.storage.remove('customer_session')
    this.state.contract = null
    window.location.href = 'index.html?logout=1'
  },

  renderDashboard() {
    const cached = this.state.contract
    if (!cached) return this.renderLogin()
    const c = DB.find('contracts', x => x.id === cached.id) || cached
    if (!c || c.status === 'cancelled') return this.renderLogin()
    this.state.contract = c

    const persProjects = DB.filter('persProjects', p => p.contractId === c.id)
    const stage = PortalShared.getContractStage(c, persProjects)
    const dl = PortalShared.getDeadlineInfo(c.deliveryDate)
    const queue = PortalShared.getCustomerQueue(c)
    const congrats = PortalShared.getCustomerCongrats(c)
    const live = PortalShared.getCustomerLiveStatus(c, persProjects)
    const myReqs = DB.filter('customerRequests', r => r.contractId === c.id)
    const studio = DB.get('studioInfo')?.name || AppConfig.DEFAULT_STUDIO_NAME

    const queueDisplay = queue.stage >= 2
      ? `<div class="customer-queue-card is-active">
          <div class="customer-queue-num">${live.icon}</div>
          <div class="customer-queue-label">${Utils.escapeHtml(live.label)}</div>
        </div>`
      : `<div class="customer-queue-card">
          <div class="customer-queue-num">${Utils.fmtNum(queue.ahead)}</div>
          <div class="customer-queue-label">${Utils.escapeHtml(queue.statusText)}</div>
          <div class="customer-live-status">
            <span class="live-icon">📋</span>
            <div>
              <div class="live-label">وضعیت فعلی: ${PortalShared.CUSTOMER_PIPELINE[stage]?.label || '—'}</div>
              <div class="live-sub">شما نفر ${Utils.fmtNum(queue.position)} از ${Utils.fmtNum(queue.total)} در صف تحویل</div>
            </div>
          </div>
        </div>`

    const queuePreview = queue.stage < 2 && queue.sorted.length > 1
      ? `<div class="customer-card" style="max-width:none;margin-bottom:16px">
          <h1 style="font-size:14px;text-align:right;margin-bottom:10px;color:rgba(255,255,255,0.6)">📋 صف تحویل (بر اساس تاریخ)</h1>
          <div class="customer-queue-list">
            ${queue.sorted.slice(0, Math.min(queue.ahead + 3, 8)).map((item, i) => {
              const isYou = item.id === c.id
              const name = `${item.bride || ''} و ${item.groom || ''}`
              return `<div class="customer-queue-item ${isYou ? 'is-you' : ''}">
                <span class="q-pos">${i + 1}</span>
                <span>${isYou ? '👑 شما — ' : ''}${Utils.escapeHtml(name)} ${isYou ? '' : ''}</span>
              </div>`
            }).join('')}
          </div>
        </div>`
      : ''

    document.getElementById('customer-app').innerHTML = `
      <div class="customer-page">
        <div style="max-width:520px;margin:0 auto">
          <div class="portal-header" style="border-radius:16px;margin-bottom:16px">
            <div class="user-info">
              <div class="avatar">💒</div>
              <div>
                <div class="name">${Utils.escapeHtml(studio)}</div>
                <div class="role">قرارداد #${Utils.escapeHtml(c.contractNum || '—')}</div>
              </div>
            </div>
            <div class="portal-header-actions" style="display:flex;gap:8px;align-items:center">
              <button type="button" class="portal-header-btn" onclick="GlassTheme.openPicker()" title="تنظیم ظاهر" aria-label="تنظیم ظاهر"><i class="fas fa-wand-magic-sparkles"></i></button>
              <button class="logout-btn" onclick="CustomerPortal.logout()">خروج</button>
            </div>
          </div>

          <div class="customer-welcome">
            <div class="congrats-title">${congrats.title}</div>
            <div class="couple-names">
              <span class="bride">${Utils.escapeHtml(c.bride || 'عروس')}</span>
              <span style="color:rgba(255,255,255,0.4);font-size:20px"> 💍 </span>
              <span class="groom">${Utils.escapeHtml(c.groom || 'داماد')}</span>
            </div>
            ${congrats.lines.map(l => `<p class="congrats-line">${l}</p>`).join('')}
          </div>

          ${queueDisplay}

          ${dl ? `<div class="portal-hero ${dl.urgent ? 'urgent' : ''}" style="margin-bottom:16px">
            <h2>⏰ ${dl.text}</h2>
            <p>تا تحویل خروجی مراسم ${Utils.escapeHtml(c.bride || '')} و ${Utils.escapeHtml(c.groom || '')}</p>
          </div>` : ''}

          <div class="customer-card" style="max-width:none;margin-bottom:16px">
            <h1 style="font-size:16px;text-align:right;margin-bottom:12px">📊 روند کار شما</h1>
            ${PortalShared.renderPipeline(stage)}
            <div class="customer-live-status">
              <span class="live-icon">${live.icon}</span>
              <div>
                <div class="live-label">${Utils.escapeHtml(live.label)}</div>
                <div class="live-sub">${c.eventDate ? `تاریخ مراسم: ${c.eventDate}` : ''} ${c.venue ? '— ' + Utils.escapeHtml(c.venue) : ''}</div>
              </div>
            </div>
          </div>

          ${queuePreview}

          <div class="customer-card" style="max-width:none;margin-bottom:16px">
            <h1 style="font-size:16px;text-align:right;margin-bottom:12px">📝 ثبت درخواست</h1>
            <p class="sub" style="text-align:right;margin-bottom:12px">MP3 مراسم، آهنگ درخواستی، سلیقه شخصی — پس از تأیید مدیر به تدوین می‌رود</p>
            <div class="request-type-grid" id="req-types">
              ${Object.entries(PortalShared.REQUEST_TYPES).map(([k, v]) =>
                `<button class="request-type-btn" data-type="${k}" onclick="CustomerPortal.selectReqType('${k}')">${v.icon} ${v.label}</button>`
              ).join('')}
            </div>
            <textarea class="customer-textarea" id="cust-req-text" placeholder="مثال: لطفاً MP3 مراسم تحویل استودیو بدهید&#10;آهنگ درخواستی: ...&#10;سلیقه و توضیحات شخصی..."></textarea>
            <button class="portal-btn portal-btn-primary" onclick="CustomerPortal.submitRequest()">ارسال درخواست</button>
          </div>

          ${myReqs.length ? `
          <div class="customer-card" style="max-width:none">
            <h1 style="font-size:16px;text-align:right;margin-bottom:12px">📬 درخواست‌های من</h1>
            ${myReqs.slice().reverse().map(r => {
              const thread = typeof InboxShared !== 'undefined' ? InboxShared.ensureThread(r) : [{ author: 'customer', text: r.text, date: r.createdAt, time: r.createdTime }]
              return `
              <div class="req-history-item ${r.status || 'pending'}">
                <div style="font-weight:600;color:#fff;font-size:13px">${PortalShared.REQUEST_TYPES[r.type]?.icon || '📝'} ${PortalShared.REQUEST_TYPES[r.type]?.label || 'درخواست'}</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.4);margin:6px 0">${InboxShared ? InboxShared.formatWhen(r.createdAt, r.createdTime) : r.createdAt}</div>
                ${thread.map(t => `
                  <div class="customer-thread-msg customer-thread-msg--${t.author || 'customer'}">
                    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:4px">${Utils.escapeHtml(t.authorName || (InboxShared?.AUTHOR_LABELS?.[t.author] || 'مشتری'))} · ${Utils.escapeHtml(InboxShared?.formatWhen?.(t.date, t.time) || '')}</div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.75)">${Utils.escapeHtml(t.text || '')}</div>
                  </div>`).join('')}
                <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:8px">
                  ${r.status === 'sent_to_editing' ? '✅ تأیید مدیر — در تدوین' : r.status === 'rejected' ? '❌ رد شده' : '⏳ منتظر تأیید مدیر'}
                </div>
              </div>`
            }).join('')}
          </div>` : ''}
        </div>
      </div>`
    this._selectedReqType = 'mp3'
    this.selectReqType('mp3')
    if (typeof NotificationTicker !== 'undefined') {
      NotificationTicker.init('customer', { contractId: c.id })
    }
  },

  _selectedReqType: 'mp3',

  selectReqType(type) {
    this._selectedReqType = type
    document.querySelectorAll('#req-types .request-type-btn').forEach(el => {
      el.classList.toggle('selected', el.dataset.type === type)
    })
  },

  async submitRequest() {
    const text = document.getElementById('cust-req-text')?.value?.trim()
    if (!text) { Utils.toast('متن درخواست را بنویسید', 'error'); return }
    const c = this.state.contract
    const parts = typeof InboxShared !== 'undefined' ? InboxShared.nowParts() : { date: Utils.todayJalali(), time: '', iso: new Date().toISOString() }
    const coupleName = `${c.bride || ''} و ${c.groom || ''}`.trim()
    const req = DB.insert('customerRequests', {
      contractId: c.id,
      contractNum: c.contractNum,
      type: this._selectedReqType,
      text,
      status: 'pending',
      read: false,
      readByStaff: false,
      targetRoles: typeof Access !== 'undefined'
        ? Access.getRequestTargetRoles(this._selectedReqType)
        : [],
      customerName: coupleName,
      customerPhone: c.groomPhone || c.bridePhone || '',
      createdAt: parts.date,
      createdTime: parts.time,
      lastActivityAt: parts.iso,
      thread: [{
        author: 'customer',
        authorName: coupleName || 'مشتری',
        text,
        date: parts.date,
        time: parts.time,
        at: parts.iso,
        action: 'request'
      }]
    })
    await NotifyHub.customerRequestSubmitted(req, c)
    await DB.flush()
    Utils.toast('✅ درخواست ثبت شد. پس از تأیید مدیر اطلاع‌رسانی می‌شود.', 'success')
    this.renderDashboard()
  }
}

document.addEventListener('DOMContentLoaded', () => Bootstrap.start(async () => CustomerPortal.init()))
window.CustomerPortal = CustomerPortal
