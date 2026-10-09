/**
 * Eng Connectivity Hub — یکپارچه‌سازی مسیرها و گارد نقش‌ها
 * مشکل: مدیر/پرسنل/مشتری و studio-m گاهی به هم وصل نبودند
 */
(function (w) {
  'use strict'

  const EngRouter = {
    /** آیا داخل پوشه studio-m هستیم؟ */
    inStudioM() {
      try {
        return /\/studio-m(\/|$)/i.test(location.pathname)
      } catch {
        return false
      }
    },

    /** پیشوند نسبی برای لینک از صفحهٔ فعلی */
    prefix() {
      return this.inStudioM() ? '../' : ''
    },

    /** مسیر مطلق منطقی نسبت به ریشه اپ */
    url(path) {
      path = String(path || '').replace(/^\/+/, '')
      return this.prefix() + path
    },

    landingFor(user) {
      user = user || (typeof Auth !== 'undefined' ? Auth.getUser() : null)
      if (!user) return this.url('index.html')

      if (typeof Access !== 'undefined') {
        if (user.portalType === 'staff' || Access.isStaffOnly?.(user)) {
          return this.url('index.html?view=portal')
        }
        if (Access.canAccessStudioM?.(user)) {
          return this.inStudioM() ? './' : this.url('studio-m/')
        }
        return this.url('index.html?view=portal')
      }

      const roles = user.roles || []
      const isMgr = roles.some((r) =>
        String(r).includes('studio_manager') || String(r).includes('system_admin') || String(r).includes('مدیر')
      )
      if (user.portalType === 'staff') return this.url('index.html?view=portal')
      if (isMgr) return this.inStudioM() ? './' : this.url('studio-m/')
      return this.url('index.html?view=portal')
    },

    goLanding(user) {
      const href = this.landingFor(user)
      if (!href) return
      // جلوگیری از حلقه
      const here = location.pathname + location.search
      if (here.endsWith('studio-m/') || here.endsWith('studio-m/index.html')) {
        if (href === './' || href.includes('studio-m')) return
      }
      if (here.includes('view=portal') && href.includes('view=portal')) return
      location.href = href
    },

    /** گارد: نقش اشتباه در صفحه اشتباه */
    guard() {
      if (typeof Auth === 'undefined') return
      const logged = Auth.isLoggedIn?.()
      const user = Auth.getUser?.()
      const path = location.pathname || ''
      const params = new URLSearchParams(location.search || '')

      // studio-m بدون لاگین
      if (this.inStudioM() && !logged) {
        location.replace(this.url('index.html'))
        return
      }

      // پرسنل نباید در studio-m بماند
      if (this.inStudioM() && logged && user) {
        if (user.portalType === 'staff' || (typeof Access !== 'undefined' && Access.isStaffOnly?.(user))) {
          location.replace(this.url('index.html?view=portal'))
          return
        }
      }

      // مدیر لاگین‌شده روی صفحه ورود خالی (بدون view=portal و بدون تب register)
      if (
        logged &&
        user &&
        /index\.html$/i.test(path.split('/').pop() || '') &&
        !params.get('view') &&
        !params.get('tab') &&
        document.body.classList.contains('auth-screen')
      ) {
        // فقط اگر UI ورود دیده می‌شود و portal shell نیست
        if (!document.querySelector('.portal-shell')) {
          const dest = this.landingFor(user)
          if (dest && !dest.includes('index.html?view=portal')) {
            location.replace(dest)
          }
        }
      }

      // customer.html بدون session → index
      if (/customer\.html/i.test(path) && typeof CustomerSession !== 'undefined') {
        CustomerSession.get?.().then?.((s) => {
          if (!s?.contract) {
            /* customer.js خودش redirect می‌کند */
          }
        })
      }
    },

    /** یکدست‌سازی Auth.getLandingUrl و Access.getLandingUrl */
    patchLanding() {
      if (typeof Access !== 'undefined' && Access.getLandingUrl && !Access.__engRouter) {
        Access.__engRouter = true
        const orig = Access.getLandingUrl.bind(Access)
        Access.getLandingUrl = function () {
          const u = orig()
          // اگر از studio-m صدا زده شود studio-m/ اشتباه می‌شود
          if (EngRouter.inStudioM()) {
            if (u === 'studio-m/' || u === 'studio-m') return './'
            if (u.startsWith('index.html')) return '../' + u
            if (u.startsWith('customer.html')) return '../' + u
          }
          return u
        }
      }
      if (typeof Auth !== 'undefined' && Auth.getLandingUrl && !Auth.__engRouter) {
        Auth.__engRouter = true
        Auth.getLandingUrl = function () {
          return EngRouter.landingFor(Auth.getUser())
        }
      }
    },

    /** اطمینان از وجود ماژول‌های مشترک روی studio-m */
    ensureStudioMBridges() {
      if (!this.inStudioM()) return
      // eng-global-search نباید FAB بسازد — فقط remove
      try {
        w.EngSearch?.removeFab?.()
      } catch { /* */ }
      // واتساپ از قرارداد
      if (typeof w.EngWhatsApp === 'undefined') {
        this._loadScript('../js/eng-whatsapp.js')
      }
      if (typeof w.StudioFinance === 'undefined') {
        this._loadScript('../js/studio-core-finance.js')
      }
      if (typeof w.EngContractAfish === 'undefined') {
        this._loadScript('../js/eng-contract-afish.js')
      }
    },

    _loadScript(src) {
      if (document.querySelector('script[src="' + src + '"]')) return
      const s = document.createElement('script')
      s.src = src
      s.defer = true
      document.body.appendChild(s)
    },

    boot() {
      this.patchLanding()
      this.guard()
      this.ensureStudioMBridges()
      // تکرار گارد بعد از hydrate auth
      setTimeout(() => this.guard(), 800)
      setTimeout(() => this.guard(), 2000)
      setTimeout(() => this.patchLanding(), 500)
    }
  }

  w.EngRouter = EngRouter

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(() => EngRouter.boot(), 300))
    } else {
      setTimeout(() => EngRouter.boot(), 300)
    }
  }
})(typeof window !== 'undefined' ? window : globalThis)
