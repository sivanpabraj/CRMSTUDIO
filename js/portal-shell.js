/* ══════════════════════════════════════════════
   Studio M — Personnel Portal Shell
   ══════════════════════════════════════════════ */

Object.assign(Portal, {
  renderPortal() {
    const user = Auth.getUser()
    if (!user) { window.location.href = 'index.html'; return }
    if (typeof Access !== 'undefined' && Access.canAccessStudioM?.(user)) {
      window.location.href = 'studio-m/'
      return
    }
    const personnel = DB.findPersonnelByUserId(user.id) || DB.findPersonnelByPhone(user.phone)
    if (!personnel) {
      Auth.logout()
      window.location.href = 'index.html?view=portal'
      return
    }
    this.state.currentUser = user
    const allowedPortalType = user.portalType === 'staff' || Access?.isStaffOnly?.(user) || Access?.isPersonnel?.(user)
    if (!allowedPortalType) {
      window.location.href = 'index.html'
      return
    }
    document.body.classList.add('portal-app')
    document.body.classList.remove('auth-screen')
    document.getElementById('glass-rail')?.remove()
    this.renderPortalShell()
    this.showSection(this.state.currentSection || 'overview')
  },

  renderPortalShell() {
    const user = this.state.currentUser
    if (!user) return
    const personnel = DB.findPersonnelByUserId(user.id) || DB.findPersonnelByPhone(user.phone)
    if (!personnel) { Auth.logout(); window.location.href = 'index.html?view=portal'; return }
    const displayName = personnel?.name || user.name
    const badge = typeof Access !== 'undefined' ? Access.getRoleBadge(user) : { emoji: '👤', title: 'پرسنل' }
    const unreadMsgs = typeof PortalMessages !== 'undefined'
      ? PortalMessages.unreadCount(user)
      : 0
    const typedAssignments = window.ErpRuntime?.hasTypedData?.()
      ? window.ErpRuntime.state().assignments.filter(a => a.userId === user.id)
      : window.ErpRuntime?.requiresAuthority?.() ? [] : null
    const pendingInvites = typedAssignments
      ? typedAssignments.filter(a => a.status === 'offered').length
      : personnel ? DB.filter('persProjects', p => p.personnelId === personnel.id && p.accepted === null).length : 0

    document.getElementById('portal-app').innerHTML = `
      <div class="portal-shell">
        <header class="portal-header">
          <button type="button" class="profile-header-tap user-info" data-csp-action="Portal.showSection" data-csp-arg="profile" aria-label="پروفایل">
            <div class="avatar">${Utils.escapeHtml((displayName || '?').charAt(0))}</div>
            <div>
              <div class="name">${Utils.escapeHtml(displayName || '')}</div>
              <div class="role">${badge.emoji} ${Utils.escapeHtml(badge.title)} — پورتال پرسنل</div>
            </div>
          </button>
          <div class="portal-header-actions">
            <button type="button" class="portal-header-btn" data-csp-action="GlassTheme.openPicker" title="ظاهر" aria-label="ظاهر">
              <i class="fas fa-wand-magic-sparkles"></i>
            </button>
            <button type="button" class="logout-btn" data-csp-action="Portal.logout">خروج</button>
          </div>
        </header>
        <main class="portal-content" id="portal-content" aria-live="polite"></main>
        <nav class="portal-bottom-nav" aria-label="منوی پرسنل">
          <button type="button" class="portal-nav-item${this.state.currentSection === 'overview' ? ' active' : ''}" data-csp-action="Portal.showSection" data-csp-arg="overview">
            <i class="fas fa-th-large"></i><span>پروژه‌ها</span>
            ${pendingInvites ? `<span class="portal-nav-badge">${pendingInvites}</span>` : ''}
          </button>
          <button type="button" class="portal-nav-item${this.state.currentSection === 'messages' ? ' active' : ''}" data-csp-action="Portal.showSection" data-csp-arg="messages">
            <i class="fas fa-comments"></i><span>پیام‌ها</span>
            ${unreadMsgs ? `<span class="portal-nav-badge">${unreadMsgs}</span>` : ''}
          </button>
          <button type="button" class="portal-nav-item${this.state.currentSection === 'profile' ? ' active' : ''}" data-csp-action="Portal.showSection" data-csp-arg="profile">
            <i class="fas fa-user"></i><span>پروفایل</span>
          </button>
        </nav>
      </div>`

    if (typeof GlassTheme !== 'undefined') GlassTheme.setScope?.('portal')
    if (typeof NotificationTicker !== 'undefined') {
      NotificationTicker.init('portal')
    }
  },

  refreshNavBadges() {
    const user = this.state.currentUser
    if (!user) return
    const personnel = DB.findPersonnelByUserId(user.id) || DB.findPersonnelByPhone(user.phone)
    const typedAssignments = window.ErpRuntime?.hasTypedData?.()
      ? window.ErpRuntime.state().assignments.filter(a => a.userId === user.id)
      : window.ErpRuntime?.requiresAuthority?.() ? [] : null
    const pendingInvites = typedAssignments
      ? typedAssignments.filter(a => a.status === 'offered').length
      : personnel ? DB.filter('persProjects', p => p.personnelId === personnel.id && p.accepted === null).length : 0
    const unreadMsgs = typeof PortalMessages !== 'undefined'
      ? PortalMessages.unreadCount(user)
      : 0
    const items = document.querySelectorAll('.portal-nav-item')
    const setBadge = (idx, count) => {
      const el = items[idx]
      if (!el) return
      el.querySelector('.portal-nav-badge')?.remove()
      if (count > 0) {
        const badge = document.createElement('span')
        badge.className = 'portal-nav-badge'
        badge.textContent = count
        el.appendChild(badge)
      }
    }
    setBadge(0, pendingInvites)
    setBadge(1, unreadMsgs)
  },

  updateShellIdentity(name) {
    const displayName = name || ''
    const nameEl = document.querySelector('.portal-header .name')
    if (nameEl) nameEl.textContent = displayName
    const avEl = document.querySelector('.portal-header .avatar')
    if (avEl && displayName) avEl.textContent = displayName.charAt(0)
  },

  showSection(section, force = false) {
    const sameSection = this.state.currentSection === section
    this.state.currentSection = section
    const user = this.state.currentUser
    const personnel = DB.findPersonnelByUserId(user?.id) || DB.findPersonnelByPhone(user?.phone)
    document.querySelectorAll('.portal-nav-item').forEach(el => el.classList.remove('active'))
    const idx = { overview: 0, messages: 1, profile: 2 }[section]
    document.querySelectorAll('.portal-nav-item')[idx]?.classList.add('active')

    const content = document.getElementById('portal-content')
    if (!force && sameSection && content?.dataset.section === section && content.innerHTML.trim()) {
      return
    }

    if (section === 'overview') {
      if (!personnel) {
        document.getElementById('portal-content').innerHTML = `
          <div class="empty-state"><i class="fas fa-user-clock"></i>
            <p>پروفایل پرسنل شما هنوز توسط مدیر تأیید نشده است.</p>
          </div>`
        return
      }
      PortalDashboard.render(personnel, user)
    } else if (section === 'messages') {
      if (typeof PortalMessages !== 'undefined') PortalMessages.render(user, personnel)
      else document.getElementById('portal-content').innerHTML = '<div class="empty-state"><p>پیام‌ها در دسترس نیست</p></div>'
    } else if (section === 'profile') {
      PortalProfile.render(personnel, user)
    }
    content?.setAttribute('data-section', section)
  },

  async acceptInvitation(projectId) {
    const assignment = window.ErpRuntime?.state?.().assignments?.find(a => a.id === projectId)
    if (!assignment || assignment.userId !== this.state.currentUser?.id || assignment.status !== 'offered') {
      return Utils.toast('آفیش معتبر سرور یافت نشد', 'error')
    }
    try {
      await window.DomainApi.respondAssignment(projectId, assignment.version, true)
      await window.ErpRuntime.refresh({ force: true })
      Utils.toast('آفیش پذیرفته شد', 'success')
      this.refreshNavBadges()
      this.showSection('overview', true)
    } catch (error) { Utils.toast(error.message || 'پذیرش آفیش ناموفق بود', 'error') }
  },

  async rejectInvitation(projectId) {
    const assignment = window.ErpRuntime?.state?.().assignments?.find(a => a.id === projectId)
    if (!assignment || assignment.userId !== this.state.currentUser?.id || assignment.status !== 'offered') {
      return Utils.toast('آفیش معتبر سرور یافت نشد', 'error')
    }
    try {
      await window.DomainApi.respondAssignment(projectId, assignment.version, false)
      await window.ErpRuntime.refresh({ force: true })
      Utils.toast('آفیش رد شد', 'info')
      this.refreshNavBadges()
      this.showSection('overview', true)
    } catch (error) { Utils.toast(error.message || 'رد آفیش ناموفق بود', 'error') }
  },

  async updateProjectStatus(projectId, status) {
    const assignment = window.ErpRuntime?.state?.().assignments?.find(a => a.id === projectId)
    if (!assignment || assignment.userId !== this.state.currentUser?.id) return Utils.toast('دسترسی ندارید', 'error')
    if (!['finished', 'delivered', 'completed'].includes(status)) {
      return Utils.toast('مرحلهٔ سفارش فقط توسط مدیر عملیات تغییر می‌کند', 'warning')
    }
    try {
      await window.DomainApi.completeAssignment(projectId, assignment.version)
      await window.ErpRuntime.refresh({ force: true })
      Utils.toast('انجام آفیش ثبت شد', 'success')
      this.showSection('overview', true)
    } catch (error) { Utils.toast(error.message || 'ثبت وضعیت ناموفق بود', 'error') }
  },

  async requestEmploymentContractOtp(contractId) {
    try {
      const result = await window.DomainApi.requestPersonnelContractOtp(contractId)
      this.state.personnelContractChallenges ||= {}
      this.state.personnelContractChallenges[contractId] = result.challengeId
      Utils.toast('کد تأیید ارسال شد', 'success')
    } catch (error) { Utils.toast(error.message || 'ارسال کد ناموفق بود', 'error') }
  },

  async verifyEmploymentContract(contractId) {
    const user = this.state.currentUser
    const c = window.ErpRuntime?.state?.().personnelContracts?.find(x => x.id === contractId)
    if (!c || c.personnel_user_id !== user?.id || c.status !== 'offered') {
      Utils.toast('دسترسی ندارید', 'error')
      return
    }
    const input = document.getElementById(`emp-contract-code-${contractId}`)
    const code = (input?.value || '').replace(/\D/g, '')
    const challengeId = this.state.personnelContractChallenges?.[contractId]
    if (!challengeId) return Utils.toast('ابتدا کد تأیید را درخواست کنید', 'warning')
    try {
      await window.DomainApi.acceptPersonnelContract(contractId, c.version, challengeId, code)
      delete this.state.personnelContractChallenges[contractId]
      await window.ErpRuntime.refresh({ force: true })
      Utils.toast('قرارداد همکاری تأیید شد', 'success')
      this.showSection('overview', true)
    } catch (error) { Utils.toast(error.message || 'کد تأیید نادرست است', 'error') }
  },

  async rejectEmploymentContract(contractId) {
    const c = window.ErpRuntime?.state?.().personnelContracts?.find(x => x.id === contractId)
    if (!c || c.personnel_user_id !== this.state.currentUser?.id) return Utils.toast('دسترسی ندارید', 'error')
    try {
      await window.DomainApi.respondPersonnelContract(contractId, c.version, false)
      await window.ErpRuntime.refresh({ force: true })
      Utils.toast('قرارداد رد شد', 'info')
      this.showSection('overview', true)
    } catch (error) { Utils.toast(error.message || 'رد قرارداد ناموفق بود', 'error') }
  },

  async attendanceCheckIn() {
    try {
      await window.DomainApi.recordAttendance('check_in')
      await window.ErpRuntime.refresh({ force: true })
      Utils.toast('ورود با زمان سرور ثبت شد', 'success')
      this.showSection('overview', true)
    } catch (error) { Utils.toast(error.message || 'ثبت ورود ناموفق بود', 'error') }
  },

  async attendanceCheckOut() {
    const open = window.ErpRuntime?.state?.().attendanceEntries?.find(r =>
      r.personnelUserId === this.state.currentUser?.id && !r.checkOutAt)
    if (!open) return Utils.toast('ورود باز در سرور یافت نشد', 'error')
    try {
      await window.DomainApi.recordAttendance('check_out', open.version)
      await window.ErpRuntime.refresh({ force: true })
      Utils.toast('خروج با زمان سرور ثبت شد', 'success')
      this.showSection('overview', true)
    } catch (error) { Utils.toast(error.message || 'ثبت خروج ناموفق بود', 'error') }
  }
})
