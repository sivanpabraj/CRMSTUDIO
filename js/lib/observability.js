/**
 * Studio M — lightweight client observability
 * Captures structured errors for console + optional future remote sink.
 */
const SMObservability = {
  _buf: [],
  _max: 100,

  captureError(scope, err, meta = {}) {
    const entry = {
      ts: new Date().toISOString(),
      level: 'error',
      scope: String(scope || 'app'),
      message: err?.message || String(err || 'unknown'),
      stack: err?.stack ? String(err.stack).slice(0, 800) : '',
      meta
    }
    this._buf.push(entry)
    if (this._buf.length > this._max) this._buf = this._buf.slice(-this._max)
    try {
      console.error(`[SM:${entry.scope}]`, entry.message, meta)
    } catch { /* */ }
    try {
      if (typeof DB !== 'undefined' && typeof DB.log === 'function') {
        DB.log('obs_error', `${entry.scope}: ${entry.message}`)
      }
    } catch { /* */ }
    return entry
  },

  captureEvent(name, meta = {}) {
    const entry = { ts: new Date().toISOString(), level: 'info', scope: name, meta }
    this._buf.push(entry)
    if (this._buf.length > this._max) this._buf = this._buf.slice(-this._max)
    return entry
  },

  recent(n = 20) {
    return this._buf.slice(-n)
  }
}

if (typeof window !== 'undefined') window.SMObservability = SMObservability
