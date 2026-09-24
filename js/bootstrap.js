/* ══════════════════════════════════════════════
   تالار — Bootstrap: بارگذاری DB و راه‌اندازی اپ
   ══════════════════════════════════════════════ */

const Bootstrap = {
  _safetyTimer: null,

  _showLoader() {
    if (document.body.classList.contains('auth-screen') || location.pathname.endsWith('/index.html') || location.pathname === '/' || location.pathname.endsWith('/site.html')) {
      return
    }
    if (document.getElementById('talar-loader')) return
    const el = document.createElement('div')
    el.id = 'talar-loader'
    el.innerHTML = `
      <div class="talar-loader-inner">
        <div class="talar-loader-circle-wrap">
          <svg class="talar-loader-svg" viewBox="0 0 64 64" aria-hidden="true">
            <circle class="talar-loader-bg" cx="32" cy="32" r="28"></circle>
            <circle class="talar-loader-progress" cx="32" cy="32" r="28"></circle>
          </svg>
          <div class="talar-loader-icon"><i class="fas fa-camera"></i></div>
        </div>
        <div class="talar-loader-sub">در حال بارگذاری...</div>
        <div class="talar-loader-ver">نسخه ۱</div>
      </div>`
    document.body.prepend(el)

    // تضمین قطعی عدم گیر کردن لودر — بعد از حداکثر ۲ ثانیه به صورت خودکار محو می‌شود
    if (this._safetyTimer) clearTimeout(this._safetyTimer)
    this._safetyTimer = setTimeout(() => {
      this._hideLoader()
    }, 2200)
  },

  _hideLoader() {
    if (this._safetyTimer) {
      clearTimeout(this._safetyTimer)
      this._safetyTimer = null
    }
    const el = document.getElementById('talar-loader')
    if (el) {
      el.classList.add('talar-loader-out')
      setTimeout(() => el.remove(), 350)
    }
  },

  _bindGlobalErrorHandler() {
    if (this._errorBound) return
    this._errorBound = true
    const handler = (msg, src, line, col, err) => {
      console.error('Global error', msg, src, line, col, err)
      if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast('خطای غیرمنتظره رخ داد', 'error')
      if (typeof DB !== 'undefined') {
        try {
          if (typeof SecureDB !== 'undefined' && SecureDB.systemInsert) {
            SecureDB.systemInsert('logs', {
              action: 'error',
              detail: `${msg} @ ${src}:${line}:${col}`,
              timestamp: new Date().toISOString(),
              stack: err?.stack || ''
            })
          } else if (DB.insert) {
            DB.insert('logs', {
              action: 'error',
              detail: `${msg} @ ${src}:${line}:${col}`,
              timestamp: new Date().toISOString(),
              stack: err?.stack || ''
            })
          }
          DB.flush?.()
        } catch { /* */ }
      }
      return false
    }
    window.addEventListener('error', e => handler(e.message, e.filename, e.lineno, e.colno, e.error))
    window.addEventListener('unhandledrejection', e => handler(e.reason?.message || 'Unhandled rejection', '', 0, 0, e.reason))
  },

  async start(initFn) {
    this._showLoader()
    try {
      this._bindGlobalErrorHandler()
      if (typeof DB !== 'undefined' && DB.ready) {
        await Promise.race([
          DB.ready,
          new Promise(resolve => setTimeout(resolve, 1500))
        ])
      }
      // همگام‌سازی سریع با سرور مرکزی (در صورت در دسترس بودن)
      if (typeof window !== 'undefined') {
        try {
          const syncPull = (async () => {
            if (typeof ServerSync !== 'undefined' && ServerSync.pull) {
              await ServerSync.pull({ initial: true })
            } else {
              const res = await fetch('/api/sync/pull?rev=0', { cache: 'no-store' })
              if (res.ok) {
                const j = await res.json()
                if (j.data && typeof DB !== 'undefined' && DB.importJSON) {
                  await DB.importJSON(JSON.stringify(j.data))
                }
              }
            }
          })()
          await Promise.race([
            syncPull,
            new Promise(resolve => setTimeout(resolve, 2000))
          ])
        } catch { /* offline / network failure */ }
      }
      if (typeof Auth !== 'undefined' && Auth.verifySessionSignature) {
        try { await Auth.verifySessionSignature() } catch { /* */ }
      }
      if (typeof Auth !== 'undefined' && Auth.getCsrfToken) {
        Auth.getCsrfToken()
      }
      await this._waitCloud()
      if (typeof Cloud !== 'undefined' && Cloud.bootstrap) {
        try {
          await Promise.race([
            Cloud.bootstrap(),
            new Promise(resolve => setTimeout(resolve, 5000))
          ])
        } catch (e) { console.warn('[Cloud] bootstrap', e) }
      }
      if (typeof Utils !== 'undefined') Utils.applyStudioTitle()
      if (typeof GlassTheme !== 'undefined') GlassTheme.init()
      if (typeof initFn === 'function') {
        await Promise.race([
          Promise.resolve(initFn()),
          new Promise(resolve => setTimeout(resolve, 2500))
        ])
      } else if (typeof initFn === 'string' && window[initFn]?.init) {
        window[initFn].init()
      }
    } catch (e) {
      console.error('Bootstrap failed:', e)
      if (typeof Utils !== 'undefined') Utils.toast('خطا در بارگذاری داده‌ها', 'error')
    } finally {
      this._hideLoader()
    }
  },

  _waitCloud() {
    if (typeof Cloud !== 'undefined') return Promise.resolve()
    const hasCloudScript = typeof document !== 'undefined' && !!document.querySelector('script[src*="cloud"]')
    if (!hasCloudScript) return Promise.resolve()
    return new Promise(resolve => {
      const done = () => resolve()
      if (typeof Cloud !== 'undefined') return done()
      window.addEventListener('cloud-ready', done, { once: true })
      setTimeout(done, 1500)
    })
  },

  showChangelogIfNeeded() {
    if (Utils.storage.get(AppConfig.CHANGELOG_SEEN_KEY)) return
    const modal = document.createElement('div')
    modal.className = 'talar-changelog-overlay open'
    modal.innerHTML = `
      <div class="talar-changelog-card">
        <div class="talar-changelog-head">
          <span>🎉</span>
          <div>
            <h2>ارتقا به نسخه ${AppConfig.APP_VERSION}</h2>
            <p>تغییرات مهم این نسخه</p>
          </div>
        </div>
        <div class="talar-changelog-list">
          ${AppConfig.CHANGELOG.map(c => `
            <div class="talar-changelog-item">
              <span class="talar-changelog-icon">${c.icon}</span>
              <div><strong>${c.title}</strong><p>${c.desc}</p></div>
            </div>`).join('')}
        </div>
        <button class="talar-changelog-btn" id="talar-changelog-close">متوجه شدم ✓</button>
      </div>`
    document.body.appendChild(modal)
    document.getElementById('talar-changelog-close')?.addEventListener('click', () => {
      Utils.storage.set(AppConfig.CHANGELOG_SEEN_KEY, true)
      modal.remove()
    })
  }
}

window.Bootstrap = Bootstrap
