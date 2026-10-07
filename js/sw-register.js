/**
 * Studio ERP — Service Worker registration + update UX
 * Survives legacy pages that call unregister() in <head>.
 */
(() => {
  if (!('serviceWorker' in navigator)) return

  const isLocal =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '[::1]'

  if (isLocal && /[?&]nosw=1/.test(location.search)) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister())
    })
    return
  }

  const inStudioM = location.pathname.includes('/studio-m/')
  const swPath = inStudioM ? '../sw.js' : './sw.js'
  const scope = inStudioM ? '../' : './'

  const register = () => {
    navigator.serviceWorker
      .register(swPath, { scope })
      .then((reg) => {
        if (reg.update) reg.update()
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('crmstudio:sw-update', { detail: { reg } }))
            }
          })
        })
      })
      .catch(() => {})
  }

  // Immediate + delayed (beats head-level unregister race on index.html)
  const run = () => {
    register()
    setTimeout(register, 400)
  }

  if (document.readyState === 'complete') run()
  else window.addEventListener('load', run)
})()
