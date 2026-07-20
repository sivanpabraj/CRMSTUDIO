/**
 * Event delegation for Studio M — prefer data-sm-fn over inline handlers.
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
      if (el.hasAttribute('data-sm-stop')) e.stopPropagation()
      this._dispatch(e, 'data-sm-fn', { preventDefault: true })
    })
    root.addEventListener('input', (e) => this._dispatch(e, 'data-sm-input-fn', {
      preventDefault: false,
      extraArgs: [e.target?.value]
    }))
    root.addEventListener('change', (e) => this._dispatch(e, 'data-sm-change-fn', {
      preventDefault: false,
      extraArgs: [e.target?.value, e.target]
    }))
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      const el = e.target.closest?.('[data-sm-fn][role="button"], [data-sm-fn].sm-stat--click')
      if (!el) return
      if (e.key === ' ') e.preventDefault()
      el.click()
    })
  },

  _dispatch(e, attrName, { preventDefault = true, extraArgs = [] } = {}) {
    const el = e.target.closest?.(`[${attrName}]`)
    if (!el) return
    const fnPath = el.getAttribute(attrName)
    if (!fnPath) return
    if (preventDefault) e.preventDefault()
    const argsRaw = el.getAttribute('data-sm-args')
    let args = []
    if (argsRaw) {
      try { args = JSON.parse(argsRaw) } catch { args = [argsRaw] }
    }
    if (extraArgs.length) args = args.concat(extraArgs)
    const fn = this.resolve(fnPath)
    if (typeof fn !== 'function') return
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
  },

  resolve(path) {
    return String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), window)
  },

  resolveContext(path) {
    const parts = String(path).split('.')
    if (parts.length < 2) return window
    return parts.slice(0, -1).reduce((o, k) => (o == null ? o : o[k]), window) || window
  },

  /** Build attributes for delegated click actions */
  attrs(fnPath, args = []) {
    const a = Array.isArray(args) ? args : [args]
    return `type="button" data-sm-fn="${String(fnPath).replace(/"/g, '')}" data-sm-args='${JSON.stringify(a).replace(/'/g, '&#39;')}'`
  },

  /** Delegated input handler — passes (…args, value) */
  inputAttrs(fnPath, args = []) {
    const a = Array.isArray(args) ? args : [args]
    return `data-sm-input-fn="${String(fnPath).replace(/"/g, '')}" data-sm-args='${JSON.stringify(a).replace(/'/g, '&#39;')}'`
  },

  /** Element attrs without forcing type=button (overlays, divs) */
  elAttrs(fnPath, args = []) {
    const a = Array.isArray(args) ? args : [args]
    return `data-sm-fn="${String(fnPath).replace(/"/g, '')}" data-sm-args='${JSON.stringify(a).replace(/'/g, '&#39;')}'`
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
