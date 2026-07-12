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
    const pendingInvites = personnel
      ? DB.filter('persProjects', p => p.personnelId === personnel.id && p.accepted === null).length
      : 0

    document.getElementById('portal-app').innerHTML = `
      <div class="portal-shell">
        <header class="portal-header">
          <button type="button" class="profile-header-tap user-info" onclick="Portal.showSection('profile')" aria-label="پروفایل">
            <div class="avatar">${Utils.escapeHtml((displayName || '?').charAt(0))}</div>
            <div>
              <div class="name">${Utils.escapeHtml(displayName || '')}</div>
              <div class="role">${badge.emoji} ${Utils.escapeHtml(badge.title)} — پورتال پرسنل</div>
            </div>
          </button>
          <div class="portal-header-actions">
            <button type="button" class="portal-header-btn" onclick="GlassTheme.openPicker()" title="ظاهر" aria-label="ظاهر">
              <i class="fas fa-wand-magic-sparkles"></i>
            </button>
            <button type="button" class="logout-btn" onclick="Portal.logout()">خروج</button>
          </div>
        </header>
        <main class="portal-content" id="portal-content" aria-live="polite"></main>
        <nav class="portal-bottom-nav" aria-label="منوی پرسنل">
          <button type="button" class="portal-nav-item${this.state.currentSection === 'overview' ? ' active' : ''}" onclick="Portal.showSection('overview')">
            <i class="fas fa-th-large"></i><span>پروژه‌ها</span>
            ${pendingInvites ? `<span class="portal-nav-badge">${pendingInvites}</span>` : ''}
          </button>
          <button type="button" class="portal-nav-item${this.state.currentSection === 'messages' ? ' active' : ''}" onclick="Portal.showSection('messages')">
            <i class="fas fa-comments"></i><span>پیام‌ها</span>
            ${unreadMsgs ? `<span class="portal-nav-badge">${unreadMsgs}</span>` : ''}
          </button>
          <button type="button" class="portal-nav-item${this.state.currentSection === 'profile' ? ' active' : ''}" onclick="Portal.showSection('profile')">
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
    const pendingInvites = personnel
      ? DB.filter('persProjects', p => p.personnelId === personnel.id && p.accepted === null).length
      : 0
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
    if (!Auth.ownsPersonnelProject(projectId)) {
      Utils.toast('دسترسی به این پروژه ندارید', 'error')
      return
    }
    await SecureDB.update('persProjects', projectId, { accepted: true, status: 'active', acceptedAt: Utils.todayJalali() })
    DB.log('project_accept', projectId)
    Utils.toast('آفیش پذیرفته شد', 'success')
    this.refreshNavBadges()
    this.showSection('overview', true)
  },

  async rejectInvitation(projectId) {
    if (!Auth.ownsPersonnelProject(projectId)) {
      Utils.toast('دسترسی به این پروژه ندارید', 'error')
      return
    }
    await SecureDB.update('persProjects', projectId, { accepted: false, status: 'rejected', rejectedAt: Utils.todayJalali() })
    DB.log('project_reject', projectId)
    Utils.toast('آفیش رد شد', 'info')
    this.refreshNavBadges()
    this.showSection('overview', true)
  },

  async updateProjectStatus(projectId, status) {
    if (!Auth.ownsPersonnelProject(projectId)) {
      Utils.toast('دسترسی به این پروژه ندارید', 'error')
      return
    }
    await SecureDB.update('persProjects', projectId, { status, updatedAt: Utils.todayJalali() })
    Utils.toast('وضعیت ذخیره شد', 'success')
    this.showSection('overview')
  },

  async verifyEmploymentContract(contractId) {
    const user = this.state.currentUser
    const personnel = DB.findPersonnelByUserId(user?.id) || DB.findPersonnelByPhone(user?.phone)
    const c = DB.find('persContracts', x => x.id === contractId)
    if (!c || c.personnelId !== personnel?.id) {
      Utils.toast('دسترسی ندارید', 'error')
      return
    }
    const input = document.getElementById(`emp-contract-code-${contractId}`)
    const code = (input?.value || '').replace(/\D/g, '')
    const expected = c.verification?.code || ''
    if (!code || code !== expected) {
      Utils.toast('کد تأیید نادرست است', 'error')
      return
    }
    await SecureDB.update('persContracts', contractId, {
      status: 'verified',
      verification: { ...c.verification, verified: true, verifiedAt: Utils.todayJalali() }
    })
    DB.log('employment_contract_verified', contractId)
    Utils.toast('قرارداد همکاری تأیید شد', 'success')
    this.showSection('overview')
  },

  async rejectEmploymentContract(contractId) {
    const user = this.state.currentUser
    const personnel = DB.findPersonnelByUserId(user?.id) || DB.findPersonnelByPhone(user?.phone)
    const c = DB.find('persContracts', x => x.id === contractId)
    if (!c || c.personnelId !== personnel?.id) return
    await SecureDB.update('persContracts', contractId, { status: 'rejected', rejectedAt: Utils.todayJalali() })
    Utils.toast('قرارداد رد شد', 'info')
    this.showSection('overview')
  },

  async attendanceCheckIn() {
    const user = this.state.currentUser
    const personnel = DB.findPersonnelByUserId(user?.id) || DB.findPersonnelByPhone(user?.phone)
    if (!personnel) return Utils.toast('پروفایل پرسنل یافت نشد', 'error')
    const now = new Date()
    const today = Utils.todayJalali()
    const recorded = Utils.formatJalaliDateTime(now)
    const time = recorded.split(' — ساعت ')[1] || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const open = (DB.get('attendance') || []).find(r =>
      r.personnelId === personnel.id && Utils.normJalali(r.date) === today && !r.checkOut && r.status !== 'absent'
    )
    if (open) return Utils.toast('ورود امروز قبلاً ثبت شده', 'info')
    await SecureDB.insert('attendance', {
      personnelId: personnel.id,
      personnelName: personnel.name,
      date: today,
      checkIn: time,
      checkInAt: now.toISOString(),
      checkInRecorded: recorded,
      status: 'present',
      source: 'portal',
      notes: ''
    })
    Utils.toast('ورود ثبت شد', 'success')
    this.showSection('overview')
  },

  async attendanceCheckOut() {
    const user = this.state.currentUser
    const personnel = DB.findPersonnelByUserId(user?.id) || DB.findPersonnelByPhone(user?.phone)
    if (!personnel) return
    const today = Utils.todayJalali()
    const open = (DB.get('attendance') || []).find(r =>
      r.personnelId === personnel.id && Utils.normJalali(r.date) === today && !r.checkOut && r.status !== 'absent'
    )
    if (!open) return Utils.toast('ورود امروز ثبت نشده', 'error')
    const now = new Date()
    const recorded = Utils.formatJalaliDateTime(now)
    const time = recorded.split(' — ساعت ')[1] || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    await SecureDB.update('attendance', open.id, {
      checkOut: time,
      checkOutAt: now.toISOString(),
      checkOutRecorded: recorded,
      status: 'completed'
    })
    Utils.toast('خروج ثبت شد', 'success')
    this.showSection('overview')
  }
})
