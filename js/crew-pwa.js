/**
 * CRMSTUDIO — Crew Pocket Hub PWA
 * لاجیک تعاملی نسخه موبایل عوامل اجرایی، چک‌لیست تجهیزات، آفیش و کارکرد
 */

(function (window) {
  'use strict'

  const CrewHub = {
    state: {
      activeTab: 'shoots',
      currentUser: null,
      todayShoot: null,
      upcomingShoots: [],
      equipmentList: [],
      earnings: { total: 0, settled: 0, pending: 0, projectsCount: 0 },
      deferredPrompt: null
    },

    init() {
      this.initPwaInstall()
      this.loadUser()
      this.loadData()
      this.renderAll()
      this.bindEvents()
      this.startCountdown()
    },

    loadUser() {
      const auth = typeof Auth !== 'undefined' ? Auth : (window.Auth || null)
      if (auth && auth.getUser) {
        this.state.currentUser = auth.getUser()
      }
      if (!this.state.currentUser) {
        // Fallback user from personnel or demo
        this.state.currentUser = {
          name: 'علی رستمی',
          role: 'عکاس و فیلمبردار ارشد تالار',
          phone: '09187766554'
        }
      }
    },

    loadData() {
      const db = typeof DB !== 'undefined' ? DB : (window.DB || null)
      const contracts = (db && db.get ? db.get('contracts') : null) || []
      const persProjects = (db && db.get ? db.get('persProjects') : null) || []
      const equipment = (db && db.get ? db.get('equipment') : null) || []

      // آفیش امروز و آینده
      const todayFa = typeof Utils !== 'undefined' && Utils.todayJalali ? Utils.todayJalali() : '1405/01/20'

      // پیدا کردن آفیش‌های منتسب
      const myShoots = []
      if (persProjects.length) {
        for (const pp of persProjects) {
          const c = contracts.find(x => x.id === pp.contractId) || {}
          myShoots.push({
            id: pp.id,
            contractId: pp.contractId,
            couple: c.couple || `${c.bride || ''} و ${c.groom || ''}`.trim() || pp.couple || 'مراسم عروسی',
            date: pp.eventDate || pp.date || c.eventDate || c.date || todayFa,
            role: pp.role || 'عکاس و فیلمبردار',
            callTime: c.callTime || '۱۵:۰۰',
            venue: c.venue || c.location || 'عمارت بهشت · سالن الماس',
            phoneBride: c.phoneBride || '09181112233',
            phoneGroom: c.phoneGroom || '09184445566',
            status: pp.status || 'accepted',
            fee: Number(pp.fee || pp.wage || 2500000)
          })
        }
      }

      // در صورت نبود اطلاعات در دیتابیس، آفیش نمونه جذاب جهت نمایش اولیه
      if (!myShoots.length) {
        myShoots.push({
          id: 'sample-1',
          couple: 'نیلوفر و رامین',
          date: todayFa,
          role: 'تصویربردار اصلی عمارت و کلیپ فرمالیته',
          callTime: '۱۵:۳۰',
          venue: 'عمارت کاخ سفید · سالن VIP مریوان',
          phoneBride: '09187766554',
          phoneGroom: '09181122334',
          status: 'accepted',
          fee: 3500000
        })
        myShoots.push({
          id: 'sample-2',
          couple: 'شادی و پیمان',
          date: '1405/01/25',
          role: 'عکاس تخصصی پرتره و رئال باغ',
          callTime: '۱۴:۰۰',
          venue: 'باغ عکاسی رویال سنندج',
          phoneBride: '09183322114',
          phoneGroom: '09189988776',
          status: 'confirmed',
          fee: 2800000
        })
      }

      this.state.todayShoot = myShoots[0]
      this.state.upcomingShoots = myShoots

      // تجهیزات
      if (equipment.length) {
        this.state.equipmentList = equipment.slice(0, 8).map(eq => ({
          id: eq.id,
          name: eq.name,
          category: eq.category || 'تجهیزات تصویربرداری',
          serial: eq.serial || '—'
        }))
      } else {
        this.state.equipmentList = [
          { id: 'eq-1', name: 'دوربین سونی Sony FX3 Cinema Line', category: 'بدنه اصلی فیلمبرداری', serial: 'FX3-8821' },
          { id: 'eq-2', name: 'لنز سونی 24-70mm F/2.8 GM II', category: 'لنز زوم استاندارد', serial: 'GM2-1044' },
          { id: 'eq-3', name: 'لنز سونی 50mm F/1.2 GM', category: 'لنز پرتره و عمق میدان', serial: 'GM-5012' },
          { id: 'eq-4', name: 'گیمبال استابلایزر DJI RS3 Pro', category: 'تثبیت‌کننده حرکت', serial: 'RS3P-992' },
          { id: 'eq-5', name: 'میکروفن بی‌سیم Rode Wireless PRO (دو کاربره)', category: 'صدا و بی سیم', serial: 'RODE-202' },
          { id: 'eq-6', name: 'باتری NP-FZ100 اورجینال (۴ عدد) + شارژر دوبل', category: 'تغذیه و انرژی', serial: 'BAT-4X' },
          { id: 'eq-7', name: 'کارت حافظه CFexpress Type A سرعت بالا (۲ عدد ۱۶۰GB)', category: 'رسانه ذخیره‌سازی', serial: 'CF-160A' }
        ]
      }

      // محاسبه کارکرد
      let total = 0
      for (const s of myShoots) total += Number(s.fee || 0)
      this.state.earnings = {
        total,
        settled: Math.round(total * 0.6),
        pending: Math.round(total * 0.4),
        projectsCount: myShoots.length
      }
    },

    renderAll() {
      this.renderHeader()
      this.renderShootsTab()
      this.renderGearTab()
      this.renderScheduleTab()
      this.renderEarningsTab()
    },

    renderHeader() {
      const u = this.state.currentUser || {}
      const nameEl = document.getElementById('crew-user-name')
      const roleEl = document.getElementById('crew-user-role')
      if (nameEl) nameEl.textContent = u.name || 'همکار گرامی'
      if (roleEl) roleEl.textContent = u.role || 'عوامل اجرایی استودیو'
    },

    renderShootsTab() {
      const shoot = this.state.todayShoot
      const container = document.getElementById('tab-shoots')
      if (!container || !shoot) return

      container.innerHTML = `
        <div class="crew-hero-card">
          <div class="crew-hero-top">
            <span class="crew-shoot-tag"><i class="fas fa-circle" style="color:#10b981;font-size:8px"></i> آفیش امروز</span>
            <span style="font-size:11px;color:rgba(255,255,255,0.6)">${shoot.date}</span>
          </div>

          <h2 class="crew-couple-title">💍 ${shoot.couple}</h2>
          <div style="font-size:12px;color:var(--crew-gold);font-weight:700">${shoot.role}</div>

          <div class="crew-shoot-details">
            <div class="crew-detail-row">
              <div class="crew-detail-icon"><i class="fas fa-clock"></i></div>
              <div>ساعت حضور در لوکیشن: <strong>${shoot.callTime}</strong></div>
            </div>
            <div class="crew-detail-row">
              <div class="crew-detail-icon"><i class="fas fa-map-marker-alt"></i></div>
              <div>لوکیشن: <strong>${shoot.venue}</strong></div>
            </div>
            <div class="crew-detail-row">
              <div class="crew-detail-icon"><i class="fas fa-hourglass-half"></i></div>
              <div id="crew-countdown-text">زمان تا شروع مراسم: <em>در حال محاسبه...</em></div>
            </div>
          </div>

          ${typeof GoldenHourWeather !== 'undefined' ? `
            <div style="margin: 12px 0">
              ${GoldenHourWeather.renderWidget({ date: shoot.date, venue: shoot.venue, cityName: 'مریوان', compact: true })}
            </div>
          ` : ''}

          <div class="crew-action-grid">
            <a href="tel:${shoot.phoneBride}" class="crew-action-btn primary">
              <i class="fas fa-phone"></i> تماس با عروس
            </a>
            <a href="tel:${shoot.phoneGroom}" class="crew-action-btn primary">
              <i class="fas fa-phone"></i> تماس با داماد
            </a>
            <button type="button" class="crew-action-btn gold" onclick="CrewHub.openNavigationModal('${encodeURIComponent(shoot.venue)}')">
              <i class="fas fa-location-arrow"></i> مسیریابی هوشمند
            </button>
            <button type="button" class="crew-action-btn" onclick="CrewHub.switchTab('gear')">
              <i class="fas fa-suitcase"></i> چک‌لیست تجهیزات
            </button>
          </div>
        </div>

        <div style="padding:14px;background:rgba(255,255,255,0.03);border:1px solid var(--crew-border);border-radius:16px;display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:12px">
            <i class="fas fa-shield-alt" style="color:var(--crew-gold)"></i> <strong>تلفن هماهنگی سرپرست استودیو:</strong>
          </div>
          <a href="tel:09187766554" style="color:var(--crew-emerald);text-decoration:none;font-weight:800;font-size:13px" dir="ltr">0918 776 6554</a>
        </div>
      `
    },

    renderGearTab() {
      const container = document.getElementById('tab-gear')
      if (!container) return

      const items = this.state.equipmentList
      const checkedSet = this._getCheckedGear()

      container.innerHTML = `
        <div class="crew-gear-box">
          <div class="crew-gear-head">
            <div class="crew-gear-title">
              <i class="fas fa-boxes-packing" style="color:var(--crew-gold)"></i> چک‌لیست تجهیزات رزرو شده
            </div>
            <span style="font-size:11px;color:var(--crew-emerald);font-weight:800" id="gear-checked-count">
              ${checkedSet.size} از ${items.length} قلم تایید شد
            </span>
          </div>

          <p style="font-size:11.5px;color:var(--crew-text-muted);margin-bottom:14px">
            قبل از خروج از استودیو و حضور در لوکیشن، سلامت لنزها، باتری‌ها و گیمبال را بررسی و تیک بزنید:
          </p>

          <div class="crew-gear-items">
            ${items.map(it => {
              const isChecked = checkedSet.has(it.id)
              return `
                <div class="crew-gear-item ${isChecked ? 'is-checked' : ''}" onclick="CrewHub.toggleGearItem('${it.id}')">
                  <div class="crew-gear-info">
                    <div class="crew-gear-box-icon"><i class="fas fa-check"></i></div>
                    <div>
                      <div class="crew-gear-name">${it.name}</div>
                      <div class="crew-gear-cat">${it.category} · سریال: <span dir="ltr">${it.serial}</span></div>
                    </div>
                  </div>
                </div>
              `
            }).join('')}
          </div>

          <div style="margin-top:18px">
            <button type="button" class="crew-action-btn gold" style="width:100%;padding:14px;font-size:13px" onclick="CrewHub.confirmAllGear()">
              <i class="fas fa-check-double"></i> تایید نهایی تحویل و سلامت کلیه تجهیزات
            </button>
          </div>
        </div>
      `
    },

    renderScheduleTab() {
      const container = document.getElementById('tab-schedule')
      if (!container) return

      const shoots = this.state.upcomingShoots
      container.innerHTML = `
        <div style="margin-bottom:14px;font-weight:800;font-size:14px;color:var(--crew-gold)">
          <i class="fas fa-calendar-days"></i> تقویم آفیش‌های پیش‌رو
        </div>

        <div class="crew-schedule-list">
          ${shoots.map(s => {
            const parts = (s.date || '').split('/')
            const day = parts[2] || s.date
            const month = parts[1] || 'فروردین'
            return `
              <div class="crew-schedule-card">
                <div style="display:flex;align-items:center;gap:14px">
                  <div class="crew-date-badge">
                    <div class="crew-date-day">${day}</div>
                    <div class="crew-date-month">ماه ${month}</div>
                  </div>
                  <div>
                    <h3 style="font-size:14px;color:#fff;margin-bottom:2px">${s.couple}</h3>
                    <div style="font-size:11.5px;color:var(--crew-text-muted)">${s.role} · ساعت: ${s.callTime}</div>
                    <div style="font-size:11px;color:var(--crew-gold);margin-top:2px"><i class="fas fa-map-marker-alt"></i> ${s.venue}</div>
                  </div>
                </div>
                <div>
                  <span class="crew-pwa-badge">تایید شده ✓</span>
                </div>
              </div>
            `
          }).join('')}
        </div>
      `
    },

    renderEarningsTab() {
      const container = document.getElementById('tab-earnings')
      if (!container) return

      const e = this.state.earnings
      const fmt = (n) => (typeof Utils !== 'undefined' && Utils.fmtNum ? Utils.fmtNum(n) : n.toLocaleString('fa-IR'))

      container.innerHTML = `
        <div class="crew-wallet-card">
          <div class="crew-wallet-title">مجموع کارکرد و دستمزد این ماه</div>
          <div class="crew-wallet-total">${fmt(e.total)} <span style="font-size:14px;font-weight:normal">تومان</span></div>

          <div class="crew-wallet-grid">
            <div>
              <div class="crew-wallet-stat-sub">واریز شده به حساب:</div>
              <div class="crew-wallet-stat-num">${fmt(e.settled)} ت</div>
            </div>
            <div>
              <div class="crew-wallet-stat-sub">مانده قابل تسویه:</div>
              <div class="crew-wallet-stat-num" style="color:var(--crew-gold)">${fmt(e.pending)} ت</div>
            </div>
          </div>
        </div>

        <div style="padding:16px;background:var(--crew-card);border:1px solid var(--crew-border);border-radius:16px">
          <div style="font-size:13px;font-weight:800;margin-bottom:12px;color:#fff">
            <i class="fas fa-receipt" style="color:var(--crew-gold)"></i> ریز تسویه‌حساب‌های اخیر
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;font-size:12px">
            <div style="display:flex;justify-content:space-between;padding-bottom:8px;border-bottom:1px dashed var(--crew-border)">
              <span>پروژه مراسم نیلوفر و رامین</span>
              <strong style="color:var(--crew-emerald)">۳,۵۰۰,۰۰۰ تومان (تسویه شده)</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding-bottom:8px;border-bottom:1px dashed var(--crew-border)">
              <span>پروژه فرمالیته شادی و پیمان</span>
              <strong style="color:var(--crew-gold)">۲,۸۰۰,۰۰۰ تومان (در صف واریز)</strong>
            </div>
          </div>
        </div>
      `
    },

    switchTab(tabId) {
      this.state.activeTab = tabId

      // به‌روزرسانی نوار پایین
      const navButtons = document.querySelectorAll('.crew-nav-item')
      navButtons.forEach(btn => {
        btn.classList.toggle('is-active', btn.getAttribute('data-tab') === tabId)
      })

      // به‌روزرسانی پنل‌ها
      const contents = document.querySelectorAll('.crew-tab-content')
      contents.forEach(panel => {
        panel.classList.toggle('is-active', panel.id === `tab-${tabId}`)
      })

      window.scrollTo({ top: 0, behavior: 'smooth' })
    },

    _getCheckedGear() {
      try {
        const raw = localStorage.getItem('crew_checked_gear')
        return new Set(raw ? JSON.parse(raw) : [])
      } catch {
        return new Set()
      }
    },

    toggleGearItem(itemId) {
      const set = this._getCheckedGear()
      if (set.has(itemId)) set.delete(itemId)
      else set.add(itemId)

      try {
        localStorage.setItem('crew_checked_gear', JSON.stringify([...set]))
      } catch { /* ignore */ }

      this.renderGearTab()
    },

    confirmAllGear() {
      const allIds = this.state.equipmentList.map(it => it.id)
      try {
        localStorage.setItem('crew_checked_gear', JSON.stringify(allIds))
      } catch { /* ignore */ }
      this.renderGearTab()

      if (typeof Utils !== 'undefined' && Utils.toast) {
        Utils.toast('تحویل کلیه تجهیزات با موفقیت تایید شد ✓', 'success')
      } else {
        alert('تحویل کلیه تجهیزات با موفقیت تایید شد ✓')
      }
    },

    openNavigationModal(encodedVenue) {
      const venue = decodeURIComponent(encodedVenue)
      const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(venue)}`
      const neshanUrl = `https://neshan.org/maps/@35.7,51.4,12z`
      const baladUrl = `https://balad.ir/search?query=${encodeURIComponent(venue)}`
      const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`

      const backdrop = document.createElement('div')
      backdrop.className = 'crew-pwa-modal-backdrop'
      backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove() }

      backdrop.innerHTML = `
        <div class="crew-pwa-modal-card">
          <div style="font-size:2rem;color:var(--crew-gold);margin-bottom:10px">
            <i class="fas fa-location-dot"></i>
          </div>
          <h3 style="font-size:16px;color:#fff;margin-bottom:6px">انتخاب مسیریاب برای لوکیشن</h3>
          <p style="font-size:12px;color:var(--crew-text-muted);margin-bottom:18px">
            مقصد: <strong>${venue}</strong>
          </p>
          <div style="display:flex;flex-direction:column;gap:10px">
            <a href="${neshanUrl}" target="_blank" class="crew-action-btn" style="background:#0066cc;color:#fff;border:none">
              <i class="fas fa-map"></i> باز کردن با نشان (Neshan)
            </a>
            <a href="${baladUrl}" target="_blank" class="crew-action-btn" style="background:#00a651;color:#fff;border:none">
              <i class="fas fa-map-pin"></i> باز کردن با بلد (Balad)
            </a>
            <a href="${wazeUrl}" target="_blank" class="crew-action-btn" style="background:#33ccff;color:#000;border:none">
              <i class="fab fa-waze"></i> باز کردن با ویز (Waze)
            </a>
            <a href="${gmapsUrl}" target="_blank" class="crew-action-btn" style="background:rgba(255,255,255,0.1);color:#fff">
              <i class="fab fa-google"></i> Google Maps
            </a>
            <button type="button" class="crew-action-btn" style="margin-top:6px" onclick="this.closest('.crew-pwa-modal-backdrop').remove()">
              انصراف
            </button>
          </div>
        </div>
      `
      document.body.appendChild(backdrop)
    },

    startCountdown() {
      const update = () => {
        const el = document.getElementById('crew-countdown-text')
        if (!el) return
        const now = new Date()
        // ساعت هدف آفیش امروز (مثلاً ساعت ۱۵:۳۰ امروز)
        const target = new Date()
        target.setHours(15, 30, 0, 0)
        const diff = target - now

        if (diff <= 0) {
          el.innerHTML = '<span style="color:#10b981;font-weight:800"><i class="fas fa-circle-play"></i> زمان مراسم فرا رسیده است — موفق باشید!</span>'
        } else {
          const hours = Math.floor(diff / (1000 * 60 * 60))
          const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
          el.innerHTML = `زمان تا شروع مراسم: <strong style="color:var(--crew-gold)">${hours} ساعت و ${mins} دقیقه</strong>`
        }
      }
      setInterval(update, 60000)
      update()
    },

    initPwaInstall() {
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault()
        this.state.deferredPrompt = e
        const btn = document.getElementById('crew-install-btn')
        if (btn) btn.style.display = 'flex'
      })
    },

    promptInstall() {
      if (this.state.deferredPrompt) {
        this.state.deferredPrompt.prompt()
        this.state.deferredPrompt.userChoice.then(() => {
          this.state.deferredPrompt = null
          const btn = document.getElementById('crew-install-btn')
          if (btn) btn.style.display = 'none'
        })
      } else {
        // iOS or already installed 안내
        alert('برای نصب این اپلیکیشن روی آیفون:\n۱. دکمه Share (مربع با فلش بالا) را در سافاری بزنید.\n۲. گزینه «Add to Home Screen» یا «افزودن به صفحه اصلی» را انتخاب کنید.')
      }
    },

    bindEvents() {
      const navButtons = document.querySelectorAll('.crew-nav-item')
      navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const tab = btn.getAttribute('data-tab')
          if (tab) this.switchTab(tab)
        })
      })
    }
  }

  window.CrewHub = CrewHub
  document.addEventListener('DOMContentLoaded', () => CrewHub.init())
})(typeof window !== 'undefined' ? window : globalThis)
