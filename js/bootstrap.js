/* ══════════════════════════════════════════════
   تالار — Bootstrap: بارگذاری DB و راه‌اندازی اپ
   ══════════════════════════════════════════════ */

const Bootstrap = {
  _showLoader() {
    if (document.getElementById('talar-loader')) return
    const el = document.createElement('div')
    el.id = 'talar-loader'
    el.innerHTML = `
      <div class="talar-loader-inner">
        <div class="talar-loader-ring">📸</div>
        <div class="talar-loader-title">${AppConfig.APP_NAME}</div>
        <div class="talar-loader-sub">نسخه ${AppConfig.APP_VERSION} — در حال بارگذاری...</div>
        <div class="talar-loader-bar"><div class="talar-loader-fill"></div></div>
      </div>`
    document.body.prepend(el)
  },

  _hideLoader() {
    const el = document.getElementById('talar-loader')
    if (el) {
      el.classList.add('talar-loader-out')
      setTimeout(() => el.remove(), 400)
    }
  },

  _showFatalError(error) {
    const root = document.getElementById('sm-root') || document.body
    root.innerHTML = `<main class="sm-bootstrap-error" role="alert">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      <h1>بارگذاری کامل نشد</h1>
      <p>داده‌ها تغییر نکرده‌اند. اتصال و فضای ذخیره‌سازی مرورگر را بررسی کنید.</p>
      <div><button type="button" id="sm-bootstrap-retry">تلاش مجدد</button><button type="button" id="sm-bootstrap-logout">خروج امن</button></div>
      <details><summary>جزئیات فنی</summary><code>${String(error?.message || 'bootstrap_failed').replace(/[<>&]/g, '')}</code></details>
    </main>`
    document.getElementById('sm-bootstrap-retry')?.addEventListener('click', () => location.reload())
    document.getElementById('sm-bootstrap-logout')?.addEventListener('click', () => {
      try { Auth?.logout?.() } catch { /* */ }
      location.href = './index.html?logout=1'
    })
  },

  _bindGlobalErrorHandler() {
    if (this._errorBound) return
    this._errorBound = true
    const handler = (msg, src, line, col, err) => {
      if (typeof SMObservability !== 'undefined') {
        SMObservability.captureError('global', err || new Error(String(msg || 'error')), {
          src: src || '',
          line: line || 0,
          col: col || 0
        })
      } else {
        console.error('Global error', msg, src, line, col, err)
      }
      if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast('خطای غیرمنتظره رخ داد', 'error')
      return false
    }
    window.addEventListener('error', e => handler(e.message, e.filename, e.lineno, e.colno, e.error))
    window.addEventListener('unhandledrejection', e => handler(e.reason?.message || 'Unhandled rejection', '', 0, 0, e.reason))
  },

  async start(initFn) {
    this._showLoader()
    try {
      this._bindGlobalErrorHandler()
      if (typeof DB !== 'undefined' && DB.ready) await DB.ready
      await this._waitCloud()
      if (typeof Auth !== 'undefined' && Auth.verifySessionSignature) {
        try {
          await Auth.verifySessionSignature()
        } catch (e) {
          if (typeof SMObservability !== 'undefined') {
            SMObservability.captureError('session_verify', e)
          } else {
            console.error('[Bootstrap] session verify failed', e)
          }
          try { Auth.logout?.() } catch { /* */ }
        }
      }
      if (typeof Auth !== 'undefined' && Auth.getCsrfToken) {
        Auth.getCsrfToken()
      }
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
      if (typeof initFn === 'function') await initFn()
      else if (typeof initFn === 'string' && window[initFn]?.init) window[initFn].init()
    } catch (e) {
      console.error('Bootstrap failed:', e)
      if (typeof Utils !== 'undefined') Utils.toast('خطا در بارگذاری داده‌ها', 'error')
      this._showFatalError(e)
    } finally {
      this._hideLoader()
    }
  },

  _waitCloud() {
    if (typeof Cloud !== 'undefined') return Promise.resolve()
    return new Promise(resolve => {
      const done = () => resolve()
      if (typeof Cloud !== 'undefined') return done()
      window.addEventListener('cloud-ready', done, { once: true })
      setTimeout(done, 4000)
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
