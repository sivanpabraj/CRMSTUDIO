/* Studio M — permission-aware, accessible module launcher */
(() => {
  'use strict'

  const GROUPS = Object.freeze([
    { id: 'main', icon: 'fa-house', order: 1 },
    { id: 'business', icon: 'fa-briefcase', order: 2 },
    { id: 'finance', icon: 'fa-wallet', order: 3 },
    { id: 'hr', icon: 'fa-user-group', order: 4 },
    { id: 'assets', icon: 'fa-camera', order: 5 },
    { id: 'comms', icon: 'fa-comments', order: 6 },
    { id: 'system', icon: 'fa-gear', order: 7 }
  ])

  const normalize = value => String(value || '').trim().toLocaleLowerCase('fa')

  const ModuleLauncher = {
    _lastFocus: null,
    _query: '',

    routes() {
      if (!window.SM) return []
      return window.SM.visibleRoutes().map(route => ({
        ...route,
        label: window.SM.t(route.id),
        search: normalize(`${window.SM.t(route.id)} ${route.id} ${window.SM.t(`group_${route.group}`)}`)
      }))
    },

    groups() {
      const routes = this.routes().filter(route => !this._query || route.search.includes(normalize(this._query)))
      return GROUPS.map(group => ({
        ...group,
        label: window.SM.t(`group_${group.id}`),
        routes: routes.filter(route => route.group === group.id)
      })).filter(group => group.routes.length)
    },

    install() {
      if (!window.SM || window.SM.__moduleLauncherInstalled) return
      const originalRender = window.SM.renderShell.bind(window.SM)
      window.SM.renderShell = (...args) => {
        const result = originalRender(...args)
        this.enhanceHeader()
        return result
      }
      window.SM.__moduleLauncherInstalled = true

      document.addEventListener('keydown', event => {
        const shortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
        if (shortcut) { event.preventDefault(); this.toggle() }
      })
    },

    enhanceHeader() {
      const actions = document.querySelector('.sm-header-actions')
      if (!actions || document.getElementById('sm-launcher-trigger')) return
      const button = document.createElement('button')
      button.type = 'button'
      button.id = 'sm-launcher-trigger'
      button.className = 'sm-btn-icon sm-launcher-trigger'
      button.setAttribute('aria-haspopup', 'dialog')
      button.setAttribute('aria-expanded', 'false')
      button.setAttribute('aria-controls', 'sm-launcher-overlay')
      button.title = 'همه بخش‌ها — Ctrl/⌘ K'
      button.innerHTML = '<i class="fas fa-grid-2" aria-hidden="true"></i><span>همه بخش‌ها</span>'
      button.addEventListener('click', () => this.toggle())
      actions.prepend(button)
    },

    toggle() {
      if (document.getElementById('sm-launcher-overlay')) this.close()
      else this.open()
    },

    open() {
      if (!window.SM || document.getElementById('sm-launcher-overlay')) return
      this._lastFocus = document.activeElement
      this._query = ''
      const overlay = document.createElement('div')
      overlay.id = 'sm-launcher-overlay'
      overlay.className = 'sm-launcher-overlay'
      overlay.addEventListener('click', event => {
        if (event.target === overlay || event.target.closest('[data-launcher-close]')) this.close()
        const item = event.target.closest('[data-launcher-route]')
        if (item) this.select(item.dataset.launcherRoute)
      })
      overlay.addEventListener('keydown', event => this.onKeydown(event))
      document.body.appendChild(overlay)
      document.body.classList.add('sm-sidebar-open')
      this.render()
      document.getElementById('sm-launcher-trigger')?.setAttribute('aria-expanded', 'true')
      overlay.querySelector('input')?.focus()
    },

    close() {
      document.getElementById('sm-launcher-overlay')?.remove()
      document.body.classList.remove('sm-sidebar-open')
      document.getElementById('sm-launcher-trigger')?.setAttribute('aria-expanded', 'false')
      this._lastFocus?.focus?.()
      this._lastFocus = null
    },

    select(route) {
      this.close()
      window.SM.navigate(route)
    },

    search(value) {
      this._query = value || ''
      this.render({ preserveFocus: true })
    },

    render({ preserveFocus = false } = {}) {
      const overlay = document.getElementById('sm-launcher-overlay')
      if (!overlay) return
      const groups = this.groups()
      const query = this._query
      overlay.innerHTML = `
        <section class="sm-launcher" role="dialog" aria-modal="true" aria-labelledby="sm-launcher-title">
          <div class="sm-launcher-head">
            <div class="sm-launcher-search">
              <i class="fas fa-search" aria-hidden="true"></i>
              <input type="search" id="sm-launcher-search" autocomplete="off"
                aria-label="جستجو در بخش‌های سیستم" placeholder="جستجو در همه بخش‌ها..." value="${window.SM.esc(query)}"/>
              <kbd class="sm-launcher-shortcut" aria-hidden="true">Ctrl K</kbd>
            </div>
            <button type="button" class="sm-btn-icon" data-launcher-close aria-label="بستن منوی بخش‌ها">
              <i class="fas fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
          <div class="sm-launcher-body">
            <h2 id="sm-launcher-title" class="sr-only">همه بخش‌های Studio M</h2>
            ${groups.length ? `<div class="sm-launcher-groups">${groups.map(group => `
              <section class="sm-launcher-group" aria-labelledby="sm-launcher-group-${group.id}">
                <h3 class="sm-launcher-group-title" id="sm-launcher-group-${group.id}">
                  <i class="fas ${group.icon}" aria-hidden="true"></i>${window.SM.esc(group.label)}
                </h3>
                <div class="sm-launcher-list">${group.routes.map(route => `
                  <button type="button" class="sm-launcher-item" data-launcher-route="${route.id}"
                    data-active="${window.SM.state.route === route.id}" aria-label="رفتن به ${window.SM.esc(route.label)}">
                    <span class="sm-launcher-item-icon"><i class="fas ${route.icon}" aria-hidden="true"></i></span>
                    <span class="sm-launcher-item-label">${window.SM.esc(route.label)}</span>
                    <i class="fas fa-chevron-left sm-launcher-item-arrow" aria-hidden="true"></i>
                  </button>`).join('')}</div>
              </section>`).join('')}</div>` : `
              <div class="sm-launcher-empty" role="status"><i class="fas fa-magnifying-glass"></i>بخشی با این عبارت پیدا نشد</div>`}
          </div>
          <footer class="sm-launcher-foot"><span>↑↓ حرکت · Enter انتخاب · Esc بستن</span><span>${this.routes().length} بخش در دسترس</span></footer>
        </section>`

      const input = overlay.querySelector('#sm-launcher-search')
      input?.addEventListener('input', event => this.search(event.target.value))
      if (preserveFocus) {
        input?.focus()
        input?.setSelectionRange(query.length, query.length)
      }
    },

    onKeydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); this.close(); return }
      const overlay = document.getElementById('sm-launcher-overlay')
      if (!overlay) return
      const items = [...overlay.querySelectorAll('.sm-launcher-item')]
      const focusables = [...overlay.querySelectorAll('button, input')]

      if (event.key === 'Tab') {
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        return
      }

      if (event.key === 'Home' && items.length) { event.preventDefault(); items[0].focus(); return }
      if (event.key === 'End' && items.length) { event.preventDefault(); items[items.length - 1].focus(); return }
      if (!['ArrowDown', 'ArrowUp'].includes(event.key) || !items.length) return
      event.preventDefault()
      const current = items.indexOf(document.activeElement)
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const start = current >= 0 ? current : (delta > 0 ? -1 : 0)
      items[(start + delta + items.length) % items.length].focus()
    }
  }

  window.SMModuleLauncher = ModuleLauncher
  ModuleLauncher.install()
})()
