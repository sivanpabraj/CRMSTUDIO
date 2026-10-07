/**
 * Studio ERP — Service Worker registration + update UX
 * Engineering: production PWA only; skip aggressive cache on localhost during dev
 */
(() => {
  if (!('serviceWorker' in navigator)) return

  const isLocal =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '[::1]'

  // On localhost allow opt-out via ?nosw=1 for clean debugging
  if (isLocal && /[?&]nosw=1/.test(location.search)) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister())
    })
    return
  }

  const swPath = location.pathname.includes('/studio-m/') ? '../sw.js' : './sw.js'

  const register = () => {
    navigator.serviceWorker
      .register(swPath, { scope: location.pathname.includes('/studio-m/') ? '../' : './' })
      .then((reg) => {
        if (reg.update) reg.update()

        reg.addEventListener('updatefound', () => {
          const worker = reg.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version ready — soft prompt via custom event
              window.dispatchEvent(new CustomEvent('crmstudio:sw-update', { detail: { reg } }))
            }
          })
        })
      })
      .catch(() => {
        /* PWA optional */
      })
  }

  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register)
})()
