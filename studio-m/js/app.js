/* Studio M Pro — Application Bootstrap */
function fixNestedStudioPath() {
  const path = location.pathname
  if (path.includes('/studio-m/studio-m')) {
    const clean = path.replace(/(\/studio-m)+/g, '/studio-m')
    location.replace(clean + location.search + location.hash)
  }
}

document.addEventListener('DOMContentLoaded', () => {
  fixNestedStudioPath()
  Bootstrap.start(async () => {
    if (!SM.guard()) return

    SM.initPrefs()
    document.title = `Studio ERP — ${SM.studio().name || 'Studio ERP'}`
    SM.renderShell()

    if (typeof SMOnboarding !== 'undefined' && SMOnboarding.needs()) {
      SMOnboarding.show()
      return
    }

    const resolveRoute = (key) => {
      const k = String(key || '').replace('#', '').trim()
      if (k === 'gallery') return 'media'
      if (k === 'crm') return 'bookings'
      return k || 'dashboard'
    }

    const r = resolveRoute(location.hash)
    SM.navigate(SMModules[r] ? r : 'dashboard')
    window.addEventListener('hashchange', () => {
      const hr = resolveRoute(location.hash)
      if (SMModules[hr]) SM.navigate(hr)
    })
    if (typeof Auth !== 'undefined') {
      setInterval(() => {
        Auth.checkSessionExpiry?.()
        if (!Auth.isLoggedIn()) SM.guard()
      }, 300000)
    }
    SM.log('app_open', 'Studio ERP')
    if (typeof SMModules.calendar?.runMorningReminders === 'function') {
      SMModules.calendar.runMorningReminders().catch(() => {})
    }
    if (typeof NotificationTicker !== 'undefined') {
      NotificationTicker.init('studio')
    }
    if (typeof BackupService !== 'undefined') {
      BackupService.init()
    }
  })
})
