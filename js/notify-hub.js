/* ══════════════════════════════════════════════
   MAN — Notification Hub (اعلان + SMS)
   ══════════════════════════════════════════════ */

const NotifyHub = {
  _studioName() {
    return DB.get('studioInfo')?.name || AppConfig.DEFAULT_STUDIO_NAME
  },

  _adminPhones() {
    return DB.get('users')
      .filter(u => u.status === 'active' && (u.roles || []).some(r => {
        const n = normalizeRole(r)
        return n === 'studio_manager' || n === 'coordinator'
      }))
      .map(u => u.phone)
      .filter(Boolean)
  },

  _contractTeamPhones(contractId) {
    const projects = DB.filter('persProjects', p => p.contractId === contractId && p.accepted === true)
    const phones = new Set()
    projects.forEach(p => {
      if (p.personnelPhone) phones.add(p.personnelPhone)
      const person = DB.find('personnel', per => per.id === p.personnelId)
      if (person?.phone) phones.add(person.phone)
    })
    return [...phones]
  },

  _customerPhones(contract) {
    if (!contract) return []
    return [contract.groomPhone, contract.bridePhone, contract.phone].filter(Boolean)
  },

  notifyInApp(title, text, extra = {}) {
    DB.insert('notifications', {
      type: extra.type || 'alert',
      title,
      text,
      read: false,
      createdAt: Utils.todayJalali(),
      ...extra
    })
    if (typeof NotificationTicker !== 'undefined') {
      try { NotificationTicker._refreshQueue() } catch { /* */ }
    }
  },

  async sendSms(phones, text, meta = {}) {
    if (!phones.length || typeof SmsProvider === 'undefined') return { ok: false }
    if (!SmsProvider.isConfigured()) {
      if (typeof MessagingShared !== 'undefined' && meta.log !== false) {
        phones.forEach(phone => MessagingShared.logOutbound({ channel: 'sms', to: phone, message: text, ...meta, status: 'queued', error: 'SMS تنظیم نشده' }))
      }
      return { ok: false, error: 'SMS تنظیم نشده' }
    }
    const unique = [...new Set(phones.map(p => Utils.normalizePhone(p)).filter(p => /^09\d{9}$/.test(p)))]
    if (!unique.length) return { ok: false, error: 'شماره نامعتبر' }
    try {
      const res = await SmsProvider.sendStudio(unique, text)
      if (typeof MessagingShared !== 'undefined' && meta.log !== false) {
        unique.forEach(phone => MessagingShared.logOutbound({
          channel: 'sms', to: phone, message: text, ...meta,
          status: res?.ok ? 'sent' : 'failed', error: res?.error || ''
        }))
      }
      return res
    } catch (e) {
      console.warn('SMS failed:', e)
      return { ok: false, error: String(e) }
    }
  },

  async broadcast({ title, text, contractId, smsText, phones, notifyAdmin = true }) {
    this.notifyInApp(title, text, { contractId })

    const allPhones = new Set(phones || [])
    if (contractId) {
      const contract = DB.find('contracts', c => c.id === contractId)
      this._customerPhones(contract).forEach(p => allPhones.add(p))
      this._contractTeamPhones(contractId).forEach(p => allPhones.add(p))
    }
    if (notifyAdmin) this._adminPhones().forEach(p => allPhones.add(p))

    const msg = smsText || `${this._studioName()}\n${title}\n${text}`
    await this.sendSms([...allPhones], msg)
  },

  async projectStatusChanged(project, newStatus) {
    const label = PortalShared.STATUS_LABELS[newStatus] || newStatus
    const contract = DB.find('contracts', c => c.id === project.contractId)
    const couple = project.couple || `${contract?.groom || ''} و ${contract?.bride || ''}`
    await this.broadcast({
      title: '🔄 به‌روزرسانی پروژه',
      text: `${project.personnelName} — ${couple}: ${label}`,
      contractId: project.contractId,
      smsText: `${this._studioName()}\nپروژه ${couple}\nوضعیت: ${label}\nنقش: ${project.role}`
    })
  },

  async customerRequestSubmitted(req, contract) {
    const couple = `${contract?.groom || ''} و ${contract?.bride || ''}`
    const typeLabel = PortalShared.REQUEST_TYPES[req.type]?.label || 'درخواست'
    await this.broadcast({
      title: '📩 درخواست جدید مشتری',
      text: `${couple} — ${typeLabel}: ${req.text}`,
      contractId: contract?.id,
      smsText: `${this._studioName()}\nدرخواست مشتری (${couple})\n${typeLabel}: ${req.text.substring(0, 80)}`
    })
  },

  async consultationRequested({ name, phone, date, time, notes = '' }) {
    const title = '📅 درخواست مشاوره جدید'
    const text = `${name} — ${phone}\nتاریخ: ${date} · ساعت: ${time}${notes ? `\n${notes}` : ''}`
    this.notifyInApp(title, text, {
      type: 'consultation',
      phone,
      date,
      time,
      priority: 'high',
      route: 'bookings'
    })
    const phones = DB.get('users')
      .filter(u => u.status === 'active' && (u.roles || []).some(r => {
        const n = normalizeRole(r)
        return n === 'studio_manager' || n === 'system_admin' || n === 'office_secretary' || n === 'coordinator'
      }))
      .map(u => u.phone)
      .filter(Boolean)
    const sms = `${this._studioName()}\nمشاوره جدید\n${name} — ${phone}\n${date} ${time}`
    await this.sendSms(phones, sms, { log: true })
  },

  async customerRequestApproved(req, contract) {
    const couple = `${contract?.groom || ''} و ${contract?.bride || ''}`
    const typeLabel = PortalShared.REQUEST_TYPES[req.type]?.label || 'درخواست'
    const isPhotoHouse = ['photo_select', 'album', 'print'].includes(req.type)
    const dest = isPhotoHouse ? 'عکس‌خانه' : 'بخش تدوین'
    await this.broadcast({
      title: '✅ درخواست مشتری تأیید شد',
      text: `درخواست «${typeLabel}» برای ${couple} به ${dest} ارجاع شد.`,
      contractId: contract?.id,
      smsText: `${this._studioName()}\n${couple} عزیز\nدرخواست «${typeLabel}» شما تأیید و به ${dest} ارجاع شد.`
    })
  }
}

window.NotifyHub = NotifyHub
