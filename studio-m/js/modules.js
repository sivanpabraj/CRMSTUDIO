/* Studio M Pro — Module registry (split files load next) */
const SMModules = {}

/* ── Dashboard ── */
SMModules.dashboard = {
  render(el) {
    if (typeof SMDashboard !== 'undefined') {
      SMDashboard.render(el)
      return
    }
    el.innerHTML = SMUI.empty('fa-gauge-high', 'داشبورد')
  }
}

window.SMModules = SMModules
