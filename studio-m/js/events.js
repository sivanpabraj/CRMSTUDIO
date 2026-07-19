/**
 * Event delegation for Studio M — prefer data-sm-fn over inline onclick.
 * Resolves dotted paths on window (e.g. SMModules.invoices.edit).
 */
const SMEvents = {
  _bound: false,

  bind(root = document) {
    if (this._bound) return
    this._bound = true
    root.addEventListener('click', (e) => {
      const el = e.target.closest?.('[data-sm-fn]')
      if (!el) return
      const fnPath = el.getAttribute('data-sm-fn')
      if (!fnPath) return
      e.preventDefault()
      const argsRaw = el.getAttribute('data-sm-args')
      let args = []
      if (argsRaw) {
        try { args = JSON.parse(argsRaw) } catch { args = [argsRaw] }
      }
      const fn = this.resolve(fnPath)
      if (typeof fn === 'function') {
        try {
          const result = fn.apply(this.resolveContext(fnPath), args)
          if (result && typeof result.catch === 'function') {
            result.catch(err => {
              if (typeof SMObservability !== 'undefined') SMObservability.captureError('sm_event', err, { fnPath })
              else console.error(err)
            })
          }
        } catch (err) {
          if (typeof SMObservability !== 'undefined') SMObservability.captureError('sm_event', err, { fnPath })
          else console.error(err)
        }
      }
    })
  },

  resolve(path) {
    return String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), window)
  },

  resolveContext(path) {
    const parts = String(path).split('.')
    if (parts.length < 2) return window
    return parts.slice(0, -1).reduce((o, k) => (o == null ? o : o[k]), window) || window
  },

  /** Build attributes for delegated actions */
  attrs(fnPath, args = []) {
    const a = Array.isArray(args) ? args : [args]
    return `type="button" data-sm-fn="${String(fnPath).replace(/"/g, '')}" data-sm-args='${JSON.stringify(a).replace(/'/g, '&#39;')}'`
  }
}

if (typeof window !== 'undefined') {
  window.SMEvents = SMEvents
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SMEvents.bind())
  } else {
    SMEvents.bind()
  }
}
