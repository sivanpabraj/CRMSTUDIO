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
    document.title = `Studio M Pro — ${SM.studio().name || 'Studio M'}`
    SM.renderShell()

    if (typeof SMOnboarding !== 'undefined' && SMOnboarding.needs()) {
      SMOnboarding.show()
      return
    }

    const route = (location.hash || '#dashboard').replace('#', '') || 'dashboard'
    const r = route === 'gallery' || route === 'media' || route === 'signatures' ? 'dashboard' : route
    const initialRoute = SM.getRoutes().some(item => item.id === r) ? r : 'dashboard'
    await SM.navigate(initialRoute)
    SM.bindLiveSync?.()
    if (typeof Cloud !== 'undefined' && Cloud.stashOAuthConfig && Cloud.isConfigured?.()) {
      Cloud.stashOAuthConfig({ intent: 'signin' })
    }
    if (typeof SMSettings !== 'undefined' && SMSettings.finishGoogleOAuthIfNeeded) {
      SMSettings.finishGoogleOAuthIfNeeded().catch(() => {})
    }
    window.addEventListener('hashchange', () => {
      const raw = (location.hash || '#dashboard').replace('#', '') || 'dashboard'
      const hr = raw === 'gallery' || raw === 'media' || raw === 'signatures' ? 'dashboard' : raw
      SM.navigate(hr)
    })
    if (typeof Auth !== 'undefined') {
      setInterval(() => {
        Auth.checkSessionExpiry?.()
        if (!Auth.isLoggedIn()) SM.guard()
      }, 300000)
    }
    SM.log('app_open', 'Studio M Pro')
    if (typeof SMModules.calendar?.runMorningReminders === 'function') {
      SMModules.calendar.runMorningReminders().catch(() => {})
    }
    if (typeof ChequeManager !== 'undefined') {
      ChequeManager.syncNotifications().catch(() => {})
    }
    if (typeof NotificationTicker !== 'undefined') {
      NotificationTicker.init('studio')
    }
    if (typeof BackupService !== 'undefined') {
      BackupService.init()
    }
  })
})
