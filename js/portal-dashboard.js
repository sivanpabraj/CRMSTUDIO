/* ══════════════════════════════════════════════
   MAN — Personnel Dashboard v2
   ══════════════════════════════════════════════ */

const PortalDashboard = {
  state: { tab: 'all', selectedProjectId: null },

  render(personnel, _user) {
    const issues = DB.get('issues') || []
    const allProjects = DB.filter('persProjects', p => p.personnelId === personnel.id)
    const tabProjects = PortalShared.filterProjectsByTab(allProjects, this.state.tab, personnel)
    const invitations = tabProjects.filter(p => p.accepted === null)
    const activeProjects = tabProjects.filter(p => p.accepted === true && !['done', 'delivered', 'rejected'].includes(p.status))
    const problemProjects = activeProjects.filter(p => PortalShared.isProblemProject(p, issues))
    const normalActive = activeProjects.filter(p => !PortalShared.isProblemProject(p, issues))
    const totalEarnings = allProjects.reduce((s, p) => s + (p.amount || 0), 0)
    const paidEarnings = allProjects.reduce((s, p) => s + (p.paid || 0), 0)

    const roleTypes = PortalShared.getPersonnelRoleTypes(personnel)
    const photoRoles = ['photographer', 'photographer_clip', 'editor_venue', 'album_designer', 'colorist']
    const hasPhotoRole = RolesHelper.normalize(personnel?.roles || []).some(r => photoRoles.includes(r))
    const tabs = [{ id: 'all', label: 'همه', icon: '📋' }]
    if (roleTypes.has('field')) tabs.push({ id: 'field', label: 'میدانی', icon: '📸' })
    if (roleTypes.has('office')) tabs.push({ id: 'office', label: 'دفتر / تدوین', icon: '✂️' })
    if (hasPhotoRole) tabs.push({ id: 'photo', label: PhotoHouse?.LABEL || 'عکس‌خانه', icon: '🖼️' })
    if (roleTypes.size > 1) tabs.push({ id: 'combined', label: 'ترکیبی', icon: '🔗' })

    const nearestDeadline = activeProjects
      .map(p => ({ p, d: PortalShared.getDeadlineInfo(p.deadline) }))
      .filter(x => x.d)
      .sort((a, b) => a.d.days - b.d.days)[0]

    const el = document.getElementById('portal-content')
    if (!el) return

    el.innerHTML = `
      ${nearestDeadline ? `
        <div class="portal-hero ${nearestDeadline.d.urgent ? 'urgent' : ''}">
          <h2>⏰ ${Utils.escapeHtml(nearestDeadline.d.text)}</h2>
          <p>تحویل پروژه <strong>${Utils.escapeHtml(nearestDeadline.p.couple)}</strong> — نقش: ${Utils.escapeHtml(nearestDeadline.p.role)}</p>
        </div>` : ''}

      <div class="portal-tabs">
        ${tabs.map(t => {
          const count = t.id === 'all' ? allProjects.filter(p => p.accepted !== false).length
            : PortalShared.filterProjectsByTab(allProjects, t.id, personnel).filter(p => p.accepted !== false).length
          return `<button class="portal-tab ${this.state.tab === t.id ? 'active' : ''}" onclick="PortalDashboard.setTab('${t.id}')">
            ${t.icon} ${t.label} <span class="tab-count">${count}</span>
          </button>`
        }).join('')}
      </div>

      <div class="portal-stats">
        <div class="portal-stat"><div class="num">${Utils.fmtNum(activeProjects.length)}</div><div class="lbl">فعال</div></div>
        <div class="portal-stat ${problemProjects.length ? 'danger' : ''}"><div class="num">${problemProjects.length}</div><div class="lbl">مشکل‌دار</div></div>
        <div class="portal-stat"><div class="num">${invitations.length}</div><div class="lbl">آفیش جدید</div></div>
        <div class="portal-stat"><div class="num">${Utils.fmtNum(totalEarnings)}</div><div class="lbl">درآمد</div></div>
      </div>

      ${invitations.length ? `
      <div class="portal-section">
        <h2>🔔 آفیش‌های جدید <span class="badge">${invitations.length}</span></h2>
        ${invitations.map(p => this._renderInvite(p)).join('')}
      </div>` : ''}

      ${this._renderEmploymentContracts(personnel)}

      ${this._renderAttendancePanel(personnel)}

      ${problemProjects.length ? `
      <div class="portal-section">
        <h2>⚠️ پروژه‌های مشکل‌دار <span class="badge">${problemProjects.length}</span></h2>
        ${problemProjects.map(p => this._renderProjectCard(p, issues, true)).join('')}
      </div>` : ''}

      <div class="portal-section">
        <h2>📋 پروژه‌های من</h2>
        ${normalActive.length ? normalActive.map(p => this._renderProjectCard(p, issues, false)).join('')
          : '<div class="empty-state"><i class="fas fa-folder-open"></i><p>پروژه فعالی در این بخش ندارید</p></div>'}
      </div>

      ${this.state.tab === 'photo' ? `
      <div class="portal-section" style="margin-top:-8px">
        <p style="font-size:12px;color:rgba(255,255,255,0.45);margin:0 0 12px">پروژه‌های عکاسی و آلبوم مرتبط با شما در بخش زیر نمایش داده می‌شود.</p>
      </div>` : ''}

      ${this.state.tab === 'photo' && typeof PhotoHouse !== 'undefined' ? this._renderPhotoHousePanel(personnel) : ''}

      <div class="portal-section">
        <h2>💰 درآمد و حقوق</h2>
        ${this._renderPayrollSummary(personnel)}
        <table class="earnings-table">
          <thead><tr><th>پروژه</th><th>نقش</th><th>مبلغ</th><th>پرداخت</th></tr></thead>
          <tbody>${allProjects.filter(p => p.accepted === true).map(p => `
            <tr>
              <td>${Utils.escapeHtml(p.couple)}</td>
              <td>${RolesHelper.emoji(p.roleId)} ${Utils.escapeHtml(p.role)}</td>
              <td class="amount">${Utils.fmtNum(p.amount)}</td>
              <td class="${p.paid > 0 ? 'paid' : 'pending'}">${p.paid > 0 ? '✓ پرداخت شده' : '⏳ انتظار'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div style="margin-top:12px;padding:12px;background:rgba(255,255,255,0.04);border-radius:12px;display:flex;justify-content:space-between;font-size:14px">
          <span style="color:rgba(255,255,255,0.5)">پرداخت شده:</span>
          <span style="color:#22C55E;font-weight:700">${Utils.fmtNum(paidEarnings)} تومان</span>
        </div>
      </div>`
  },

  _renderPayrollSummary(personnel) {
    const month = Utils.todayJalali().slice(0, 7)
    const calc = typeof PortalShared !== 'undefined' ? PortalShared.calculatePayroll(personnel, month) : null
    const payments = typeof PortalShared !== 'undefined'
      ? PortalShared.getPayrollPayments(personnel.id).slice(0, 3)
      : []

    if (!calc) return ''

    let statusHtml = ''
    if (calc.alreadyPaid && calc.paymentRecord) {
      statusHtml = `<div class="portal-pay-status paid">✓ ${Utils.escapeHtml(calc.monthLabel)} — ${Utils.fmtNum(calc.paymentRecord.amount)} تومان واریز شد</div>`
    } else if (calc.total > 0) {
      statusHtml = `<div class="portal-pay-status pending">⏳ ${Utils.escapeHtml(calc.monthLabel)} — ${Utils.fmtNum(calc.total)} تومان (در انتظار پرداخت مدیر)</div>`
    }

    const lines = []
    if (calc.monthly > 0) lines.push(`ماهانه: ${Utils.fmtNum(calc.monthly)}`)
    if (calc.projectTotal > 0) lines.push(`پروژه: ${Utils.fmtNum(calc.projectTotal)}`)
    if (calc.percent > 0) lines.push(`درصد: ${Utils.fmtNum(calc.percent)}`)

    return `${statusHtml ? statusHtml : ''}
      ${lines.length ? `<p style="font-size:12px;color:rgba(255,255,255,0.5);margin:0 0 12px">محاسبه ${Utils.escapeHtml(calc.monthLabel)}: ${lines.join(' · ')}</p>` : ''}
      ${payments.length ? `<div style="margin-bottom:12px;font-size:12px;color:rgba(255,255,255,0.45)">آخرین پرداخت‌ها: ${payments.map(p =>
        `${Utils.escapeHtml(p.monthLabel || p.month || '')} (${Utils.fmtNum(p.amount)})`).join(' · ')}</div>` : ''}`
  },

  _renderEmploymentContracts(personnel) {
    const pending = (DB.get('persContracts') || []).filter(c =>
      c.personnelId === personnel.id && c.type === 'employment' && c.status !== 'verified' && c.status !== 'rejected'
    )
    const verified = (DB.get('persContracts') || []).filter(c =>
      c.personnelId === personnel.id && c.type === 'employment' && c.status === 'verified'
    ).slice(-1)

    if (!pending.length && !verified.length) return ''

    let html = ''
    if (pending.length) {
      html += `<div class="portal-section"><h2>📄 قرارداد همکاری با استودیو</h2>`
      html += pending.map(c => `
        <div class="invite-card employment-contract-card">
          <div class="project-card-title">${Utils.escapeHtml(c.studioName || 'استودیو')} — قرارداد همکاری</div>
          <div class="project-card-meta" style="margin:8px 0">
            <span>📅 ${Utils.escapeHtml(c.sentAt || '—')}</span>
          </div>
          <p style="font-size:13px;line-height:1.6;margin:0 0 10px">${Utils.escapeHtml(c.paySummary || '')}</p>
          <p style="font-size:12px;color:rgba(255,255,255,0.55);margin:0 0 12px">با تأیید پیامکی، همکاری شما با استودیو رسمی می‌شود.</p>
          <div class="profile-form" style="margin-bottom:10px">
            <input class="profile-input ltr" id="emp-contract-code-${c.id}" placeholder="کد ۶ رقمی SMS" inputmode="numeric" maxlength="6"/>
          </div>
          <div class="actions">
            <button class="accept" onclick="Portal.verifyEmploymentContract('${c.id}')">✓ تأیید با کد SMS</button>
            <button class="reject" onclick="Portal.rejectEmploymentContract('${c.id}')">✕ رد</button>
          </div>
        </div>`).join('')
      html += '</div>'
    }
    if (verified.length) {
      const c = verified[0]
      html += `<div class="portal-section"><div class="portal-hero" style="margin-bottom:0">
        <h2>✓ قرارداد همکاری تأیید شد</h2>
        <p>${Utils.escapeHtml(c.studioName || '')} — ${Utils.escapeHtml(c.verification?.verifiedAt || c.sentAt || '')}</p>
      </div></div>`
    }
    return html
  },

  _renderAttendancePanel(personnel) {
    const att = typeof SMAttendance !== 'undefined' ? SMAttendance : null
    const today = Utils.todayJalali()
    const todayRecs = att
      ? att._forDate(today, personnel.id)
      : (DB.get('attendance') || []).filter(r => r.personnelId === personnel.id && Utils.normJalali(r.date) === today)
    const open = todayRecs.find(r => !r.checkOut && r.status !== 'absent' && r.status !== 'leave')
    const done = todayRecs.find(r => r.checkOut || r.status === 'completed')

    const t = Utils.parseJalaliToday()
    const monthRecs = att
      ? att._forMonth(t.jy, t.jm, personnel.id)
      : (DB.get('attendance') || []).filter(r => {
          const p = Utils.parseJalali(r.date)
          return r.personnelId === personnel.id && p && p.jy === t.jy && p.jm === t.jm
        })
    const presentCount = monthRecs.filter(r => !['absent', 'leave'].includes(r.status)).length
    const absentCount = monthRecs.filter(r => r.status === 'absent').length

    const recent = (DB.get('attendance') || [])
      .filter(r => r.personnelId === personnel.id)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 7)

    const statusLabel = { present: 'حاضر', completed: 'خروج ثبت شد', absent: 'غایب', late: 'تأخیر', leave: 'مرخصی', half: 'نیمه‌روز' }

    return `<div class="portal-section">
      <h2>🕐 حضور و غیاب</h2>
      <div class="portal-att-today">
        ${open ? `
          <div class="portal-att-status in">
            <span>ورود: <strong dir="ltr">${Utils.escapeHtml(open.checkIn || '—')}</strong></span>
            <button type="button" class="accept" onclick="Portal.attendanceCheckOut()">ثبت خروج</button>
          </div>` : done ? `
          <div class="portal-att-status done">
            <span>امروز: ورود <strong dir="ltr">${Utils.escapeHtml(done.checkIn || '—')}</strong> — خروج <strong dir="ltr">${Utils.escapeHtml(done.checkOut || '—')}</strong></span>
          </div>` : `
          <div class="portal-att-status">
            <span>امروز هنوز ورود ثبت نشده</span>
            <button type="button" class="accept" onclick="Portal.attendanceCheckIn()">ثبت ورود</button>
          </div>`}
      </div>
      <div class="portal-stats" style="margin:12px 0">
        <div class="portal-stat"><div class="num">${Utils.fmtNum(presentCount)}</div><div class="lbl">حاضر (${Utils.jalaliMonthName(t.jm)})</div></div>
        <div class="portal-stat ${absentCount ? 'danger' : ''}"><div class="num">${Utils.fmtNum(absentCount)}</div><div class="lbl">غایب</div></div>
      </div>
      ${recent.length ? `
        <table class="earnings-table portal-att-table">
          <thead><tr><th>تاریخ</th><th>ورود</th><th>خروج</th><th>وضعیت</th></tr></thead>
          <tbody>${recent.map(r => `
            <tr>
              <td>${Utils.escapeHtml(r.date || '—')}</td>
              <td dir="ltr">${Utils.escapeHtml(r.checkIn || '—')}</td>
              <td dir="ltr">${Utils.escapeHtml(r.checkOut || '—')}</td>
              <td>${Utils.escapeHtml(statusLabel[r.status] || r.status || '—')}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : '<p style="font-size:13px;color:rgba(255,255,255,0.45)">هنوز سابقه حضور ثبت نشده</p>'}
    </div>`
  },

  _renderInvite(p) {
    const dl = PortalShared.getDeadlineInfo(p.deadline)
    return `<div class="invite-card">
      <div class="project-card-top">
        <div>
          <div class="project-card-title">${RolesHelper.emoji(p.roleId)} ${Utils.escapeHtml(p.role)} — ${Utils.escapeHtml(p.couple)}</div>
          <div class="project-card-meta">
            <span>📅 ${p.eventDate || '—'}</span>
            <span>📍 ${Utils.escapeHtml(p.venue || '—')}</span>
            <span>💰 ${Utils.fmtNum(p.amount)} تومان</span>
            ${dl ? `<span class="deadline-pill ${dl.urgent ? 'danger' : 'ok'}">${dl.text}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="actions">
        <button class="accept" onclick="event.stopPropagation();Portal.acceptInvitation('${p.id}')">✓ قبول آفیش</button>
        <button class="reject" onclick="event.stopPropagation();Portal.rejectInvitation('${p.id}')">✕ رد</button>
      </div>
    </div>`
  },

  _renderProjectCard(p, issues, isProblem) {
    const dl = PortalShared.getDeadlineInfo(p.deadline)
    const projIssues = PortalShared.getProjectIssues(p, issues)
    const statusColor = PortalShared.STATUS_COLORS[p.status] || '#888'
    const statusLabel = PortalShared.STATUS_LABELS[p.status] || p.status
    const steps = ['active', 'editing', 'rendering', 'finished', 'delivered']
    const stepIdx = steps.indexOf(p.status)

    return `<div class="project-card ${isProblem ? 'problem' : ''}" onclick="PortalDashboard.openProject('${p.id}')">
      <div class="project-card-top">
        <div>
          <div class="project-card-title">${Utils.escapeHtml(p.couple)}</div>
          <div class="project-card-role">${RolesHelper.emoji(p.roleId)} ${Utils.escapeHtml(p.role)}</div>
        </div>
        <span class="status-pill" style="background:${statusColor}22;color:${statusColor}">${statusLabel}</span>
      </div>
      <div class="project-card-meta">
        <span>📅 مراسم: ${p.eventDate || '—'}</span>
        ${dl ? `<span class="deadline-pill ${dl.overdue ? 'danger' : dl.urgent ? 'warn' : 'ok'}">📦 ${dl.text}</span>` : ''}
      </div>
      ${projIssues.length ? `<div class="issue-box" style="margin-top:10px">⚠️ ${Utils.escapeHtml(projIssues[0].description)}</div>` : ''}
      <div class="project-progress">
        ${steps.map((s, i) => `<div class="project-progress-step ${i <= stepIdx ? 'done' : ''} ${i === stepIdx ? 'current' : ''}"></div>`).join('')}
      </div>
    </div>`
  },

  setTab(tab) {
    this.state.tab = tab
    const user = Portal.state.currentUser
    const personnel = DB.findPersonnelByPhone(user?.phone) || DB.findPersonnelByUserId(user?.id)
    if (personnel) this.render(personnel, user)
    else Utils.toast('پروفایل پرسنل یافت نشد', 'warning')
  },

  _renderPhotoHousePanel(personnel) {
    const contractIds = [...new Set(DB.filter('persProjects', p => p.personnelId === personnel.id).map(p => p.contractId))]
    const selections = DB.get('photoSelections').filter(s => contractIds.includes(s.contractId))
    const albums = DB.get('albums').filter(a => contractIds.includes(a.contractId))
    const orders = DB.get('printOrders').filter(o => contractIds.includes(o.customerId))
    if (!selections.length && !albums.length && !orders.length) return ''
    return `<div class="portal-section">
      <h2>🖼️ ${PhotoHouse.LABEL}</h2>
      ${selections.map(s => `<div class="invite-card" style="border-right-color:#8B5CF6">
        <div class="project-card-title">انتخاب عکس — ${Utils.escapeHtml(s.couple || '')}</div>
        <div class="project-card-meta"><span>${(s.selectedPhotos || []).length} / ${s.maxPhotos} عکس</span><span>${PhotoHouse.selectionStatusLabel(s.status)}</span></div>
      </div>`).join('')}
      ${albums.map(a => `<div class="invite-card" style="border-right-color:#C9A96E">
        <div class="project-card-title">📔 ${Utils.escapeHtml(a.title || 'آلبوم')}</div>
        <div class="project-card-meta"><span>${PhotoHouse.ALBUM_STATUS[a.status]?.label || a.status}</span><span>${Utils.fmtNum(a.totalAmount || 0)} تومان</span></div>
      </div>`).join('')}
      ${orders.map(o => `<div class="invite-card">
        <div class="project-card-title">${PhotoHouse.ORDER_TYPES[o.orderType]?.icon || '🖨️'} ${PhotoHouse.ORDER_TYPES[o.orderType]?.label || 'سفارش'}</div>
        <div class="project-card-meta">${(o.items || []).map(i => PhotoHouse.formatItemLine(i)).join(' | ')}</div>
      </div>`).join('')}
    </div>`
  },

  openProject(projectId) {
    if (document.getElementById('portal-project-modal')) return
    if (!Auth.ownsPersonnelProject(projectId)) {
      Utils.toast('دسترسی به این پروژه ندارید', 'error')
      return
    }
    const p = DB.find('persProjects', x => x.id === projectId)
    if (!p) { Utils.toast('پروژه یافت نشد', 'error'); return }
    const issues = PortalShared.getProjectIssues(p, DB.get('issues'))
    const statuses = [
      { v: 'active', l: '🚀 شروع کار' },
      { v: 'editing', l: '✂️ در حال تدوین' },
      { v: 'rendering', l: '🎬 در حال رندر' },
      { v: 'revising', l: '⚠️ نیاز به اصلاح' },
      { v: 'finished', l: '✅ آماده تحویل' },
      { v: 'delivered', l: '📦 تحویل داده شد' }
    ]

    const overlay = document.createElement('div')
    overlay.className = 'portal-modal-overlay open'
    overlay.id = 'portal-project-modal'
    overlay.innerHTML = `
      <div class="portal-modal" onclick="event.stopPropagation()">
        <h3>${Utils.escapeHtml(p.couple)}</h3>
        <div class="portal-modal-sub">${RolesHelper.emoji(p.roleId)} ${Utils.escapeHtml(p.role)} — ${p.eventDate || ''}</div>
        ${issues.length ? `<div class="issue-box">${issues.map(i => `⚠️ ${Utils.escapeHtml(i.description)}`).join('<br>')}</div>` : ''}
        ${PortalShared.getDeadlineInfo(p.deadline) ? `<div class="portal-hero" style="margin-bottom:16px;padding:14px"><p style="margin:0">📦 ${PortalShared.getDeadlineInfo(p.deadline).text}</p></div>` : ''}
        <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:10px">وضعیت کار را انتخاب کنید:</div>
        <div class="status-grid" id="status-grid">
          ${statuses.map(s => `
            <button class="status-option ${p.status === s.v ? 'selected' : ''} ${s.v === 'finished' || s.v === 'delivered' ? 'done-opt' : ''}"
              data-status="${s.v}" onclick="PortalDashboard.selectStatus('${s.v}')">${s.l}</button>`).join('')}
        </div>
        <button class="portal-btn portal-btn-success" onclick="PortalDashboard.saveStatus('${projectId}')">💾 ذخیره وضعیت</button>
        <button class="portal-btn portal-btn-ghost" onclick="PortalDashboard.closeModal()">بستن</button>
      </div>`
    overlay.onclick = () => this.closeModal()
    document.body.appendChild(overlay)
    this._selectedStatus = p.status
  },

  _selectedStatus: null,

  selectStatus(status) {
    this._selectedStatus = status
    document.querySelectorAll('#status-grid .status-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.status === status)
    })
  },

  async saveStatus(projectId) {
    if (!this._selectedStatus) { Utils.toast('وضعیت را انتخاب کنید', 'warning'); return }
    Portal.updateProjectStatus(projectId, this._selectedStatus)
    this.closeModal()
  },

  closeModal() {
    document.getElementById('portal-project-modal')?.remove()
    this._selectedStatus = null
  }
}

window.PortalDashboard = PortalDashboard
