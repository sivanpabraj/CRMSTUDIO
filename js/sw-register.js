(() => {
  if (!('serviceWorker' in navigator)) return

  const local = (() => {
    try {
      const h = location.hostname
      return h === 'localhost' || h === '127.0.0.1' || h === '::1'
    } catch { return false }
  })()

  // Vite HMR + a buggy SW cache would blank login/site pages during local testing.
  if (local) {
    navigator.serviceWorker.getRegistrations?.().then(regs => {
      regs.forEach(r => r.unregister())
    }).catch(() => {})
    return
  }

  const swPath = location.pathname.includes('/studio-m/') ? '../sw.js' : 'sw.js'
  navigator.serviceWorker.register(swPath).catch(() => {
    /* silent: PWA is optional */
  })
})()
