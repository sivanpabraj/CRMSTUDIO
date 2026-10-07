/**
 * Glass boot — wires KPI strip + contract share chips after Studio M loads.
 * Safe to load on every update; no-ops if modules missing.
 */
(function () {
  function injectManagerKpis() {
    try {
      if (typeof GlassStats === 'undefined' || typeof RoleDash === 'undefined') return
      const root = document.querySelector('#sm-root .sm-main, #sm-root .sm-content, #sm-root')
      if (!root) return
      // Prefer dashboard content area
      const dash = document.querySelector('.sm-exec-dashboard, .sm-dash-sections-container, .sm-main-body, [data-module="dashboard"]')
      const target = dash || root
      if (!target) return
      if (target.querySelector('[data-glass-kpi="manager"]')) return
      // Only on dashboard hash
      const route = (location.hash || '#dashboard').replace('#', '') || 'dashboard'
      if (route !== 'dashboard') return
      RoleDash.enhanceManagerDashboard(target)
    } catch (e) {
      console.warn('[glass-boot] kpi', e)
    }
  }

  function enhanceContractRows() {
    try {
      if (typeof DispatchShareLog === 'undefined' || !DispatchShareLog.lastShareChips) return
      const route = (location.hash || '').replace('#', '')
      if (route !== 'contracts') return
      const contracts = (typeof DB !== 'undefined' && DB.get('contracts')) || []
      if (!contracts.length) return
      // Annotate any row/card that has data-id matching contract
      document.querySelectorAll('[data-id], .sm-contract-row, .sm-card').forEach((el) => {
        const id = el.getAttribute('data-id') || el.dataset?.id
        if (!id) return
        const c = contracts.find((x) => x.id === id)
        if (!c || !c.shareLog || !c.shareLog.length) return
        if (el.querySelector('.share-log-chip')) return
        const slot = document.createElement('div')
        slot.style.cssText = 'margin-top:6px;display:flex;flex-wrap:wrap;gap:4px'
        slot.innerHTML = DispatchShareLog.lastShareChips(c)
        el.appendChild(slot)
      })
    } catch (e) {
      console.warn('[glass-boot] share chips', e)
    }
  }

  function enhanceShareButtons() {
    try {
      // Global helper used from contract actions if present
      window.shareContract = function (contractId) {
        const c = DB.find('contracts', (x) => x.id === contractId)
        if (!c) return
        if (typeof DispatchHub !== 'undefined' && DispatchHub.showContractShareModal) {
          DispatchHub.showContractShareModal(c)
        }
      }
    } catch { /* */ }
  }

  function run() {
    injectManagerKpis()
    enhanceContractRows()
    enhanceShareButtons()
  }

  // Hook SM.navigate if available
  function patchNavigate() {
    if (typeof SM === 'undefined' || typeof SM.navigate !== 'function') return
    if (SM.navigate.__glassPatched) return
    const orig = SM.navigate.bind(SM)
    SM.navigate = function (route) {
      const r = orig(route)
      setTimeout(run, 80)
      setTimeout(run, 400)
      return r
    }
    SM.navigate.__glassPatched = true
  }

  function start() {
    patchNavigate()
    run()
    setTimeout(run, 600)
    window.addEventListener('hashchange', () => setTimeout(run, 100))
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0))
  } else {
    setTimeout(start, 0)
  }
  window.addEventListener('load', () => setTimeout(start, 200))
})()
