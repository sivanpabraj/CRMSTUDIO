/* ══════════════════════════════════════════════
   MAN — Portal Shared Helpers
   ══════════════════════════════════════════════ */

const PortalShared = {
  STATUS_LABELS: {
    pending: 'در انتظار شروع',
    active: 'شروع کار',
    editing: 'در حال تدوین',
    revising: 'نیاز به اصلاح',
    rendering: 'در حال رندر',
    finished: 'آماده تحویل',
    delivered: 'تحویل شده',
    done: 'تسویه',
    rejected: 'رد شده'
  },

  STATUS_COLORS: {
    pending: '#F59E0B', active: '#3B82F6', editing: '#8B5CF6',
    revising: '#EF4444', rendering: '#06B6D4', finished: '#22C55E',
    delivered: '#22C55E', done: '#6B7280', rejected: '#EF4444'
  },

  ROLE_GROUPS: {
    field: ['photographer', 'photographer_clip', 'vid_venue', 'vid_clip', 'helishot', 'crane'],
    office: ['editor_venue', 'editor_clip', 'album_designer', 'colorist'],
    management: ['system_admin', 'studio_manager', 'office_secretary', 'inspector', 'coordinator']
  },

  CUSTOMER_PIPELINE: [
    { key: 'contract', label: 'ثبت قرارداد', icon: '📋' },
    { key: 'shooting', label: 'فیلمبرداری / عکاسی', icon: '📸' },
    { key: 'editing', label: 'در حال تدوین', icon: '✂️' },
    { key: 'ready', label: 'آماده تحویل', icon: '📦' },
    { key: 'delivered', label: 'تحویل نهایی', icon: '✅' }
  ],

  REQUEST_TYPES: {
    mp3: { label: 'تحویل MP3 مراسم', icon: '🎵' },
    music: { label: 'آهنگ درخواستی', icon: '🎶' },
    taste: { label: 'سلیقه و توضیحات شخصی', icon: '💬' },
    photo_select: { label: 'انتخاب عکس', icon: '🖼️' },
    album: { label: 'سفارش آلبوم / چاپ', icon: '📔' },
    print: { label: 'سفارش چاپ عکس', icon: '🖨️' },
    other: { label: 'سایر درخواست‌ها', icon: '📝' }
  },

  getDeadlineInfo(deadlineStr) {
    if (!deadlineStr) return null
    const days = Utils.daysUntil(deadlineStr)
    if (days === null) return null
    if (days < 0) return { text: `${Math.abs(days)} روز از مهلت گذشته`, urgent: true, overdue: true, days }
    if (days === 0) return { text: 'امروز مهلت تحویل', urgent: true, overdue: false, days: 0 }
    if (days <= 3) return { text: `${days} روز مانده به تحویل`, urgent: true, overdue: false, days }
    return { text: `${days} روز مانده به تحویل`, urgent: false, overdue: false, days }
  },

  getPersonnelRoleTypes(personnel) {
    const roles = normalizeRoles(personnel?.roles || [])
    const types = new Set()
    roles.forEach(r => {
      const t = getRole(r).type
      if (t === 'field' || t === 'office') types.add(t)
    })
    return types
  },

  filterProjectsByTab(projects, tab, personnel) {
    const roles = normalizeRoles(personnel?.roles || [])
    if (tab === 'all') return projects
    if (tab === 'photo') {
      const photoRoles = ['photographer', 'photographer_clip', 'editor_venue', 'album_designer', 'colorist']
      return projects.filter(p => photoRoles.includes(p.roleId) && roles.includes(p.roleId))
    }
    if (tab === 'combined') return projects.filter(p => roles.includes(p.roleId))
    const group = this.ROLE_GROUPS[tab]
    if (!group) return projects
    return projects.filter(p => group.includes(p.roleId) && roles.includes(p.roleId))
  },

  getProjectIssues(project, issues) {
    return (issues || []).filter(i =>
      i.status !== 'resolved' &&
      (i.personnelId === project.personnelId ||
        (i.contractId === project.contractId && !i.personnelId))
    )
  },

  isProblemProject(project, issues) {
    return project.status === 'revising' || this.getProjectIssues(project, issues).length > 0
  },

  getContractStage(contract, persProjects) {
    if (!contract) return 0
    if (contract.status === 'done' || contract.status === 'delivered') return 4
    const related = persProjects.filter(p => p.contractId === contract.id && p.accepted === true)
    if (!related.length) return 0
    if (related.every(p => p.status === 'delivered' || p.status === 'finished')) return 3
    if (related.some(p => ['editing', 'rendering', 'revising'].includes(p.status))) return 2
    if (related.some(p => p.status === 'active' || p.status === 'pending')) return 1
    return 1
  },

  /** صف انتظار: چند قرارداد قبل از شروع/تحویل این مشتری در صف هستند */
  getCustomerQueue(contract) {
    const all = DB.get('contracts').filter(c =>
      !['done', 'cancelled', 'delivered'].includes(c.status)
    )
    const sortKey = (c) => c.deliveryDate || c.eventDate || '9999/99/99'
    const sorted = [...all].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    const idx = sorted.findIndex(c => c.id === contract.id)
    const ahead = idx < 0 ? 0 : idx
    const stage = this.getContractStage(contract, DB.filter('persProjects', p => p.contractId === contract.id))

    const statusText = stage >= 2
      ? 'پروژه شما در حال انجام است — تیم استودیو روی آن کار می‌کند'
      : ahead === 0
        ? 'نوبت شماست! پروژه‌تان به‌زودی آغاز می‌شود'
        : ahead === 1
          ? '۱ قرارداد جلوی شما در صف است تا شروع پروژه شما'
          : `${Utils.fmtNum(ahead)} قرارداد جلوی شما در صف هستند تا شروع پروژه شما`

    return { ahead, position: idx + 1, total: sorted.length, statusText, stage, sorted }
  },

  getCustomerRequestStatus(req) {
    if (req.status === 'rejected') return 'رد شده توسط مدیریت'
    if (req.status !== 'sent_to_editing') return 'در انتظار بررسی مدیریت'
    if (['photo_select', 'album', 'print'].includes(req.type)) return 'تأیید — ارجاع به عکس‌خانه'
    return 'تأیید — ارجاع به بخش تدوین'
  },

  getCustomerCongrats(contract) {
    const bride = contract.bride || 'عروس گرامی'
    const groom = contract.groom || 'داماد گرامی'
    const studio = DB.get('studioInfo')?.name || AppConfig.DEFAULT_STUDIO_NAME
    const eventDate = contract.eventDate || ''
    return {
      title: `🎊 عروسی ${Utils.escapeHtml(bride)} و ${Utils.escapeHtml(groom)} مبارک!`,
      lines: [
        `${Utils.escapeHtml(groom)} محترم و ${Utils.escapeHtml(bride)} محترم، از اعتماد شما به ${Utils.escapeHtml(studio)} سپاسگزاریم.`,
        eventDate ? `مراسم شما در تاریخ ${eventDate} برگزار خواهد شد.` : 'آرزوی بهترین‌ها برای زندگی مشترکتان.',
        'در این بخش می‌توانید روند کار، زمان تحویل و وضعیت پروژه را به‌صورت لحظه‌ای مشاهده نمایید.'
      ]
    }
  },

  getCustomerLiveStatus(contract, persProjects) {
    const related = persProjects.filter(p => p.accepted === true)
    if (!related.length) return { label: 'در انتظار تخصیص تیم', icon: '⏳' }
    const editing = related.filter(p => ['editing', 'rendering', 'revising'].includes(p.status))
    if (editing.length) {
      const roles = editing.map(p => p.role).join('، ')
      return { label: `در حال تدوین — ${roles}`, icon: '✂️' }
    }
    if (related.every(p => p.status === 'delivered' || p.status === 'finished')) {
      return { label: 'آماده تحویل — با استودیو هماهنگ کنید', icon: '📦' }
    }
    if (related.some(p => p.status === 'active')) {
      return { label: 'تیم در حال کار روی مراسم شما', icon: '🎬' }
    }
    return { label: PortalShared.CUSTOMER_PIPELINE[this.getContractStage(contract, persProjects)]?.label || '—', icon: '📋' }
  },

  renderPipeline(stage, compact, steps) {
    const pipeline = steps || this.CUSTOMER_PIPELINE
    return `<div class="pipeline ${compact ? 'pipeline-compact' : ''}">
      ${pipeline.map((s, i) => `
        <div class="pipeline-step ${i <= stage ? 'done' : ''} ${i === stage ? 'current' : ''}">
          <div class="pipeline-dot">${s.icon}</div>
          <div class="pipeline-label">${s.label}</div>
        </div>
        ${i < pipeline.length - 1 ? `<div class="pipeline-line ${i < stage ? 'done' : ''}"></div>` : ''}
      `).join('')}
    </div>`
  },

  /** محاسبه حقوق ماهانه پرسنل — ماهانه + پروژه + درصد */
  normalizePayMonth(month) {
    if (!month) return ''
    const s = String(month).trim().replace(/-/g, '/')
    const p = Utils.parseJalali(s.length >= 7 ? s + '/01' : s)
    if (!p) return s.slice(0, 7)
    return Utils.formatJalali(p.jy, p.jm, 1).slice(0, 7)
  },

  monthLabel(month) {
    const m = this.normalizePayMonth(month)
    const p = Utils.parseJalali(m + '/01')
    if (!p) return m
    return `${Utils.jalaliMonthName(p.jm)} ${p.jy.toLocaleString('fa-IR')}`
  },

  calculatePayroll(personnelId, month) {
    const person = typeof personnelId === 'object'
      ? personnelId
      : DB.find('personnel', p => p.id === personnelId)
    const monthKey = this.normalizePayMonth(month)
    if (!person || !monthKey) return null

    const breakdown = {
      month: monthKey,
      monthLabel: this.monthLabel(monthKey),
      monthly: 0,
      projects: [],
      projectTotal: 0,
      percent: 0,
      percentBase: 0,
      percentRate: person.monthlyProjectPercent || 0,
      total: 0
    }

    if (person.payMonthly !== false) {
      breakdown.monthly = person.salaryMonthly || person.salary || 0
    }

    const projects = (DB.get('persProjects') || []).filter(p => {
      if (p.personnelId !== person.id) return false
      if (p.accepted !== true) return false
      if (p.payrollMonth === monthKey) return false
      const d = Utils.normJalali(p.eventDate || p.deadline || '')
      return d && d.startsWith(monthKey)
    })

    projects.forEach(p => {
      let gross = p.amount || 0
      if (!gross && person.payPerProject && person.roleAmounts) {
        const rid = typeof normalizeRole === 'function' ? normalizeRole(p.roleId || p.role) : (p.roleId || '')
        gross = person.roleAmounts[rid] || 0
      }
      const due = Math.max(0, gross - (p.paid || 0))
      if (!person.payPerProject && !due) return
      if (due <= 0 && !person.payPerProject) return
      breakdown.projects.push({
        id: p.id,
        couple: p.couple || '—',
        role: p.role || '—',
        eventDate: p.eventDate || '',
        amount: due || gross
      })
      breakdown.projectTotal += due || gross
    })

    if (person.payMonthlyPercent && person.monthlyProjectPercent) {
      const contracts = (DB.get('contracts') || []).filter(c => {
        if (c.status === 'cancelled') return false
        const d = Utils.normJalali(c.eventDate || c.date || '')
        return d && d.startsWith(monthKey)
      })
      breakdown.percentBase = contracts.reduce((s, c) => s + (c.total || 0), 0)
      breakdown.percent = Math.round(breakdown.percentBase * (person.monthlyProjectPercent / 100))
    }

    breakdown.total = breakdown.monthly + breakdown.projectTotal + breakdown.percent

    const existing = (DB.get('salaryPayments') || []).find(s => s.personId === person.id && s.month === monthKey)
    breakdown.alreadyPaid = !!existing
    breakdown.paymentRecord = existing || null

    return breakdown
  },

  getPayrollPayments(personnelId) {
    return (DB.get('salaryPayments') || [])
      .filter(p => p.personId === personnelId)
      .sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')))
  }
}

window.PortalShared = PortalShared
