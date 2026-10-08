/* ══════════════════════════════════════════════════════════════════════════
   CRMSTUDIO — Professional Personnel Portal (Portal Pro)
   ماژول پیشرفته پرتال همکاران: تم، سرچ، کاشی‌های نقش، تقویم و تایید هوشمند آفیش
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict'

  const PortalPro = {
    state: {
      theme: 'dark',
      searchQuery: '',
      activeRoleFilter: 'all',
      lastPendingCount: 0,
      activeView: 'list' // 'list' | 'calendar'
    },

    init() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return
      this.initTheme()
      this.hookPortalDashboard()
      this.listenForNewInvites()
    },

    // ─── ۱. مدیریت تم تاریک و روشن ──────────────────────────────────────────
    initTheme() {
      try {
        const saved = localStorage.getItem('portal_theme') || 'dark'
        this.setTheme(saved)
      } catch {
        this.setTheme('dark')
      }
    },

    setTheme(theme) {
      this.state.theme = theme === 'light' ? 'light' : 'dark'
      document.body.setAttribute('data-portal-theme', this.state.theme)
      try { localStorage.setItem('portal_theme', this.state.theme) } catch { /* */ }
      this.updateThemeButton()
    },

    toggleTheme() {
      const next = this.state.theme === 'dark' ? 'light' : 'dark'
      this.setTheme(next)
      if (typeof Utils !== 'undefined' && Utils.toast) {
        Utils.toast(next === 'light' ? 'تم روشن استودیویی فعال شد' : 'تم تاریک فعال شد', 'info')
      }
    },

    updateThemeButton() {
      const btn = document.getElementById('portal-pro-theme-toggle')
      if (btn) {
        const isDark = this.state.theme === 'dark'
        btn.innerHTML = `<i class="fas fa-${isDark ? 'sun' : 'moon'}"></i>`
        btn.title = isDark ? 'تغییر به تم روشن' : 'تغییر به تم تاریک'
      }
    },

    // ─── ۲. تزریق امکانات حرفه‌ای به داشبورد همکار ────────────────────────
    hookPortalDashboard() {
      if (typeof PortalDashboard === 'undefined') return
      const origRender = PortalDashboard.render

      PortalDashboard.render = (personnel, user) => {
        // اجرای رندر اصلی
        origRender.call(PortalDashboard, personnel, user)

        // افزودن دکمه‌های تم و ابزارهای حرفه‌ای به هدر
        this.enhanceHeader()

        // تزریق نوار جستجو، کاشی‌های نقش و تقویم
        this.injectProEnhancements(personnel, user)
      }
    },

    enhanceHeader() {
      const actions = document.querySelector('.portal-header-actions')
      if (actions && !document.getElementById('portal-pro-theme-toggle')) {
        const themeBtn = document.createElement('button')
        themeBtn.type = 'button'
        themeBtn.id = 'portal-pro-theme-toggle'
        themeBtn.className = 'portal-header-btn'
        themeBtn.onclick = () => this.toggleTheme()
        actions.prepend(themeBtn)
        this.updateThemeButton()
      }
    },

    injectProEnhancements(personnel, _user) {
      const contentEl = document.getElementById('portal-content')
      if (!contentEl) return

      const allProjects = (typeof DB !== 'undefined' && DB.filter)
        ? DB.filter('persProjects', p => p.personnelId === personnel.id)
        : []

      // بررسی آفیش‌های جدید و نمایش اعلان پالس‌دار
      const pendingInvites = allProjects.filter(p => p.accepted === null)
      let bannerHtml = ''
      if (pendingInvites.length > 0) {
        const first = pendingInvites[0]
        bannerHtml = `
          <div class="portal-new-invite-banner">
            <div style="display:flex;align-items:center;gap:12px">
              <div style="font-size:22px">🔔</div>
              <div>
                <strong style="font-size:14px;display:block">آفیش و دعوت همکاری جدید!</strong>
                <span style="font-size:12px;opacity:0.85">${Utils?.escapeHtml?.(first.couple || 'پروژه')} — نقش: ${Utils?.escapeHtml?.(first.role || 'همکار')}</span>
              </div>
            </div>
            <button type="button" class="portal-pro-btn" style="background:#C9A96E;color:#1a1a2e;font-weight:700" onclick="PortalPro.openAcceptModal('${first.id}')">
              بررسی و تأیید آفیش
            </button>
          </div>
        `
      }

      // محاسبه آمار کاشی‌های نقش
      const roles = Array.isArray(personnel.roles) && personnel.roles.length ? personnel.roles : ['photographer']
      const isMultiRole = roles.length > 1
      if (isMultiRole && this.state.activeRoleFilter === 'none') {
        this.state.activeRoleFilter = 'all'
      }

      let roleCardsHtml = `
        <div class="portal-role-cards">
          <div class="portal-role-card ${this.state.activeRoleFilter === 'all' ? 'active' : ''}" onclick="PortalPro.setRoleFilter('all')">
            <div class="portal-role-card-head">
              <span class="portal-role-card-title">✨ ترکیبی (کل)</span>
              <span class="portal-role-card-badge">${allProjects.length}</span>
            </div>
            <div class="portal-role-card-stats">
              <span>فعال: <strong>${allProjects.filter(p => p.accepted === true && p.status !== 'done').length}</strong></span>
              <span>در انتظار: <strong>${pendingInvites.length}</strong></span>
            </div>
          </div>
      `

      roles.forEach(r => {
        const rTitle = typeof RolesHelper !== 'undefined' ? RolesHelper.title(r) : r
        const rEmoji = typeof RolesHelper !== 'undefined' ? RolesHelper.emoji(r) : '🎬'
        const rProjects = allProjects.filter(p => p.roleId === r || p.role === rTitle)
        const rActive = rProjects.filter(p => p.accepted === true && p.status !== 'done').length
        const rPending = rProjects.filter(p => p.accepted === null).length

        roleCardsHtml += `
          <div class="portal-role-card ${this.state.activeRoleFilter === r ? 'active' : ''}" onclick="PortalPro.setRoleFilter('${r}')">
            <div class="portal-role-card-head">
              <span class="portal-role-card-title">${rEmoji} ${Utils?.escapeHtml?.(rTitle)}</span>
              <span class="portal-role-card-badge">${rProjects.length}</span>
            </div>
            <div class="portal-role-card-stats">
              <span>فعال: <strong>${rActive}</strong></span>
              <span>انتظار: <strong>${rPending}</strong></span>
            </div>
          </div>
        `
      })
      roleCardsHtml += '</div>'

      // نوار ابزار جستجو و نمای تقویم
      const toolbarHtml = `
        <div class="portal-pro-toolbar">
          <div style="display:flex;gap:8px;align-items:center">
            <div class="portal-search-wrap" style="flex:1">
              <i class="fas fa-search search-icon"></i>
              <input type="text" class="portal-search-input" id="portal-pro-search-input"
                placeholder="جستجو در زوج‌ها، تاریخ، نقش یا وضعیت آفیش..."
                value="${Utils?.escapeHtml?.(this.state.searchQuery) || ''}"
                oninput="PortalPro.onSearch(this.value)" />
              ${this.state.searchQuery ? `
                <button type="button" class="portal-search-clear" onclick="PortalPro.clearSearch()">
                  <i class="fas fa-times"></i>
                </button>` : ''}
            </div>
            <button type="button" class="portal-pro-btn ${this.state.activeView === 'calendar' ? 'active' : ''}" onclick="PortalPro.toggleCalendarView()">
              <i class="fas fa-calendar-alt"></i> ${this.state.activeView === 'calendar' ? 'لیست' : 'تقویم شخصی'}
            </button>
          </div>
        </div>
      `

      // درج در ابتدای محتوا
      const wrapper = document.createElement('div')
      wrapper.id = 'portal-pro-top-section'
      wrapper.innerHTML = bannerHtml + toolbarHtml + roleCardsHtml

      const oldTop = document.getElementById('portal-pro-top-section')
      if (oldTop) oldTop.remove()

      contentEl.prepend(wrapper)

      // اعمال فیلتر زنده روی کارت‌های پروژه
      this.filterProjectDOM()

      // افزودن دکمه‌های تغییر وضعیت یک‌کلیکه به کارت‌های پروژه
      this.enhanceProjectCards()
    },

    // ─── ۳. فیلتر زنده و سرچ ───────────────────────────────────────────────
    onSearch(q) {
      this.state.searchQuery = String(q || '').trim().toLowerCase()
      this.filterProjectDOM()
      const clearBtn = document.querySelector('.portal-search-clear')
      if (clearBtn) clearBtn.style.display = this.state.searchQuery ? 'block' : 'none'
    },

    clearSearch() {
      this.state.searchQuery = ''
      const inp = document.getElementById('portal-pro-search-input')
      if (inp) inp.value = ''
      this.filterProjectDOM()
    },

    setRoleFilter(role) {
      this.state.activeRoleFilter = role
      document.querySelectorAll('.portal-role-card').forEach(c => c.classList.remove('active'))
      this.filterProjectDOM()
      if (typeof Portal !== 'undefined' && Portal.showSection) {
        Portal.showSection('overview')
      }
    },

    filterProjectDOM() {
      const q = this.state.searchQuery
      const roleFilter = this.state.activeRoleFilter
      const cards = document.querySelectorAll('.project-card')

      cards.forEach(card => {
        const text = card.textContent.toLowerCase()
        const matchesQuery = !q || text.includes(q)
        const matchesRole = roleFilter === 'all' || text.includes(roleFilter)

        card.style.display = (matchesQuery && matchesRole) ? 'block' : 'none'
      })
    },

    // ─── ۴. دکمه‌های سریع وضعیت پروژه ─────────────────────────────────────
    enhanceProjectCards() {
      const cards = document.querySelectorAll('.project-card')
      cards.forEach(card => {
        if (card.querySelector('.portal-quick-status-wrap')) return

        const onclickAttr = card.getAttribute('onclick') || ''
        const match = onclickAttr.match(/'([^']+)'/)
        const projectId = match ? match[1] : null
        if (!projectId) return

        const p = (typeof DB !== 'undefined' && DB.find) ? DB.find('persProjects', x => x.id === projectId) : null
        if (!p || p.accepted !== true) return

        const curStatus = p.status || 'active'
        const wrap = document.createElement('div')
        wrap.className = 'portal-quick-status-wrap'
        wrap.onclick = (e) => e.stopPropagation()
        wrap.innerHTML = `
          <button type="button" class="portal-quick-status-btn ${curStatus === 'in_progress' ? 'active' : ''}" onclick="PortalPro.updateProjectStatus('${p.id}', 'in_progress')">
            ⏳ در صف تدوین
          </button>
          <button type="button" class="portal-quick-status-btn ${curStatus === 'delivered_to_manager' ? 'active' : ''}" onclick="PortalPro.updateProjectStatus('${p.id}', 'delivered_to_manager')">
            📤 تحویل به مدیر
          </button>
          <button type="button" class="portal-quick-status-btn ${curStatus === 'done' ? 'active' : ''}" onclick="PortalPro.updateProjectStatus('${p.id}', 'done')">
            ✓ نهایی و اتمام
          </button>
        `
        card.appendChild(wrap)
      })
    },

    async updateProjectStatus(projectId, newStatus) {
      if (typeof SecureDB !== 'undefined' && SecureDB.update) {
        await SecureDB.update('persProjects', projectId, {
          status: newStatus,
          updatedAt: typeof Utils !== 'undefined' ? Utils.todayJalali() : new Date().toISOString()
        })
        if (typeof DB !== 'undefined' && DB.log) {
          DB.log('project_status_update', `${projectId} -> ${newStatus}`)
        }
        if (typeof Utils !== 'undefined' && Utils.toast) {
          const statusLabels = {
            in_progress: 'پروژه در حال اجرا / تدوین قرار گرفت',
            delivered_to_manager: 'پروژه جهت بازبینی به مدیریت تحویل شد',
            done: 'پروژه به عنوان تکمیل‌شده علامت‌گذاری گردید'
          }
          Utils.toast(statusLabels[newStatus] || 'وضعیت ذخیره شد', 'success')
        }
        if (typeof Portal !== 'undefined' && Portal.showSection) {
          Portal.showSection('overview', true)
        }
      }
    },

    // ─── ۵. مودال تأیید آفیش با تاریخ‌ها ──────────────────────────────────
    openAcceptModal(projectId) {
      const p = (typeof DB !== 'undefined' && DB.find) ? DB.find('persProjects', x => x.id === projectId) : null
      if (!p) return

      const modal = document.createElement('div')
      modal.className = 'portal-pro-modal'
      modal.id = 'portal-accept-modal-root'
      modal.innerHTML = `
        <div class="portal-pro-modal-box">
          <h3 style="margin:0 0 8px;font-size:16px;color:var(--pro-accent)">📋 تأیید آفیش و تنظیم تاریخ‌های پروژه</h3>
          <p style="font-size:13px;opacity:0.8;margin:0 0 16px">
            پروژه: <strong>${Utils?.escapeHtml?.(p.couple || p.contractName || 'پروژه')}</strong> — نقش: <strong>${Utils?.escapeHtml?.(p.role || 'همکار')}</strong>
          </p>

          <div class="portal-date-grid">
            <div class="portal-date-field">
              <label>📅 تاریخ مراسم / رزرو</label>
              <input type="text" id="modal-event-date" dir="ltr" value="${Utils?.escapeHtml?.(p.date || p.eventDate || '')}" placeholder="۱۴۰۳/۰۷/۲۰" />
            </div>
            <div class="portal-date-field">
              <label>⏰ مهلت تحویل نهایی (ددلاین)</label>
              <input type="text" id="modal-deadline" dir="ltr" value="${Utils?.escapeHtml?.(p.deadline || '')}" placeholder="۱۴۰۳/۰۸/۰۵" />
            </div>
          </div>

          <div class="portal-date-field" style="margin-bottom:18px">
            <label>💬 یادداشت و هماهنگی همکار (اختیاری)</label>
            <input type="text" id="modal-notes" value="${Utils?.escapeHtml?.(p.notes || '')}" placeholder="توضیحات تحویل راش، تجهیزات یا هماهنگی ساعت حضور..." />
          </div>

          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button type="button" class="portal-pro-btn" onclick="document.getElementById('portal-accept-modal-root').remove()">انصراف</button>
            <button type="button" class="portal-pro-btn" style="background:#10b981;color:#fff;border-color:#10b981;font-weight:700" onclick="PortalPro.confirmAccept('${p.id}')">
              <i class="fas fa-check"></i> تأیید نهایی و ثبت در کارتابل
            </button>
          </div>
        </div>
      `
      document.body.appendChild(modal)
    },

    async confirmAccept(projectId) {
      const eventDate = document.getElementById('modal-event-date')?.value?.trim() || ''
      const deadline = document.getElementById('modal-deadline')?.value?.trim() || ''
      const notes = document.getElementById('modal-notes')?.value?.trim() || ''

      if (typeof SecureDB !== 'undefined' && SecureDB.update) {
        await SecureDB.update('persProjects', projectId, {
          accepted: true,
          status: 'active',
          date: eventDate,
          eventDate: eventDate,
          deadline: deadline || eventDate,
          notes: notes,
          acceptedAt: typeof Utils !== 'undefined' ? Utils.todayJalali() : new Date().toISOString()
        })

        document.getElementById('portal-accept-modal-root')?.remove()
        this.playChime()
        if (typeof Utils !== 'undefined' && Utils.toast) {
          Utils.toast('آفیش با موفقیت پذیرفته و در تقویم کاری شما ثبت شد ✓', 'success')
        }
        if (typeof Portal !== 'undefined' && Portal.showSection) {
          Portal.showSection('overview', true)
        }
      }
    },

    // ─── ۶. تقویم شخصی همکار ──────────────────────────────────────────────
    toggleCalendarView() {
      this.state.activeView = this.state.activeView === 'calendar' ? 'list' : 'calendar'
      const content = document.getElementById('portal-content')
      if (!content) return

      if (this.state.activeView === 'calendar') {
        this.renderCalendar(content)
      } else {
        if (typeof Portal !== 'undefined' && Portal.showSection) {
          Portal.showSection('overview', true)
        }
      }
    },

    renderCalendar(container) {
      const user = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null
      const personnel = (typeof Portal !== 'undefined' && Portal._resolvePersonnel) ? Portal._resolvePersonnel(user) : null
      const projects = (typeof DB !== 'undefined' && DB.filter && personnel)
        ? DB.filter('persProjects', p => p.personnelId === personnel.id && p.accepted === true)
        : []

      const eventsListHtml = projects.length === 0
        ? '<p style="text-align:center;color:var(--pro-text-muted);padding:20px">هیچ مراسم یا تحویلی برای این ماه ثبت نشده است.</p>'
        : projects.map(p => `
          <div style="background:var(--pro-surface-card);border:1px solid var(--pro-border);border-radius:12px;padding:12px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong style="color:var(--pro-text);font-size:13.5px">${Utils?.escapeHtml?.(p.couple || p.contractName || 'پروژه')}</strong>
              <div style="font-size:11.5px;color:var(--pro-text-muted);margin-top:2px">نقش: ${Utils?.escapeHtml?.(p.role || 'همکار')}</div>
            </div>
            <div style="text-align:left">
              <span style="font-size:12px;color:var(--pro-accent);font-weight:700">${Utils?.escapeHtml?.(p.date || p.deadline || '—')}</span>
              <div style="font-size:10.5px;color:var(--pro-text-muted)">${p.deadline ? 'تحویل: ' + p.deadline : 'مراسم'}</div>
            </div>
          </div>
        `).join('')

      const calRoot = document.createElement('div')
      calRoot.id = 'portal-pro-calendar-view'
      calRoot.innerHTML = `
        <div style="background:var(--pro-surface);border:1px solid var(--pro-border);border-radius:20px;padding:20px;margin-top:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;font-size:16px"><i class="fas fa-calendar-check" style="color:var(--pro-accent)"></i> تقویم آفیش‌ها و سررسیدهای شخصی</h3>
            <button type="button" class="portal-pro-btn" onclick="PortalPro.toggleCalendarView()">بازگشت به لیست</button>
          </div>
          <div>${eventsListHtml}</div>
        </div>
      `

      const oldCal = document.getElementById('portal-pro-calendar-view')
      if (oldCal) oldCal.remove()

      container.appendChild(calRoot)
    },

    // ─── ۷. اعلان و صدای آفیش جدید ────────────────────────────────────────
    listenForNewInvites() {
      setInterval(() => {
        if (typeof Auth === 'undefined' || !Auth.isLoggedIn || !Auth.isLoggedIn()) return
        const user = Auth.getUser?.()
        if (!user || user.portalType !== 'staff') return

        const personnel = (typeof Portal !== 'undefined' && Portal._resolvePersonnel) ? Portal._resolvePersonnel(user) : null
        if (!personnel || typeof DB === 'undefined' || !DB.filter) return

        const currentPending = DB.filter('persProjects', p => p.personnelId === personnel.id && p.accepted === null).length
        if (currentPending > this.state.lastPendingCount && this.state.lastPendingCount !== 0) {
          this.playChime()
          if (typeof Utils !== 'undefined' && Utils.toast) {
            Utils.toast('آفیش جدیدی برای شما ارسال شد!', 'info')
          }
          if (typeof Portal !== 'undefined' && Portal.showSection) {
            Portal.showSection('overview', true)
          }
        }
        this.state.lastPendingCount = currentPending
      }, 5000)
    },

    playChime() {
      try {
        if (typeof AudioNotifier !== 'undefined' && AudioNotifier.play) {
          AudioNotifier.play('chime')
          return
        }
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1) // A5
        gain.gain.setValueAtTime(0.15, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
        osc.start()
        osc.stop(ctx.currentTime + 0.45)
      } catch { /* AudioContext muted */ }
    },

    // ─── ۸. اتصال خودکار قرارداد به تولید persProjects ────────────────────
    async syncContractStaff(contractObj) {
      if (!contractObj || typeof DB === 'undefined' || !DB.get) return
      const staffList = (contractObj.staff && Array.isArray(contractObj.staff)) ? contractObj.staff : []
      if (!staffList.length) return

      const personnel = DB.get('personnel') || []
      const existing = DB.get('persProjects') || []

      for (const item of staffList) {
        const p = personnel.find(x => x.id === item.personnelId || x.name === item.name)
        if (!p) continue

        const alreadyAssigned = existing.some(ep => ep.contractId === contractObj.id && (ep.personnelId === p.id || ep.roleId === item.roleId))
        if (!alreadyAssigned && typeof SecureDB !== 'undefined' && SecureDB.insert) {
          await SecureDB.insert('persProjects', {
            personnelId: p.id,
            personnelName: p.name,
            personnelPhone: p.phone,
            contractId: contractObj.id,
            contractName: contractObj.couple || 'قرارداد',
            couple: contractObj.couple || 'قرارداد',
            roleId: item.roleId || 'photographer',
            role: item.roleTitle || 'عکاس',
            date: contractObj.date || contractObj.eventDate || '',
            deadline: contractObj.date || contractObj.eventDate || '',
            amount: Number(item.amount) || 0,
            paid: 0,
            notes: item.notes || '',
            status: 'active',
            accepted: null,
            assignedAt: typeof Utils !== 'undefined' ? Utils.todayJalali() : new Date().toISOString()
          })
        }
      }
    }
  }

  window.PortalPro = PortalPro

  // راه‌اندازی خودکار
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(() => PortalPro.init(), 150))
    } else {
      setTimeout(() => PortalPro.init(), 150)
    }
  }
})()
