/* Studio M — پیام‌رسانی: کانال‌ها · قالب‌ها · زمان‌بندی · لاگ ارسال */

const SMMessaging = {
  _tab: 'templates',
  _channelFilter: 'all',

  setTab(tab) {
    this._tab = tab
    SM.navigate('messaging')
  },

  setChannelFilter(ch) {
    this._channelFilter = ch
    this._tab = 'sent'
    SM.navigate('messaging')
  },

  render(el) {
    if (SM.state.viewStack.length) return
    if (typeof MessagingShared !== 'undefined') MessagingShared.ensureTemplates()

    const due = typeof MessagingShared !== 'undefined' ? MessagingShared.dueToday() : []
    const logs = typeof MessagingShared !== 'undefined'
      ? MessagingShared.logsFiltered(this._channelFilter, SM.getModuleSearch('messaging'))
      : []
    const counts = typeof MessagingShared !== 'undefined' ? MessagingShared.countByChannel() : {}
    const templates = (DB.get('smsTemplates') || []).slice()
    const smsOk = typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured()

    el.innerHTML = `
      ${SMUI.sectionHead('پیام‌رسانی', 'SMS، ایمیل، واتساپ و فضای مجازی — یادآوری مراسم زوج‌به‌زوج', `
        <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMMessaging.runToday')}><i class="fas fa-bolt"></i> ارسال امروز (${due.length})</button>
        <button type="button" class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMMessaging.sendManual')}><i class="fas fa-paper-plane"></i> ارسال دستی</button>`)}

      <div class="sm-msg-channels">
        ${Object.entries(MessagingShared.CHANNELS).map(([id, ch]) => {
          const st = MessagingShared.channelStatus(id)
          const cnt = counts[id] || 0
          return `<div class="sm-msg-channel sm-msg-channel--${id} ${st.configured ? 'is-on' : ''}" ${SMEvents.attrs('SMMessaging.setChannelFilter', [id === this._channelFilter ? 'all' : id])}>
            <div class="sm-msg-channel-icon"><i class="fas ${ch.icon}"></i></div>
            <div class="sm-msg-channel-body">
              <strong>${SM.esc(ch.label)}</strong>
              <span>${SMUI.badge(st.label, st.configured ? 'success' : 'muted')}</span>
              <span class="sm-msg-channel-count">${SM.fmt(cnt)} ارسال</span>
            </div>
          </div>`
        }).join('')}
      </div>

      ${!smsOk ? `<div class="sm-msg-alert"><i class="fas fa-info-circle"></i> برای ارسال واقعی SMS، از <a href="#settings" ${SMEvents.elAttrs('SM.openSettingsTab', ['sms'])}>تنظیمات → پیامک</a> API را وصل کنید. بدون API، پیام‌ها در لاگ «در صف» ثبت می‌شوند.</div>` : ''}

      ${SMUI.statCards([
        { label: 'قالب فعال', value: SM.fmt(templates.filter(t => t.enabled !== false).length), color: 'var(--sm-accent)' },
        { label: 'صف امروز', value: SM.fmt(due.length), color: due.length ? 'var(--sm-warning)' : 'var(--sm-success)' },
        { label: 'ارسال SMS', value: SM.fmt(counts.sms || 0), color: '#0071E3' },
        { label: 'کل لاگ', value: SM.fmt((DB.get('commLogs') || []).length), color: 'var(--sm-info)' }
      ])}

      ${SMUI.tabs([
        { id: 'templates', fa: 'قالب‌ها و زمان‌بندی', en: 'Templates', icon: 'fa-list', fn: 'SMMessaging.setTab', args: ['templates'] },
        { id: 'schedule', fa: 'صف امروز', en: 'Today', icon: 'fa-calendar-day', fn: 'SMMessaging.setTab', args: ['schedule'] },
        { id: 'sent', fa: 'ارسال‌شده به مشتری', en: 'Sent log', icon: 'fa-check-double', fn: 'SMMessaging.setTab', args: ['sent'] }
      ], this._tab)}

      <div style="margin-top:16px">${this._tabBody(due, logs, templates)}</div>`
  },

  _tabBody(due, logs, templates) {
    if (this._tab === 'schedule') return this._scheduleTab(due)
    if (this._tab === 'sent') return this._sentTab(logs)
    return this._templatesTab(templates)
  },

  _templatesTab(templates) {
    const byCat = {}
    templates.forEach(t => {
      const cat = t.category || 'welcome'
      if (!byCat[cat]) byCat[cat] = []
      byCat[cat].push(t)
    })
    const cats = Object.keys(MessagingShared.CATEGORIES)
    const body = cats.map(catId => {
      const items = byCat[catId] || []
      if (!items.length) return ''
      const cat = MessagingShared.CATEGORIES[catId]
      return `<div class="sm-msg-cat">
        <div class="sm-msg-cat-head"><i class="fas ${cat.icon}"></i> ${SM.esc(cat.label)} ${SMUI.badge(String(items.length), 'info')}</div>
        ${items.map(t => this._templateRow(t)).join('')}
      </div>`
    }).join('')
    const footer = `<div class="sm-msg-tpl-footer">
        <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMMessaging.resetTemplates')}><i class="fas fa-rotate"></i> بازنشانی قالب‌ها</button>
        <button type="button" class="sm-btn sm-btn-ghost" ${SMEvents.attrs('SMMessaging.editTemplate')}><i class="fas fa-plus"></i> قالب جدید</button>
      </div>`
    return (body || SMUI.empty('fa-comment-dots', 'قالبی نیست', '«بازنشانی قالب‌ها» را بزنید')) + footer
  },

  _templateRow(t) {
    const aud = MessagingShared.AUDIENCE[t.audience] || t.audience
    const timing = t.trigger === 'on_contract'
      ? 'هنگام ثبت قرارداد'
      : t.frequency === 'weekly' && t.rangeEnd != null
        ? `${t.daysBefore} تا ${t.rangeEnd} روز قبل · هفتگی`
        : t.frequency === 'daily' && t.rangeEnd != null
          ? `${t.daysBefore} تا ${t.rangeEnd} روز قبل · روزانه`
          : t.daysBefore != null
            ? `${t.daysBefore} روز قبل مراسم`
            : '—'
    return `<div class="sm-msg-tpl ${t.enabled === false ? 'is-off' : ''}">
      <div class="sm-msg-tpl-head">
        <label class="sm-check-row"><input type="checkbox" ${t.enabled !== false ? 'checked' : ''} data-sm-change-fn="SMMessaging.onToggleTemplate" data-sm-args='${JSON.stringify([t.id]).replace(/'/g, '&#39;')}'/>
          <strong>${SM.esc(t.name || '—')}</strong>
        </label>
        <div class="sm-msg-tpl-badges">
          ${SMUI.badge(aud, t.audience === 'bride' ? 'info' : t.audience === 'groom' ? 'success' : 'muted')}
          ${SMUI.badge(timing, 'warning')}
          ${SMUI.badge((t.channel || 'sms').toUpperCase(), 'info')}
        </div>
      </div>
      <p class="sm-msg-tpl-text">${SM.esc(t.text || '')}</p>
      <div class="sm-msg-tpl-actions">
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" title="ویرایش" ${SMEvents.attrs('SMMessaging.editTemplate', [t.id])}><i class="fas fa-pen"></i> ویرایش</button>
        <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" title="حذف" ${SMEvents.attrs('SMMessaging.deleteTemplate', [t.id])}><i class="fas fa-trash"></i> حذف</button>
      </div>
    </div>`
  },

  _scheduleTab(due) {
    if (!due.length) {
      return SMUI.empty('fa-calendar-check', 'امروز پیامی در صف نیست', 'قالب‌های فعال برای قراردادهای با تاریخ مراسم، خودکار اینجا نمایش داده می‌شوند')
    }
    return `<div class="sm-msg-schedule-actions">
        <button type="button" class="sm-btn sm-btn-primary" ${SMEvents.attrs('SMMessaging.runToday')}><i class="fas fa-paper-plane"></i> ارسال همه (${due.length})</button>
      </div>
      ${due.map(item => {
        const t = item.template
        const c = item.contract
        return `<div class="sm-msg-queue-item">
          <div class="sm-msg-queue-head">
            <strong>${SM.esc(MessagingShared.couple(c))}</strong>
            ${SMUI.badge(MessagingShared.AUDIENCE[t.audience] || t.audience, 'info')}
            ${SMUI.badge(t.name, 'muted')}
          </div>
          <div class="sm-msg-queue-meta">قرارداد ${SM.esc(c.contractNum || '—')} · ${SM.esc(c.eventDate || c.date || '')} · ${item.phones.map(p => SM.esc(p)).join('، ')}</div>
          <p>${SM.esc(item.text)}</p>
          <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" ${SMEvents.attrs('SMMessaging.sendOne', [t.id, c.id])}>ارسال این مورد</button>
        </div>`
      }).join('')}`
  },

  _sentTab(logs) {
    const chTabs = [
      { id: 'all', label: 'همه' },
      { id: 'sms', label: 'SMS' },
      { id: 'email', label: 'ایمیل' },
      { id: 'whatsapp', label: 'واتساپ' },
      { id: 'social', label: 'فضای مجازی' }
    ]
    return `
      ${SMUI.moduleSearch('messaging', 'جستجو — نام زوج، موبایل، متن، قالب...')}
      <div class="sm-msg-log-filters" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        ${chTabs.map(c =>
          `<button type="button" class="sm-btn sm-btn-sm ${this._channelFilter === c.id ? 'sm-btn-primary' : 'sm-btn-ghost'}" ${SMEvents.attrs('SMMessaging.setChannelFilter', [c.id])}>${c.label}</button>`
        ).join('')}
        ${logs.length ? `<button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" style="margin-right:auto" ${SMEvents.attrs('SMMessaging.clearLogs')}><i class="fas fa-trash"></i> پاک‌سازی لاگ</button>` : ''}
      </div>
      ${logs.length ? SMUI.table(
        ['عملیات', 'وضعیت', 'کانال', 'مشتری / زوج', 'گیرنده', 'قالب', 'پیام', 'تاریخ'],
        logs.slice(0, 100).map(l => `<tr>
          <td style="white-space:nowrap;min-width:120px">
            <button type="button" class="sm-btn sm-btn-sm sm-btn-primary" title="ارسال دوباره" ${SMEvents.attrs('SMMessaging.resendLog', [l.id])} data-sm-stop="1"><i class="fas fa-redo"></i></button>
            <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" title="ویرایش" ${SMEvents.attrs('SMMessaging.editLog', [l.id])} data-sm-stop="1"><i class="fas fa-pen"></i></button>
            <button type="button" class="sm-btn sm-btn-sm sm-btn-ghost" title="حذف" ${SMEvents.attrs('SMMessaging.deleteLog', [l.id])} data-sm-stop="1"><i class="fas fa-trash"></i></button>
          </td>
          <td>${SMUI.badge(l.status === 'sent' ? 'ارسال شد' : l.status === 'queued' ? 'در صف' : 'ناموفق', l.status === 'sent' ? 'success' : l.status === 'queued' ? 'warning' : 'danger')}${l.error ? `<div style="font-size:.68rem;color:var(--sm-danger);margin-top:4px;max-width:160px">${SM.esc(l.error)}</div>` : ''}</td>
          <td>${SMUI.badge((l.channel || 'sms').toUpperCase(), 'info')}</td>
          <td>${SM.esc(l.customerName || '—')}<br><span style="font-size:.7rem;color:var(--sm-text-muted)">${SM.esc(l.contractNum || '')}</span></td>
          <td dir="ltr">${SM.esc(l.to || '—')}</td>
          <td style="font-size:.75rem">${SM.esc(l.templateName || '—')}</td>
          <td style="max-width:220px;font-size:.78rem;line-height:1.5">${SM.esc((l.message || '').slice(0, 120))}${(l.message || '').length > 120 ? '…' : ''}</td>
          <td style="font-size:.72rem;white-space:nowrap">${SM.esc(l.sendDate || '—')}<br>${SM.esc(l.sendTime || '')}</td>
        </tr>`)
      ) : SMUI.empty('fa-inbox', 'هنوز پیامی ثبت نشده', 'با «ارسال امروز» یا ارسال دستی، اینجا مطمئن می‌شوید پیام برای مشتری رفته')}`
  },

  onToggleTemplate(id, _value, el) {
    const enabled = el ? !!el.checked : !!_value
    this.toggleTemplate(id, enabled)
  },

  toggleTemplate(id, enabled) {
    DB.update('smsTemplates', id, { enabled })
    SM.navigate('messaging')
  },

  resetTemplates() {
    if (!confirm('قالب‌های پیش‌فرض Studio M اضافه شوند؟ (قالب‌های موجود حذف نمی‌شوند)')) return
    const n = MessagingShared.ensureTemplates()
    SM.toast(n ? `${n} قالب اضافه شد` : 'همه قالب‌ها موجود بودند', 'success')
    SM.navigate('messaging')
  },

  editTemplate(id) {
    const t = id ? DB.find('smsTemplates', x => x.id === id) : null
    const catOpts = Object.entries(MessagingShared.CATEGORIES).map(([v, c]) => ({ value: v, label: c.label }))
    const audOpts = Object.entries(MessagingShared.AUDIENCE).map(([v, l]) => ({ value: v, label: l }))
    SMUI.modal(id ? 'ویرایش قالب' : 'قالب جدید', `
      ${SMUI.formField('نام', 'mt-name', { value: t?.name || '' })}
      ${SMUI.formField('دسته', 'mt-cat', { type: 'select', value: t?.category || 'one_month', options: catOpts })}
      ${SMUI.formField('مخاطب', 'mt-aud', { type: 'select', value: t?.audience || 'both', options: audOpts })}
      ${SMUI.formField('کانال', 'mt-ch', { type: 'select', value: t?.channel || 'sms', options: [
        { value: 'sms', label: 'SMS' }, { value: 'email', label: 'Email' },
        { value: 'whatsapp', label: 'WhatsApp' }, { value: 'social', label: 'Social' }
      ]})}
      ${SMUI.formField('روز قبل مراسم (شروع)', 'mt-days', { value: t?.daysBefore ?? '', dir: 'ltr', placeholder: 'مثلاً 60' })}
      ${SMUI.formField('پایان بازه (برای روزانه/هفتگی)', 'mt-end', { value: t?.rangeEnd ?? '', dir: 'ltr', placeholder: 'مثلاً 30' })}
      ${SMUI.formField('تکرار', 'mt-freq', { type: 'select', value: t?.frequency || 'once', options: [
        { value: 'once', label: 'یک‌بار' }, { value: 'daily', label: 'روزانه' }, { value: 'weekly', label: 'هفتگی' }
      ]})}
      ${SMUI.formField('متن ({studio} {groom} {bride} {couple} {eventDate} {venue} {daysLeft} {balance})', 'mt-text', { type: 'textarea', value: t?.text || '' })}`, {
      width: 560,
      onSave: () => {
        const d = SMUI.readForm(['mt-name', 'mt-cat', 'mt-aud', 'mt-ch', 'mt-days', 'mt-end', 'mt-freq', 'mt-text'])
        if (!d['mt-name'] || !d['mt-text']) return SM.toast('نام و متن الزامی است', 'error')
        const row = {
          name: d['mt-name'],
          category: d['mt-cat'],
          audience: d['mt-aud'],
          channel: d['mt-ch'],
          daysBefore: d['mt-days'] !== '' ? +d['mt-days'] : null,
          rangeEnd: d['mt-end'] !== '' ? +d['mt-end'] : null,
          frequency: d['mt-freq'] || 'once',
          enabled: t?.enabled !== false,
          text: d['mt-text']
        }
        if (t) DB.update('smsTemplates', t.id, row)
        else DB.insert('smsTemplates', { ...row, id: `tpl-custom-${Date.now()}`, builtin: false })
        SMUI.closeModal()
        SM.toast('ذخیره شد', 'success')
        SM.navigate('messaging')
      }
    })
  },

  deleteTemplate(id) {
    if (!confirm('این قالب حذف شود؟')) return
    DB.delete('smsTemplates', id)
    SM.toast('قالب حذف شد', 'success')
    SM.navigate('messaging')
  },

  deleteLog(id) {
    if (!id || !confirm('این رکورد لاگ حذف شود؟')) return
    DB.delete('commLogs', id)
    SM.toast('حذف شد', 'success')
    this.setTab('sent')
  },

  clearLogs() {
    if (!confirm('همه لاگ‌های ارسال پاک شوند؟')) return
    DB.set('commLogs', [])
    SM.toast('لاگ‌ها پاک شد', 'success')
    this.setTab('sent')
  },

  editLog(id) {
    const l = DB.find('commLogs', x => x.id === id)
    if (!l) return SM.toast('رکورد یافت نشد', 'error')
    SMUI.modal('ویرایش پیام', `
      ${SMUI.formField('گیرنده', 'ml-to', { value: l.to || '', dir: 'ltr' })}
      ${SMUI.formField('پیام', 'ml-body', { type: 'textarea', value: l.message || '' })}
      ${SMUI.formField('وضعیت', 'ml-status', { type: 'select', value: l.status || 'queued', options: [
        { value: 'queued', label: 'در صف' },
        { value: 'sent', label: 'ارسال شد' },
        { value: 'failed', label: 'ناموفق' }
      ]})}
    `, {
      width: 480,
      onSave: async () => {
        const d = SMUI.readForm(['ml-to', 'ml-body', 'ml-status'])
        if (!d['ml-to'] || !d['ml-body']) return SM.toast('گیرنده و پیام الزامی است', 'error')
        DB.update('commLogs', id, {
          to: d['ml-to'],
          message: d['ml-body'],
          status: d['ml-status'],
          error: d['ml-status'] === 'sent' ? '' : (l.error || '')
        })
        SMUI.closeModal()
        SM.toast('ذخیره شد', 'success')
        this.setTab('sent')
      },
      onDelete: () => {
        DB.delete('commLogs', id)
        SMUI.closeModal()
        SM.toast('حذف شد', 'success')
        this.setTab('sent')
      }
    })
  },

  async resendLog(id) {
    const l = DB.find('commLogs', x => x.id === id)
    if (!l) return SM.toast('رکورد یافت نشد', 'error')
    if ((l.channel || 'sms') !== 'sms') {
      return SM.toast('ارسال مجدد فقط برای SMS', 'warning')
    }
    if (typeof SmsProvider === 'undefined' || !SmsProvider.isConfigured()) {
      return SM.toast('SMS تنظیم نشده', 'error')
    }
    const res = await SmsProvider.sendStudio([l.to], l.message)
    DB.update('commLogs', id, {
      status: res?.ok ? 'sent' : 'failed',
      error: res?.ok ? '' : (res?.error || 'خطا'),
      sendDate: Utils.todayJalali(),
      sendTime: (() => {
        const d = new Date()
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      })()
    })
    if (res?.ok) SM.toast('دوباره ارسال شد', 'success')
    else {
      const err = res?.error || 'خطا'
      const hint = /unauth|401|not authenticated|Missing authorization/i.test(err)
        ? ' — اول تنظیمات → ابر را وارد شوید'
        : ''
      SM.toast(`ناموفق: ${err}${hint}`, 'error')
    }
    this.setTab('sent')
  },

  async runToday() {
    const r = await MessagingShared.runTodayCampaigns()
    SM.toast(r.sent ? `${r.sent} پیام ارسال شد` : r.total ? 'در صف ثبت شد — SMS را در تنظیمات وصل کنید' : 'صف خالی بود', r.failed ? 'warning' : 'success')
    SM.navigate('messaging')
  },

  async sendOne(templateId, contractId) {
    const tpl = DB.find('smsTemplates', t => t.id === templateId)
    const c = DB.find('contracts', x => x.id === contractId)
    if (!tpl || !c) return
    const phones = MessagingShared.audiencePhones(c, tpl.audience)
    const item = { template: tpl, contract: c, phones, text: MessagingShared.renderText(tpl, c), audience: tpl.audience }
    await MessagingShared.sendQueueItem(item)
    SM.toast('ارسال شد', 'success')
    SM.navigate('messaging')
  },

  sendManual() {
    const contracts = DB.active('contracts').filter(c => c.status !== 'cancelled')
    const cOpts = [{ value: '', label: '— بدون قرارداد —' }, ...contracts.map(c => ({
      value: c.id, label: `${MessagingShared.couple(c)} (${c.contractNum || c.id})`
    }))]
    SMUI.modal('ارسال دستی پیام', `
      ${SMUI.formField('کانال', 'mm-ch', { type: 'select', options: [
        { value: 'sms', label: 'SMS' }, { value: 'email', label: 'Email' },
        { value: 'whatsapp', label: 'WhatsApp' }, { value: 'social', label: 'Social' }
      ]})}
      ${SMUI.formField('قرارداد (اختیاری)', 'mm-contract', { type: 'select', options: cOpts })}
      ${SMUI.formField('موبایل / گیرنده', 'mm-to', { dir: 'ltr', placeholder: '09...' })}
      ${SMUI.formField('پیام', 'mm-body', { type: 'textarea' })}`, {
      width: 480,
      onSave: async () => {
        const d = SMUI.readForm(['mm-ch', 'mm-contract', 'mm-to', 'mm-body'])
        if (!d['mm-to'] || !d['mm-body']) return SM.toast('گیرنده و پیام الزامی است', 'error')
        const contract = d['mm-contract'] ? DB.find('contracts', c => c.id === d['mm-contract']) : null
        const ch = d['mm-ch'] || 'sms'
        if (ch === 'sms' && typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured()) {
          const res = await SmsProvider.sendStudio([d['mm-to']], d['mm-body'])
          MessagingShared.logOutbound({
            channel: ch, to: d['mm-to'], message: d['mm-body'], contract,
            status: res?.ok ? 'sent' : 'failed', error: res?.error || ''
          })
          SMUI.closeModal()
          if (res?.ok) SM.toast('پیامک ارسال شد', 'success')
          else {
            const err = res?.error || 'خطای نامشخص'
            const hint = /unauth|401|not authenticated|Missing authorization/i.test(err)
              ? ' — اول در تنظیمات → ابر Supabase وارد شوید'
              : ''
            SM.toast(`ارسال ناموفق: ${err}${hint}`, 'error')
          }
          this.setTab('sent')
          return
        } else {
          MessagingShared.logOutbound({
            channel: ch, to: d['mm-to'], message: d['mm-body'], contract,
            status: 'queued',
            error: ch === 'sms' ? 'SMS تنظیم نشده' : ''
          })
        }
        SMUI.closeModal()
        SM.toast(ch === 'sms' ? 'SMS تنظیم نیست — در صف ثبت شد' : 'ثبت شد (کانال هنوز غیرفعال)', ch === 'sms' ? 'warning' : 'success')
        this.setTab('sent')
      }
    })
  }
}

SMModules.messaging = {
  setTab(tab) { SMMessaging.setTab(tab) },
  render(el) { SMMessaging.render(el) },
  send() { SMMessaging.sendManual() }
}

window.SMMessaging = SMMessaging
