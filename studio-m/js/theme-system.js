/* Studio M — accessible three-mode theme system (STE100) */
(() => {
  'use strict'

  const STORAGE_KEY = 'sm_theme'
  const COLLAPSE_KEY = 'sm_sidebar_collapsed'
  const THEMES = Object.freeze([
    { id: 'light', label: 'روشن', detail: 'خوانا برای استفاده روزانه', icon: 'sun' },
    { id: 'dark', label: 'تاریک', detail: 'کنتراست آرام در محیط کم‌نور', icon: 'moon' },
    { id: 'dark-glass', label: 'شیشه‌ای تیره', detail: 'تم حرفه‌ای Dark Glass', icon: 'wand-magic-sparkles' }
  ])

  const validTheme = value => THEMES.some(item => item.id === value) ? value : 'light'

  const ThemeSystem = {
    get theme() {
      return validTheme(localStorage.getItem(STORAGE_KEY))
    },

    apply(theme, { persist = true, announce = false } = {}) {
      const next = validTheme(theme)
      if (persist) localStorage.setItem(STORAGE_KEY, next)
      if (window.SM?.state) window.SM.state.theme = next
      document.body.dataset.theme = next
      document.documentElement.style.colorScheme = next === 'light' ? 'light' : 'dark'
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.content = next === 'light' ? '#f5f5f7' : next === 'dark-glass' ? '#080d12' : '#000000'
      this.enhanceShell()
      document.dispatchEvent(new CustomEvent('sm:themechange', { detail: { theme: next } }))
      if (announce && window.SM?.toast) {
        const label = THEMES.find(item => item.id === next)?.label || next
        window.SM.toast(`تم «${label}» فعال شد`, 'success')
      }
      return next
    },

    cycle() {
      const index = THEMES.findIndex(item => item.id === this.theme)
      return this.apply(THEMES[(index + 1) % THEMES.length].id, { announce: true })
    },

    setCollapsed(collapsed) {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
      document.body.classList.toggle('sm-sidebar-collapsed', collapsed)
      const button = document.getElementById('sm-sidebar-collapse')
      if (button) {
        button.setAttribute('aria-expanded', String(!collapsed))
        button.title = collapsed ? 'باز کردن نوار کناری' : 'جمع کردن نوار کناری'
      }
    },

    toggleCollapsed() {
      this.setCollapsed(!document.body.classList.contains('sm-sidebar-collapsed'))
    },

    enhanceShell() {
      const sidebar = document.getElementById('sm-sidebar')
      const head = sidebar?.querySelector('.sm-sidebar-head')
      if (head && !document.getElementById('sm-sidebar-collapse')) {
        const button = document.createElement('button')
        button.type = 'button'
        button.id = 'sm-sidebar-collapse'
        button.className = 'sm-btn-icon sm-sidebar-collapse'
        button.setAttribute('aria-label', 'تغییر اندازه نوار کناری')
        button.innerHTML = '<i class="fas fa-angles-right" aria-hidden="true"></i>'
        button.addEventListener('click', () => this.toggleCollapsed())
        head.querySelector('.sm-brand')?.appendChild(button)
      }
      this.setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1')

      document.querySelectorAll('.sm-nav-item').forEach(item => {
        const active = item.classList.contains('active')
        if (active) item.setAttribute('aria-current', 'page')
        else item.removeAttribute('aria-current')
        const label = item.querySelector('span')?.textContent?.trim()
        if (label && !item.getAttribute('aria-label')) item.setAttribute('aria-label', label)
        if (label && !item.title) item.title = label
      })

      const themeButton = document.querySelector('.sm-header-actions button[onclick*="toggleTheme"]')
      if (themeButton) {
        const current = THEMES.find(item => item.id === this.theme) || THEMES[0]
        themeButton.setAttribute('aria-label', `تم فعلی: ${current.label}؛ برای تغییر کلیک کنید`)
        themeButton.title = 'انتخاب تم'
        themeButton.innerHTML = `<i class="fas fa-${current.icon}" aria-hidden="true"></i>`
      }
    },

    openPicker() {
      document.getElementById('sm-theme-overlay')?.remove()
      const overlay = document.createElement('div')
      overlay.id = 'sm-theme-overlay'
      overlay.className = 'sm-theme-overlay'
      overlay.innerHTML = `
        <section class="sm-theme-dialog" role="dialog" aria-modal="true" aria-labelledby="sm-theme-title">
          <div class="sm-theme-dialog-head">
            <div>
              <h2 id="sm-theme-title">انتخاب ظاهر</h2>
              <p>تم روشن پیش‌فرض است. انتخاب شما روی این دستگاه ذخیره می‌شود.</p>
            </div>
            <button type="button" class="sm-btn-icon" data-theme-close aria-label="بستن"><i class="fas fa-xmark" aria-hidden="true"></i></button>
          </div>
          <div class="sm-theme-options" role="radiogroup" aria-label="تم‌های رابط">
            ${THEMES.map(item => `
              <button type="button" class="sm-theme-option" role="radio" data-theme-id="${item.id}"
                aria-checked="${item.id === this.theme}">
                <span class="sm-theme-preview sm-theme-preview--${item.id === 'dark-glass' ? 'glass' : item.id}" aria-hidden="true"></span>
                <span><strong>${item.label}</strong><small>${item.detail}</small></span>
              </button>`).join('')}
          </div>
        </section>`

      const close = () => {
        overlay.remove()
        document.removeEventListener('keydown', onKeydown)
      }
      const onKeydown = event => {
        if (event.key === 'Escape') close()
        if (event.key !== 'Tab') return
        const focusable = [...overlay.querySelectorAll('button:not([disabled])')]
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }

      overlay.addEventListener('click', event => {
        if (event.target === overlay || event.target.closest('[data-theme-close]')) close()
        const option = event.target.closest('[data-theme-id]')
        if (!option) return
        this.apply(option.dataset.themeId, { announce: true })
        overlay.querySelectorAll('[role="radio"]').forEach(node => {
          node.setAttribute('aria-checked', String(node === option))
        })
      })
      document.addEventListener('keydown', onKeydown)
      document.body.appendChild(overlay)
      overlay.querySelector('[aria-checked="true"]')?.focus()
    },

    install() {
      if (!window.SM || window.SM.__themeSystemInstalled) return
      const originalInit = window.SM.initPrefs.bind(window.SM)
      const originalRender = window.SM.renderShell.bind(window.SM)
      const originalNavigate = window.SM.navigate.bind(window.SM)

      window.SM.initPrefs = (...args) => {
        originalInit(...args)
        this.apply(this.theme, { persist: false })
      }
      window.SM.toggleTheme = () => this.openPicker()
      window.SM.renderShell = (...args) => {
        const result = originalRender(...args)
        this.enhanceShell()
        return result
      }
      window.SM.navigate = (...args) => {
        const result = originalNavigate(...args)
        this.enhanceShell()
        return result
      }
      window.SM.__themeSystemInstalled = true

      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !document.getElementById('sm-theme-overlay')) window.SM.closeSidebar?.()
      })
    }
  }

  window.SMThemeSystem = ThemeSystem
  ThemeSystem.install()
})()
