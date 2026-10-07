/**
 * Role-oriented dashboard strips — inject glass KPIs where shell allows
 */
const RoleDash = {
  /** Call from SMDashboard.render after mount if available */
  enhanceManagerDashboard(container) {
    if (!container || typeof GlassStats === 'undefined') return
    if (container.querySelector('[data-glass-kpi="manager"]')) return
    const wrap = document.createElement('div')
    wrap.dataset.glassKpi = 'manager'
    wrap.innerHTML = GlassStats.managerKpis()
    container.insertBefore(wrap, container.firstChild)
  },

  renderStaffStrip(el, user) {
    if (!el || typeof GlassStats === 'undefined') return
    el.innerHTML = `<div class="glass-card" style="padding:16px;margin-bottom:14px">
      <div class="glass-panel-head"><h3><i class="fas fa-user-tie"></i> کارتابل من</h3></div>
      ${GlassStats.staffKpis(user?.id, user?.phone)}
    </div>` + (el.innerHTML || '')
  },

  renderCustomerStrip(el, contract) {
    if (!el || typeof GlassStats === 'undefined') return
    el.innerHTML = `<div class="glass-card" style="padding:16px;margin-bottom:14px">
      <div class="glass-panel-head"><h3><i class="fas fa-heart"></i> قرارداد شما</h3></div>
      ${GlassStats.customerKpis(contract)}
    </div>` + (el.innerHTML || '')
  }
}

window.RoleDash = RoleDash
