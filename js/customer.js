/* ══════════════════════════════════════════════
   Studio ERP — Customer Portal
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
      let live = DB.find('contracts', c => c.id === session.contract.id)
      if (!live) {
        try {
          const sid = session.studioId || (typeof DB !== 'undefined' && DB.get('studioInfo')?.id) || ''
          const res = await fetch(`/api/portal/customer-data?contractId=${encodeURIComponent(session.contract.id)}${sid ? `&studioId=${encodeURIComponent(sid)}` : ''}`)
          if (res.ok) {
            const d = await res.json()
            if (d.ok && d.contract) {
              live = d.contract
              if (typeof DB !== 'undefined') {
                if (d.studioInfo) DB.set('studioInfo', { ...(DB.get('studioInfo') || {}), ...d.studioInfo })
                const curContracts = (DB.get('contracts') || []).filter(c => c.id !== live.id)
                DB.set('contracts', [...curContracts, live])
                if (Array.isArray(d.persProjects)) DB.set('persProjects', d.persProjects)
                if (Array.isArray(d.customerRequests)) DB.set('customerRequests', d.customerRequests)
                if (Array.isArray(d.transactions)) DB.set('transactions', d.transactions)
              }
            }
          }
        } catch { /* ignore network error, fallback to check */ }
      }
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
              const name = isYou ? `${item.bride || ''} و ${item.groom || ''}` : `پروژه #${(item.id || '').slice(-4).toUpperCase()}`
              return `<div class="customer-queue-item ${isYou ? 'is-you' : ''}">
                <span class="q-pos">${i + 1}</span>
                <span>${isYou ? '👑 نوبت شما — ' + Utils.escapeHtml(name) : 'نوبت تحویل ' + Utils.escapeHtml(name)}</span>
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
              ${typeof AudioNotifier !== 'undefined' ? AudioNotifier.renderToggleButton('portal-header-btn') : ''}
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

          ${this._renderContractAcceptanceCard(c)}

          ${this._renderFinancialSection(c)}

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
            <h1 style="font-size:16px;text-align:right;margin-bottom:12px">📬 گفتگوها و پیام‌های من با استودیو</h1>
            ${myReqs.slice().reverse().map(r => {
              // نشانه‌گذاری خودکار به عنوان خوانده شده توسط مشتری
              if (typeof InboxShared !== 'undefined') {
                InboxShared.markThreadRead(r.id, 'customer')
              }
              const thread = typeof InboxShared !== 'undefined' ? InboxShared.ensureThread(r) : [{ author: 'customer', text: r.text, date: r.createdAt, time: r.createdTime }]
              return `
              <div class="req-history-item ${r.status || 'pending'}" style="margin-bottom:14px;padding:12px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                  <div style="font-weight:600;color:#fff;font-size:13px">${PortalShared.REQUEST_TYPES[r.type]?.icon || '📝'} ${PortalShared.REQUEST_TYPES[r.type]?.label || 'درخواست'}</div>
                  <div style="font-size:11px;color:rgba(255,255,255,0.4)">${InboxShared ? InboxShared.formatWhen(r.createdAt, r.createdTime) : r.createdAt}</div>
                </div>

                <div class="customer-thread-container" style="display:flex;flex-direction:column;gap:6px;margin:8px 0">
                  ${thread.map(t => {
                    const ticks = typeof InboxShared !== 'undefined' ? InboxShared.renderTicks(t, 'customer') : ''
                    const contractCard = t.contractInfo && typeof InboxShared !== 'undefined' ? InboxShared.renderContractCard(t.contractInfo) : ''
                    const cls = t.author || 'customer'
                    return `
                      <div class="customer-thread-msg customer-thread-msg--${cls}" style="margin:4px 0;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.04);border-inline-start:3px solid ${cls === 'customer' ? '#38bdf8' : cls === 'manager' ? '#f59e0b' : '#4ade80'}">
                        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:4px">
                          <span>${Utils.escapeHtml(t.authorName || (InboxShared?.AUTHOR_LABELS?.[t.author] || 'مشتری'))} · ${Utils.escapeHtml(InboxShared?.formatWhen?.(t.date, t.time) || '')}</span>
                          ${ticks}
                        </div>
                        ${t.text ? `<div style="font-size:12.5px;color:rgba(255,255,255,0.85);line-height:1.6">${Utils.escapeHtml(t.text)}</div>` : ''}
                        ${contractCard}
                      </div>`
                  }).join('')}
                </div>

                <!-- نوار پاسخ سریع مشتری -->
                <div class="customer-thread-reply-bar" style="margin-top:10px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.08);display:flex;gap:6px">
                  <input type="text" id="cust-thread-reply-${r.id}" class="portal-input" placeholder="پاسخ یا پیام جدید شما..." style="flex:1;font-size:12px;padding:7px 10px;background:rgba(0,0,0,0.3);border-radius:8px" onkeydown="if(event.key==='Enter') CustomerPortal.replyToThread('${r.id}')" />
                  <button type="button" class="portal-btn portal-btn-primary" onclick="CustomerPortal.replyToThread('${r.id}')" style="font-size:12px;padding:6px 14px">
                    <i class="fas fa-paper-plane"></i> ارسال
                  </button>
                </div>

                <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:8px;display:flex;justify-content:space-between">
                  <span>${r.status === 'sent_to_editing' ? '✅ تأیید مدیر — در تدوین' : r.status === 'rejected' ? '❌ رد شده' : '⏳ در حال بررسی استودیو'}</span>
                  <span style="opacity:0.6">شناسه: #${Utils.escapeHtml(r.id.slice(-5))}</span>
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

  async replyToThread(requestId) {
    const input = document.getElementById(`cust-thread-reply-${requestId}`)
    const text = input?.value?.trim()
    if (!text) {
      Utils.toast('لطفاً متن پاسخ را بنویسید', 'error')
      return
    }

    const c = this.state.contract
    const coupleName = `${c.bride || ''} و ${c.groom || ''}`.trim() || 'مشتری'

    InboxShared.appendThread(requestId, {
      author: 'customer',
      authorName: coupleName,
      authorRole: 'مشتری (عروس و داماد)',
      text,
      action: 'reply'
    })

    await DB.flush?.()
    Utils.toast('پیام شما با موفقیت ارسال شد', 'success')
    this.renderDashboard()
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
      readByCustomer: true,
      targetRoles: typeof Access !== 'undefined'
        ? Access.getRequestTargetRoles(this._selectedReqType)
        : [],
      customerName: coupleName,
      customerPhone: c.groomPhone || c.bridePhone || '',
      createdAt: parts.date,
      createdTime: parts.time,
      lastActivityAt: parts.iso,
      thread: [{
        id: 'orig',
        author: 'customer',
        authorName: coupleName || 'مشتری',
        authorRole: 'مشتری (عروس و داماد)',
        text,
        date: parts.date,
        time: parts.time,
        at: parts.iso,
        action: 'request',
        status: 'delivered',
        readBy: {
          customer: true,
          manager: false,
          staff: false
        }
      }]
    })
    await NotifyHub.customerRequestSubmitted(req, c)
    await DB.flush()
    if (typeof AudioNotifier !== 'undefined') {
      AudioNotifier.playSent()
    }
    Utils.toast('✅ درخواست ثبت شد. پس از تأیید مدیر اطلاع‌رسانی می‌شود.', 'success')
    this.renderDashboard()
  },

  _renderFinancialSection(c) {
    const contractTx = (typeof DB !== 'undefined' && DB.get ? DB.get('transactions') : []).filter(t => t.contractId === c.id && (t.type === 'deposit' || t.direction === 'in'))
    const txTotal = contractTx.reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
    const baseDeposit = Number(c.deposit) || 0
    const hasDepositInTx = contractTx.some(t => t.purposeCategory === 'contract_deposit' || String(t.purpose || t.desc || '').includes('بیعانه'))
    const totalPaid = hasDepositInTx ? txTotal : (baseDeposit + txTotal)
    const totalAmount = Number(c.finalAmount || c.totalAmount || c.total || 0)
    const remaining = Math.max(0, totalAmount - totalPaid)
    const paidPercent = totalAmount > 0 ? Math.min(100, Math.round((totalPaid / totalAmount) * 100)) : (totalPaid > 0 ? 100 : 0)

    const paymentsList = []
    if (baseDeposit > 0 && !hasDepositInTx) {
      paymentsList.push({
        id: 'deposit_initial',
        amount: baseDeposit,
        date: c.date || c.createdAt || '—',
        purpose: 'بیعانه و پیش‌پرداخت اولیه قرارداد',
        method: 'پیش‌پرداخت'
      })
    }
    contractTx.forEach(t => {
      paymentsList.push({
        id: t.id,
        amount: Number(t.amount) || 0,
        date: t.date || '—',
        purpose: t.purpose || t.desc || 'واریز علی‌الحساب قرارداد',
        method: t.paymentMethod ? (t.paymentMethod === 'pos' ? 'کارت‌خوان' : t.paymentMethod === 'card' ? 'کارت به کارت' : t.paymentMethod === 'transfer' ? 'حواله بانکی / پایا' : t.paymentMethod) : 'واریز بانکی'
      })
    })

    const services = Array.isArray(c.items) && c.items.length ? c.items : (Array.isArray(c.services) ? c.services : [])

    return `
      <div class="customer-card" style="max-width:none;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h1 style="font-size:16px;text-align:right;margin:0">💳 وضعیت مالی و حسابداری قرارداد</h1>
          <span style="font-size:12px;padding:3px 8px;border-radius:6px;background:${remaining === 0 ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)'};color:${remaining === 0 ? '#4ade80' : '#fbbf24'};font-weight:700">
            ${remaining === 0 ? '✓ تسویه کامل' : '⏳ در جریان تسویه'}
          </span>
        </div>

        <div class="customer-finance-grid">
          <div class="customer-fin-stat">
            <div class="customer-fin-lbl">کل مبلغ قرارداد</div>
            <div class="customer-fin-num">${Utils.fmtNum(totalAmount)} <span style="font-size:11px;font-weight:normal;opacity:0.6">تومان</span></div>
          </div>
          <div class="customer-fin-stat paid">
            <div class="customer-fin-lbl">مجموع پرداختی‌ها</div>
            <div class="customer-fin-num">${Utils.fmtNum(totalPaid)} <span style="font-size:11px;font-weight:normal;opacity:0.6">تومان</span></div>
          </div>
          <div class="customer-fin-stat remaining ${remaining === 0 ? 'settled' : ''}">
            <div class="customer-fin-lbl">مانده تسویه نشده</div>
            <div class="customer-fin-num">${Utils.fmtNum(remaining)} <span style="font-size:11px;font-weight:normal;opacity:0.6">تومان</span></div>
          </div>
        </div>

        <div class="customer-progress-box">
          <div class="customer-progress-head">
            <span>درصد پرداخت شده:</span>
            <span style="font-weight:700;color:#4ade80">${paidPercent}٪</span>
          </div>
          <div class="customer-progress-bar-bg">
            <div class="customer-progress-bar-fill" style="width:${paidPercent}%"></div>
          </div>
        </div>

        ${services.length ? `
        <div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px">
          <h2 style="font-size:13px;color:#fff;margin:0 0 8px;font-weight:700">📋 خدمات و تعهدات مندرج در قرارداد:</h2>
          <table class="customer-services-table">
            <thead>
              <tr>
                <th>شرح خدمات</th>
                <th style="text-align:center;width:60px">تعداد</th>
                <th style="text-align:left;width:110px">مبلغ (تومان)</th>
              </tr>
            </thead>
            <tbody>
              ${services.map(s => `
                <tr>
                  <td>${Utils.escapeHtml(s.name || s.title || s.desc || 'خدمت استودیو')}</td>
                  <td style="text-align:center">${Utils.fmtNum(s.qty || s.count || 1)}</td>
                  <td style="text-align:left;direction:ltr">${Utils.fmtNum(s.price || s.amount || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>` : ''}

        <div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px">
          <h2 style="font-size:13px;color:#fff;margin:0 0 8px;font-weight:700">💰 ریز واریزی‌ها و پرداخت‌های شما:</h2>
          ${paymentsList.length ? `
            <div class="customer-payments-list">
              ${paymentsList.map(p => `
                <div class="customer-payment-item">
                  <div class="customer-pay-right">
                    <div class="customer-pay-purpose">${Utils.escapeHtml(p.purpose)}</div>
                    <div class="customer-pay-meta">تاریخ: ${Utils.escapeHtml(p.date)} · شیوه: ${Utils.escapeHtml(p.method)}</div>
                  </div>
                  <div class="customer-pay-left">
                    <div class="customer-pay-amount">+ ${Utils.fmtNum(p.amount)} تومان</div>
                    <span class="customer-pay-badge">✓ ثبت شد</span>
                  </div>
                </div>
              `).join('')}
            </div>` : `
            <div style="text-align:center;padding:16px;color:rgba(255,255,255,0.4);font-size:12px">
              هنوز پرداختی در سامانه ثبت نشده است. پس از واریز بیعانه یا اقساط، رسیدهای شما در اینجا درج خواهد شد.
            </div>`
          }
        </div>

        <div class="customer-inv-actions">
          <button type="button" class="customer-btn-invoice" onclick="CustomerPortal.openInvoicePrint()">
            <i class="fas fa-print"></i> مشاهده و چاپ فاکتور رسمی مراسم
          </button>
        </div>
      </div>
    `
  },

  openInvoicePrint() {
    const c = this.state.contract
    if (!c) return
    const studio = (typeof DB !== 'undefined' && DB.get ? DB.get('studioInfo') : {}) || {}
    const studioName = studio.name || 'استودیو عکاسی و فیلمبرداری'
    const studioPhone = studio.phone || ''
    const studioAddress = studio.address || ''

    const contractTx = (typeof DB !== 'undefined' && DB.get ? DB.get('transactions') : []).filter(t => t.contractId === c.id && (t.type === 'deposit' || t.direction === 'in'))
    const txTotal = contractTx.reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
    const baseDeposit = Number(c.deposit) || 0
    const hasDepositInTx = contractTx.some(t => t.purposeCategory === 'contract_deposit' || String(t.purpose || t.desc || '').includes('بیعانه'))
    const totalPaid = hasDepositInTx ? txTotal : (baseDeposit + txTotal)
    const totalAmount = Number(c.finalAmount || c.totalAmount || c.total || 0)
    const remaining = Math.max(0, totalAmount - totalPaid)
    const services = Array.isArray(c.items) && c.items.length ? c.items : (Array.isArray(c.services) ? c.services : [])

    const printWin = window.open('', '_blank', 'width=850,height=950')
    if (!printWin) {
      Utils.toast('لطفاً اجازه باز شدن پنجره چاپ (Pop-up) را در مرورگر بدهید', 'error')
      return
    }

    const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <title>فاکتور رسمی مراسم — #${Utils.escapeHtml(c.contractNum || '—')}</title>
  <style>
    body { font-family: Tahoma, Vazirmatn, sans-serif; margin: 0; padding: 24px; color: #1e293b; background: #fff; font-size: 13px; line-height: 1.6; }
    .inv-container { max-width: 800px; margin: 0 auto; border: 2px solid #0f172a; padding: 24px; border-radius: 8px; }
    .inv-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 16px; margin-bottom: 16px; }
    .inv-brand h1 { margin: 0; font-size: 20px; color: #0f172a; font-weight: 800; }
    .inv-brand p { margin: 4px 0 0; color: #64748b; font-size: 12px; }
    .inv-meta { text-align: left; font-size: 12px; }
    .inv-meta strong { color: #0f172a; }
    .inv-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .table-title { font-weight: 700; font-size: 13px; margin: 16px 0 8px; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #f1f5f9; color: #334155; padding: 8px 10px; text-align: right; border: 1px solid #cbd5e1; font-size: 12px; }
    td { padding: 8px 10px; border: 1px solid #e2e8f0; font-size: 12px; }
    .num { direction: ltr; text-align: left; }
    .summary-box { display: flex; justify-content: flex-end; margin-top: 16px; }
    .summary-table { width: 320px; border-collapse: collapse; }
    .summary-table td { padding: 6px 10px; }
    .summary-table tr.total td { font-weight: 800; font-size: 14px; background: #f8fafc; border-top: 2px solid #0f172a; }
    .inv-footer { margin-top: 32px; display: flex; justify-content: space-between; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #64748b; }
    .stamp-box { width: 160px; height: 70px; border: 1px dashed #94a3b8; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #94a3b8; }
    @media print {
      body { padding: 0; }
      .inv-container { border: none; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="inv-container">
    <div class="no-print" style="text-align:left;margin-bottom:12px">
      <button onclick="window.print()" style="background:#0f172a;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-family:inherit;font-weight:700">🖨️ چاپ فاکتور / ذخیره PDF</button>
    </div>
    <div class="inv-header">
      <div class="inv-brand">
        <h1>${Utils.escapeHtml(studioName)}</h1>
        <p>${Utils.escapeHtml(studioAddress)} ${studioPhone ? '— تلفن: ' + Utils.escapeHtml(studioPhone) : ''}</p>
      </div>
      <div class="inv-meta">
        <div><strong>صورت‌حساب رسمی قرارداد خدمات مراسم</strong></div>
        <div>شماره قرارداد: <strong>${Utils.escapeHtml(c.contractNum || '—')}</strong></div>
        <div>تاریخ صدور: <strong>${Utils.todayJalali()}</strong></div>
      </div>
    </div>

    <div class="inv-box">
      <div><strong>طرف اول (استودیو):</strong> ${Utils.escapeHtml(studioName)}</div>
      <div><strong>طرف دوم (مراجعین):</strong> ${Utils.escapeHtml(c.bride || 'عروس')} و ${Utils.escapeHtml(c.groom || 'داماد')}</div>
      <div><strong>تاریخ مراسم:</strong> ${Utils.escapeHtml(c.eventDate || '—')}</div>
      <div><strong>شماره تماس:</strong> ${Utils.escapeHtml(c.groomPhone || c.bridePhone || '—')}</div>
    </div>

    <div class="table-title">خدمات و تعهدات قرارداد:</div>
    <table>
      <thead>
        <tr>
          <th style="width:40px;text-align:center">ردیف</th>
          <th>شرح خدمت / پکیج</th>
          <th style="width:60px;text-align:center">تعداد</th>
          <th style="width:130px;text-align:left">مبلغ (تومان)</th>
        </tr>
      </thead>
      <tbody>
        ${services.length ? services.map((s, idx) => `
          <tr>
            <td style="text-align:center">${idx + 1}</td>
            <td>${Utils.escapeHtml(s.name || s.title || s.desc || 'خدمات عکاسی و تصویربرداری')}</td>
            <td style="text-align:center">${Utils.fmtNum(s.qty || s.count || 1)}</td>
            <td class="num">${Utils.fmtNum(s.price || s.amount || 0)}</td>
          </tr>
        `).join('') : `
          <tr>
            <td style="text-align:center">۱</td>
            <td>پکیج جامع تصویربرداری و عکاسی مراسم (${Utils.escapeHtml(c.bride || '')} و ${Utils.escapeHtml(c.groom || '')})</td>
            <td style="text-align:center">۱</td>
            <td class="num">${Utils.fmtNum(totalAmount)}</td>
          </tr>
        `}
      </tbody>
    </table>

    <div class="summary-box">
      <table class="summary-table">
        <tr>
          <td>کل مبلغ قرارداد:</td>
          <td class="num">${Utils.fmtNum(totalAmount)} تومان</td>
        </tr>
        <tr>
          <td style="color:#16a34a">مجموع واریزی‌ها و بیعانه:</td>
          <td class="num" style="color:#16a34a">${Utils.fmtNum(totalPaid)} تومان</td>
        </tr>
        <tr class="total">
          <td style="color:${remaining === 0 ? '#16a34a' : '#ea580c'}">${remaining === 0 ? 'وضعیت تسویه:' : 'مانده بدهی:'}</td>
          <td class="num" style="color:${remaining === 0 ? '#16a34a' : '#ea580c'}">${remaining === 0 ? 'تسویه کامل ✓' : Utils.fmtNum(remaining) + ' تومان'}</td>
        </tr>
      </table>
    </div>

    <div class="inv-footer">
      <div>امضای مراجع / عروس و داماد</div>
      <div class="stamp-box">محل مهر و امضای استودیو</div>
    </div>
  </div>
</body>
</html>`

    printWin.document.open()
    printWin.document.write(html)
    printWin.document.close()
  },

  _renderContractAcceptanceCard(c) {
    const isSigned = !!(c.customerAccepted || c.signedAt || c.status === 'signed')
    const studio = DB.get('studioInfo')?.name || AppConfig.DEFAULT_STUDIO_NAME
    const date = c.customerAcceptedAt || c.signedAt || c.eventDate || '—'

    if (isSigned) {
      return `
        <div class="customer-card" style="max-width:none;margin-bottom:16px;background:linear-gradient(135deg,rgba(16,185,129,0.12) 0%,rgba(20,20,24,0.95) 100%);border:1px solid rgba(16,185,129,0.35);box-shadow:0 6px 20px rgba(0,0,0,0.35)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:36px;height:36px;border-radius:10px;background:rgba(16,185,129,0.2);display:flex;align-items:center;justify-content:center;color:#10b981;font-size:16px;font-weight:900">
                ✓✓
              </div>
              <div>
                <h2 style="font-size:14px;color:#10b981;margin:0;font-weight:800">قرارداد رسمی تایید و نهایی شد</h2>
                <div style="font-size:11.5px;color:rgba(255,255,255,0.6);margin-top:2px">امضای الکترونیکی شما در سامانه ثبت گردیده است · تاریخ: ${Utils.escapeHtml(date)}</div>
              </div>
            </div>
            <button type="button" class="portal-btn portal-btn-ghost" style="font-size:11.5px;padding:7px 14px;display:flex;align-items:center;gap:6px" onclick="CustomerPortal.openContractTermsModal('${c.id}')">
              <i class="fas fa-file-contract"></i> مشاهده متن کامل قرارداد
            </button>
          </div>
        </div>
      `
    }

    return `
      <div class="customer-card" style="max-width:none;margin-bottom:16px;background:linear-gradient(135deg,rgba(245,158,11,0.12) 0%,rgba(20,20,24,0.95) 100%);border:1px solid rgba(245,158,11,0.35);box-shadow:0 8px 24px rgba(0,0,0,0.4)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:8px">
          <div style="font-weight:800;font-size:14px;color:#F59E0B;display:flex;align-items:center;gap:6px">
            <i class="fas fa-file-signature"></i>
            <span>تایید و امضای رسمی قرارداد #${Utils.escapeHtml(c.contractNum || c.id)}</span>
          </div>
          <span style="font-size:11px;padding:3px 8px;border-radius:6px;background:rgba(245,158,11,0.2);color:#fbbf24;font-weight:700">
            ⏳ در انتظار تایید شما
          </span>
        </div>

        <p style="font-size:12.5px;color:rgba(255,255,255,0.85);line-height:1.7;margin:0 0 12px">
          قرارداد خدمات فیلمبرداری و عکاسی مراسم شما در <strong>${Utils.escapeHtml(studio)}</strong> تنظیم گردیده است. لطفاً مفاد، تعهدات و زمان‌بندی تحویل را بررسی و تایید فرمایید:
        </p>

        <div style="margin-bottom:12px">
          <button type="button" class="portal-btn portal-btn-ghost" style="width:100%;font-size:12px;padding:8px 12px;display:flex;align-items:center;justify-content:center;gap:6px" onclick="CustomerPortal.openContractTermsModal('${c.id}')">
            <i class="fas fa-book-open"></i> مطالعه مفاد، تعهدات کاری و زمان‌بندی تحویل
          </button>
        </div>

        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:12.5px;line-height:1.7;background:rgba(0,0,0,0.3);padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);margin-bottom:12px">
          <input type="checkbox" id="cust-contract-agree-${c.id}" style="width:18px;height:18px;accent-color:#10b981;margin-top:2px;cursor:pointer" />
          <span>کلیه مفاد، تعهدات کاری طرفین، زمان‌بندی تحویل راش‌ها و فیلم و شرایط مالی قرارداد را مطالعه نموده و <strong>می‌پذیرم</strong>.</span>
        </label>

        <button type="button" class="portal-btn portal-btn-primary" style="width:100%;font-size:13.5px;padding:11px;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px" onclick="CustomerPortal.acceptContract('${c.id}')">
          <i class="fas fa-check-circle"></i> تایید و امضای دیجیتال قرارداد (می‌پذیرم)
        </button>
      </div>
    `
  },

  openContractTermsModal(contractId) {
    const c = DB.find('contracts', x => x.id === contractId) || this.state.contract
    if (!c) return
    const studio = DB.get('studioInfo')?.name || AppConfig.DEFAULT_STUDIO_NAME
    const couple = c.couple || `${c.bride || ''} و ${c.groom || ''}`.trim() || 'عروس و داماد'
    const total = Number(c.total || c.finalAmount || 0)
    const deposit = Number(c.deposit || 0)
    const remaining = Math.max(0, total - deposit)
    const modalId = 'cust-contract-terms-modal'

    document.getElementById(modalId)?.remove()
    const modal = document.createElement('div')
    modal.id = modalId
    modal.style.cssText = `
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);
      z-index:99999;display:flex;align-items:center;justify-content:center;
      padding:16px;direction:rtl;font-family:Vazirmatn,sans-serif;
    `

    modal.innerHTML = `
      <div style="background:#131317;border:1px solid rgba(245,158,11,0.3);border-radius:18px;max-width:640px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,0.7);overflow:hidden;color:#fff">
        <div style="padding:16px 20px;background:linear-gradient(135deg,rgba(245,158,11,0.15) 0%,rgba(20,20,24,0.9) 100%);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:800;font-size:15px;color:#F59E0B;display:flex;align-items:center;gap:8px">
            <i class="fas fa-file-contract"></i>
            <span>مفاد و تعهدات قرارداد رسمی — ${Utils.escapeHtml(studio)}</span>
          </div>
          <button type="button" onclick="document.getElementById('${modalId}').remove()" style="background:none;border:none;color:rgba(255,255,255,0.6);font-size:20px;cursor:pointer">&times;</button>
        </div>

        <div style="padding:20px;overflow-y:auto;flex:1;font-size:12.5px;line-height:1.8;color:rgba(255,255,255,0.85)">
          <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:12px 14px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>طرف اول: <strong>${Utils.escapeHtml(studio)}</strong></div>
            <div>طرف دوم: <strong>${Utils.escapeHtml(couple)}</strong></div>
            <div>تاریخ مراسم: <strong dir="ltr">${Utils.escapeHtml(c.eventDate || c.date || '—')}</strong></div>
            <div>مبلغ کل: <strong>${Number(total).toLocaleString('fa-IR')} تومان</strong></div>
            <div>بیعانه پرداختی: <strong style="color:#10b981">${Number(deposit).toLocaleString('fa-IR')} تومان</strong></div>
            <div>مانده حساب: <strong style="color:#F59E0B">${Number(remaining).toLocaleString('fa-IR')} تومان</strong></div>
          </div>

          <h3 style="color:#F59E0B;font-size:13px;margin:14px 0 6px">ماده ۱: تعهدات تصویربرداری و استاندارد سینمایی</h3>
          <p style="margin:0 0 10px">
            استودیو متعهد می‌گردد پوشش کامل مراسم را توسط کادر مجرب، مجهز به دوربین‌های سینمایی حرفه‌ای با وضوح 4K 10-BIT، سیستم‌های لرزش‌گیر پیشرفته (Ronin) و تجهیزات ضبط صدای حرفه‌ای به انجام رساند.
          </p>

          <h3 style="color:#F59E0B;font-size:13px;margin:14px 0 6px">ماده ۲: زمان‌بندی تدوین و تحویل پروژه‌ها</h3>
          <ul style="margin:0 0 10px;padding-right:20px">
            <li><strong>تیزر کوتاه:</strong> حداکثر ظرف ۱۴ الی ۲۱ روز کاری پس از تاریخ برگزاری مراسم.</li>
            <li><strong>فیلم کامل و آلبوم ژورنال ایتالیایی:</strong> ظرف ۴۵ الی ۶۰ روز کاری پس از انتخاب نهایی عکس‌ها توسط مشتری.</li>
          </ul>

          <h3 style="color:#F59E0B;font-size:13px;margin:14px 0 6px">ماده ۳: حفظ حریم خصوصی و محرمانگی راش‌ها</h3>
          <p style="margin:0 0 10px">
            کلیه تصاویر، فیلم‌ها و فایل‌های خام (راش‌ها) متعلق به طرفین بوده و استودیو متعهد به حفظ محرمانگی کامل بوده و بدون اجازه کتبی و رسمی طرف دوم حق انتشار هیچ‌گونه تصویری را نخواهد داشت.
          </p>

          <h3 style="color:#F59E0B;font-size:13px;margin:14px 0 6px">ماده ۴: شرایط مالی و تسویه‌حساب</h3>
          <p style="margin:0 0 10px">
            مبلغ بیعانه جهت رزرو قطعی تاریخ مراسم دریافت شده و مابقی مبالغ طبق زمان‌بندی مندرج در قرارداد تا پیش از تحویل خروجی نهایی تسویه خواهد شد.
          </p>
        </div>

        <div style="padding:14px 20px;background:rgba(0,0,0,0.3);border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;color:rgba(255,255,255,0.5)">امضای دیجیتال دارای اعتبار رسمی در اتوماسیون است</span>
          <button type="button" class="portal-btn" onclick="document.getElementById('${modalId}').remove()" style="background:rgba(255,255,255,0.08);color:#fff;border:none;padding:7px 18px;border-radius:8px;font-size:12px;cursor:pointer">
            متوجه شدم
          </button>
        </div>
      </div>
    `
    document.body.appendChild(modal)
  },

  async acceptContract(contractId) {
    const agreeBox = document.getElementById(`cust-contract-agree-${contractId}`)
    if (!agreeBox?.checked) {
      if (typeof Utils !== 'undefined' && Utils.toast) {
        Utils.toast('لطفاً تیک «مطالعه نموده و می‌پذیرم» را فعال کنید', 'warning')
      } else {
        alert('لطفاً تیک مطالعه و پذیرش شرایط قرارداد را فعال نمایید.')
      }
      return
    }

    const c = DB.find('contracts', x => x.id === contractId) || this.state.contract
    if (!c) return

    const nowJalali = typeof Utils !== 'undefined' ? Utils.todayJalali() : new Date().toLocaleDateString('fa-IR')
    const nowIso = new Date().toISOString()

    const patch = {
      customerAccepted: true,
      customerAcceptedAt: nowJalali,
      customerAcceptedIso: nowIso,
      status: 'signed'
    }

    DB.update('contracts', c.id, patch)

    // ثبت پیام خودکار در صندوق پیام مشتری و مدیر
    if (typeof InboxShared !== 'undefined') {
      InboxShared.appendThread(c.id, {
        author: 'customer',
        authorName: c.couple || `${c.bride || ''} و ${c.groom || ''}`.trim() || 'مشتری',
        authorRole: 'مشتری (عروس و داماد)',
        text: `✓ قرارداد رسمی شماره #${c.contractNum || c.id} توسط مشتری مطالعه و امضای دیجیتال (می‌پذیرم) گردید.`,
        action: 'contract_accepted'
      })
    }

    // پخش صدای شادباش و تایید
    if (typeof AudioNotifier !== 'undefined' && AudioNotifier.playContract) {
      AudioNotifier.playContract()
    }

    await DB.flush?.()

    // ارسال بلادرنگ به سرور
    if (typeof ServerSync !== 'undefined' && ServerSync.pushNow) {
      ServerSync.pushNow().catch(() => {})
    }

    if (typeof Utils !== 'undefined' && Utils.toast) {
      Utils.toast('تأیید و امضای دیجیتال قرارداد با موفقیت ثبت شد ✓✓', 'success')
    }

    // به‌روزرسانی نمای پورتال
    this.state.contract = { ...c, ...patch }
    this.renderDashboard()
  }
}

document.addEventListener('DOMContentLoaded', () => Bootstrap.start(async () => CustomerPortal.init()))
window.CustomerPortal = CustomerPortal
