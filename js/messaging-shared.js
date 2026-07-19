/* ══════════════════════════════════════════════
   پیام‌رسانی — قالب‌ها، زمان‌بندی، لاگ ارسال
   ══════════════════════════════════════════════ */

const MessagingShared = {
  CHANNELS: {
    sms: { label: 'پیامک (SMS)', icon: 'fa-sms', color: '#0071E3' },
    email: { label: 'ایمیل', icon: 'fa-envelope', color: '#5856D6' },
    whatsapp: { label: 'واتساپ', icon: 'fa-brands fa-whatsapp', color: '#25D366' },
    social: { label: 'فضای مجازی', icon: 'fa-share-nodes', color: '#FF9500' }
  },

  CATEGORIES: {
    welcome: { label: 'خوش‌آمد و قرارداد', icon: 'fa-handshake' },
    payment: { label: 'بیعانه و پرداخت', icon: 'fa-coins' },
    two_months: { label: 'دو ماه قبل مراسم', icon: 'fa-calendar' },
    one_month: { label: 'یک ماه قبل مراسم', icon: 'fa-calendar-days' },
    two_weeks: { label: 'دو هفته قبل', icon: 'fa-clock' },
    one_week: { label: 'یک هفته قبل', icon: 'fa-bell' },
    final_days: { label: 'روزهای پایانی', icon: 'fa-heart' },
    logistics: { label: 'لوازم و تالار / کلیپ', icon: 'fa-box' }
  },

  AUDIENCE: {
    bride: 'عروس',
    groom: 'داماد',
    both: 'هر دو',
    customer: 'مشتری'
  },

  DEFAULT_TEMPLATES: [
    {
      id: 'tpl-welcome-both',
      name: 'خوش‌آمد — ثبت قرارداد',
      category: 'welcome',
      channel: 'sms',
      audience: 'both',
      daysBefore: null,
      trigger: 'on_contract',
      frequency: 'once',
      enabled: true,
      text: '{studio} — {couple} عزیز، قرارداد شماره {contractNum} ثبت شد. تاریخ مراسم: {eventDate}. تیم {studio} در کنار شماست. سؤال دارید با ما تماس بگیرید.'
    },
    {
      id: 'tpl-deposit-reminder',
      name: 'یادآوری بیعانه',
      category: 'payment',
      channel: 'sms',
      audience: 'both',
      daysBefore: 45,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {couple} عزیز، یادآوری پرداخت بیعانه / مانده قرارداد {contractNum}. مانده تقریبی: {balance} تومان. لطفاً هماهنگی مالی را انجام دهید.'
    },
    {
      id: 'tpl-deposit-10d',
      name: 'یادآوری مانده — ۱۰ روز قبل',
      category: 'payment',
      channel: 'sms',
      audience: 'both',
      daysBefore: 10,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {couple} عزیز، ۱۰ روز تا مراسم باقی است. لطفاً تسویه مانده قرارداد ({balance} تومان) را انجام دهید.'
    },
    {
      id: 'tpl-bride-beauty-60',
      name: 'عروس — عمل زیبایی ۲ ماه قبل',
      category: 'two_months',
      channel: 'sms',
      audience: 'bride',
      daysBefore: 60,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {bride} عزیز، اگر قرار است روی صورت عمل زیبایی، تزریق یا لیزر انجام دهید، حداکثر تا ۲ ماه قبل مراسم ({eventDate}) برنامه‌ریزی کنید تا پوست در روز عروسی آماده باشد.'
    },
    {
      id: 'tpl-bride-sleep-60',
      name: 'عروس — خواب منظم (شروع ۲ ماه قبل)',
      category: 'two_months',
      channel: 'sms',
      audience: 'bride',
      daysBefore: 60,
      rangeEnd: 30,
      frequency: 'weekly',
      enabled: true,
      text: '{studio} — {bride} عزیز، از دو ماه قبل مراسم شب‌ها زود بخوابید و استراحت کافی داشته باشید. پوست و چهره‌تان در روز عروسی درخشان‌تر می‌شود. ({daysLeft} روز مانده)'
    },
    {
      id: 'tpl-groom-suit-60',
      name: 'داماد — سفارش کت و شلوار',
      category: 'two_months',
      channel: 'sms',
      audience: 'groom',
      daysBefore: 60,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {groom} عزیز، لطفاً نسبت به سفارش کت و شلوار رسمی خود اقدام کنید. حداقل ۶۰ روز قبل مراسم زمان لازم است. در صورت نیاز راهنمایی می‌دهیم.'
    },
    {
      id: 'tpl-groom-shoes-30',
      name: 'داماد — کفش رسمی',
      category: 'one_month',
      channel: 'sms',
      audience: 'groom',
      daysBefore: 30,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {groom} عزیز، کفش رسمی با پاشنه حدود ۳ تا ۵ سانتی‌متر تهیه کنید. از یک ماه قبل آماده باشید تا روز مراسم راحت باشید.'
    },
    {
      id: 'tpl-bride-beauty-30',
      name: 'عروس — مهلت عمل زیبایی',
      category: 'one_month',
      channel: 'sms',
      audience: 'bride',
      daysBefore: 30,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {bride} عزیز، مهلت عمل‌های زیبایی و جوانسازی پوست تا یک ماه قبل مراسم است. بعد از این تاریخ عمل جدید توصیه نمی‌شود.'
    },
    {
      id: 'tpl-bride-exercise-stop',
      name: 'عروس — قطع ورزش سنگین',
      category: 'one_week',
      channel: 'sms',
      audience: 'bride',
      daysBefore: 5,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {bride} عزیز، از ۴–۵ روز قبل مراسم ورزش سنگین و بدنسازی را قطع کنید. بدن استراحت کند و در روز عروسی سرحال باشید.'
    },
    {
      id: 'tpl-groom-pickup-suit',
      name: 'داماد — تحویل کت از منزل',
      category: 'one_week',
      channel: 'sms',
      audience: 'groom',
      daysBefore: 3,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {groom} عزیز، ۲–۳ روز دیگر برای دریافت کت و لوازم از منزل شما می‌آییم. لطفاً کت، پیراهن و کفش را آماده کنید. هماهنگی: {studio}.'
    },
    {
      id: 'tpl-dance-14',
      name: 'تمرین رقص — دو هفته قبل',
      category: 'two_weeks',
      channel: 'sms',
      audience: 'both',
      daysBefore: 14,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {couple} عزیز، اگر رقص ورودی دارید، دو هفته قبل مراسم تمرین منظم را ادامه دهید. سرعت و هماهنگی مهم است.'
    },
    {
      id: 'tpl-dance-7',
      name: 'تمرین رقص — یک هفته قبل',
      category: 'one_week',
      channel: 'sms',
      audience: 'both',
      daysBefore: 7,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {couple} عزیز، یک هفته تا مراسم — رقص را با لباس نزدیک به روز عروسی یک‌بار کامل تمرین کنید.'
    },
    {
      id: 'tpl-venue-equipment',
      name: 'وسایل مورد نیاز تالار',
      category: 'logistics',
      channel: 'sms',
      audience: 'both',
      daysBefore: 7,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {couple} عزیز، لطفاً وسایل تزئینی تالار، گل، شمع و هر لوازم خاصی که باید در کلیپ باشد را لیست کنید و به ما اطلاع دهید. تالار: {venue}.'
    },
    {
      id: 'tpl-clip-props',
      name: 'لوازم همراه کلیپ',
      category: 'logistics',
      channel: 'sms',
      audience: 'both',
      daysBefore: 5,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {couple} عزیز، اگر وسیله خاصی (عکس childhood، حلقه، هدیه، ماشین...) باید در کلیپ باشد، ۵ روز قبل لیست را برای تیم فیلم‌برداری بفرستید.'
    },
    {
      id: 'tpl-weekly-checkin',
      name: 'پیگیری هفتگی — یک ماه مانده',
      category: 'one_month',
      channel: 'sms',
      audience: 'both',
      daysBefore: 30,
      rangeEnd: 7,
      frequency: 'weekly',
      enabled: true,
      text: '{studio} — {couple} عزیز، {daysLeft} روز تا مراسم ({eventDate}). همه چیز طبق برنامه پیش می‌رود؟ سؤالی دارید با ما در میان بگذارید.'
    },
    {
      id: 'tpl-35-days',
      name: 'یادآوری — ۵ هفته قبل',
      category: 'two_weeks',
      channel: 'sms',
      audience: 'both',
      daysBefore: 35,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {couple} عزیز، ۵ هفته تا مراسم. لطفاً برنامه آرایش، لباس، رقص و هماهنگی تالار را مرور کنید.'
    },
    {
      id: 'tpl-14-days',
      name: 'یادآوری — دو هفته قبل',
      category: 'two_weeks',
      channel: 'sms',
      audience: 'both',
      daysBefore: 14,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {couple} عزیز، دو هفته تا روز بزرگ! {eventDate} — تالار: {venue}. تیم ما آماده است.'
    },
    {
      id: 'tpl-7-days',
      name: 'یادآوری — یک هفته قبل',
      category: 'one_week',
      channel: 'sms',
      audience: 'both',
      daysBefore: 7,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {couple} عزیز، یک هفته تا مراسم! استراحت کافی، آب کافی، و شاد باشید. هر هماهنگی آخر را با ما چک کنید.'
    },
    {
      id: 'tpl-1-day',
      name: 'فردای مراسم — آرزوی موفقیت',
      category: 'final_days',
      channel: 'sms',
      audience: 'both',
      daysBefore: 1,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {couple} عزیز، فردا روز شماست! آرام باشید، بخوابید، صبح با انرژی آماده شوید. تیم {studio} در کنار شماست.'
    },
    {
      id: 'tpl-event-day',
      name: 'روز مراسم',
      category: 'final_days',
      channel: 'sms',
      audience: 'both',
      daysBefore: 0,
      frequency: 'once',
      enabled: true,
      text: '{studio} — {couple} عزیز، امروز روز زیبای شماست! تیم ما در راه است. روزتان پر از شادی 🌸'
    }
  ],

  ensureTemplates() {
    const existing = DB.get('smsTemplates') || []
    const ids = new Set(existing.map(t => t.id))
    let added = 0
    this.DEFAULT_TEMPLATES.forEach(t => {
      if (ids.has(t.id)) return
      DB.insert('smsTemplates', { ...t, builtin: true })
      added++
    })
    return added
  },

  studioName() {
    return DB.get('studioInfo')?.name || AppConfig.DEFAULT_STUDIO_NAME || 'Studio M'
  },

  couple(c) {
    if (c.couple) return c.couple
    const b = c.bride || '', g = c.groom || ''
    return b && g ? `${b} و ${g}` : b || g || '—'
  },

  balance(c) {
    return Math.max(0, (c.total || 0) - (c.deposit || 0) - (c.paid || 0))
  },

  renderText(template, contract) {
    const c = contract || {}
    const daysLeft = Utils.daysUntil(c.eventDate || c.date)
    const map = {
      '{studio}': this.studioName(),
      '{groom}': c.groom || 'داماد',
      '{bride}': c.bride || 'عروس',
      '{couple}': this.couple(c),
      '{contractNum}': c.contractNum || c.id || '—',
      '{eventDate}': c.eventDate || c.date || '—',
      '{venue}': c.venue || '—',
      '{daysLeft}': daysLeft != null ? String(daysLeft) : '—',
      '{balance}': this.balance(c).toLocaleString('fa-IR')
    }
    let text = template.text || ''
    Object.entries(map).forEach(([k, v]) => { text = text.split(k).join(v) })
    return text
  },

  audiencePhones(contract, audience) {
    if (!contract) return []
    const groom = contract.groomPhone || contract.phoneGroom || contract.phone
    const bride = contract.bridePhone || contract.phoneBride
    if (audience === 'groom') return groom ? [groom] : []
    if (audience === 'bride') return bride ? [bride] : []
    const set = new Set([groom, bride, contract.phone].filter(Boolean))
    return [...set]
  },

  dedupeKey(templateId, contractId, date) {
    return `${templateId}|${contractId}|${date || Utils.todayJalali()}`
  },

  wasSent(templateId, contractId, date) {
    const key = this.dedupeKey(templateId, contractId, date)
    return (DB.get('commLogs') || []).some(l => l.dedupeKey === key && l.status !== 'failed')
  },

  shouldSendToday(template, contract) {
    if (!template.enabled) return false
    if (contract.status === 'cancelled') return false
    const eventDate = contract.eventDate || contract.date
    if (!eventDate && template.trigger !== 'on_contract') return false

    if (template.trigger === 'on_contract') return false

    const days = Utils.daysUntil(eventDate)
    if (days === null || days < 0) return false

    const start = template.daysBefore
    const end = template.rangeEnd != null ? template.rangeEnd : template.daysBefore

    if (template.frequency === 'once') {
      return days === start
    }
    if (template.frequency === 'daily') {
      return days <= start && days >= end
    }
    if (template.frequency === 'weekly') {
      if (days > start || days < end) return false
      return (start - days) % 7 === 0
    }
    return false
  },

  dueToday() {
    this.ensureTemplates()
    const templates = (DB.get('smsTemplates') || []).filter(t => t.enabled !== false && (t.channel || 'sms') === 'sms')
    const contracts = (DB.active('contracts') || []).filter(c => c.status !== 'cancelled')
    const today = Utils.todayJalali()
    const queue = []

    templates.forEach(tpl => {
      contracts.forEach(c => {
        if (!this.shouldSendToday(tpl, c)) return
        if (this.wasSent(tpl.id, c.id, today)) return
        const phones = this.audiencePhones(c, tpl.audience || 'both')
        if (!phones.length) return
        queue.push({
          template: tpl,
          contract: c,
          phones,
          text: this.renderText(tpl, c),
          audience: tpl.audience || 'both'
        })
      })
    })
    return queue
  },

  logOutbound({ channel, to, message, contract, template, audience, status, error }) {
    const today = Utils.todayJalali()
    const d = new Date()
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    DB.insert('commLogs', {
      channel: channel || 'sms',
      to: to || '',
      message: message || '',
      status: status || 'sent',
      error: error || '',
      contractId: contract?.id || '',
      contractNum: contract?.contractNum || '',
      customerName: contract ? this.couple(contract) : '',
      templateId: template?.id || '',
      templateName: template?.name || '',
      audience: audience || '',
      category: template?.category || '',
      dedupeKey: template?.id && contract?.id ? this.dedupeKey(template.id, contract.id, today) : '',
      sendDate: today,
      sendTime: time,
      createdAt: d.toISOString()
    })
  },

  async sendQueueItem(item) {
    const { template, contract, phones, text, audience } = item
    const channel = template.channel || 'sms'
    const today = Utils.todayJalali()
    if (this.wasSent(template.id, contract.id, today)) {
      return { ok: true, skipped: true }
    }

    if (channel === 'sms') {
      let ok = true
      let err = ''
      if (typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured()) {
        const res = await SmsProvider.sendStudio(phones, text)
        ok = !!res?.ok
        err = res?.error || ''
      } else {
        ok = false
        err = 'پنل SMS تنظیم نشده — فقط در لاگ ثبت شد'
      }
      phones.forEach(phone => {
        this.logOutbound({
          channel: 'sms', to: phone, message: text, contract, template, audience,
          status: ok ? 'sent' : 'queued',
          error: err
        })
      })
      return { ok, error: err }
    }

    phones.forEach(phone => {
      this.logOutbound({
        channel, to: phone, message: text, contract, template, audience,
        status: 'queued',
        error: `${this.CHANNELS[channel]?.label || channel} — اتصال API در آینده`
      })
    })
    return { ok: true, queued: true }
  },

  async runTodayCampaigns() {
    const queue = this.dueToday()
    let sent = 0
    let failed = 0
    for (const item of queue) {
      const res = await this.sendQueueItem(item)
      if (res.skipped) continue
      if (res.ok) sent++
      else failed++
    }
    return { sent, failed, total: queue.length }
  },

  channelStatus(channel) {
    if (channel === 'sms') {
      const ok = typeof SmsProvider !== 'undefined' && SmsProvider.isConfigured()
      return { configured: ok, label: ok ? 'متصل' : 'نیاز به تنظیم API' }
    }
    if (channel === 'email') {
      const info = DB.get('studioInfo') || {}
      return { configured: !!info.emailSmtp, label: info.emailSmtp ? 'متصل' : 'به‌زودی' }
    }
    if (channel === 'whatsapp') {
      const info = DB.get('studioInfo') || {}
      return { configured: !!info.whatsappApi, label: info.whatsappApi ? 'متصل' : 'به‌زودی' }
    }
    if (channel === 'social') {
      const info = DB.get('studioInfo') || {}
      const has = !!(info.socialInstagram || info.socialTelegram)
      return { configured: has, label: has ? 'تنظیم شده' : 'لینک در تنظیمات' }
    }
    return { configured: false, label: '—' }
  },

  logsFiltered(channel, q) {
    let list = (DB.get('commLogs') || []).slice().reverse()
    if (channel && channel !== 'all') list = list.filter(l => l.channel === channel)
    if (q) {
      const s = q.toLowerCase()
      list = list.filter(l =>
        [l.to, l.message, l.customerName, l.templateName, l.contractNum, l.sendDate].join(' ').toLowerCase().includes(s)
      )
    }
    return list
  },

  countByChannel() {
    const logs = DB.get('commLogs') || []
    const out = { sms: 0, email: 0, whatsapp: 0, social: 0 }
    logs.forEach(l => { if (out[l.channel] != null) out[l.channel]++ })
    return out
  }
}

window.MessagingShared = MessagingShared
