/**
 * Studio M — lightweight client observability
 * Captures structured errors for console + optional future remote sink.
 */
const SMObservability = {
  _buf: [],
  _max: 100,
  _bound: false,

  _redact(value, depth = 0) {
    if (depth > 4) return '[truncated]'
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return value
    if (typeof value === 'string') {
      return value
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
        .replace(/\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,}]+/gi, '$1=[redacted]')
        .slice(0, 1000)
    }
    if (Array.isArray(value)) return value.slice(0, 30).map(v => this._redact(v, depth + 1))
    if (typeof value === 'object') {
      const out = {}
      for (const [key, item] of Object.entries(value).slice(0, 50)) {
        out[key] = /password|secret|token|authorization|api.?key/i.test(key)
          ? '[redacted]'
          : this._redact(item, depth + 1)
      }
      return out
    }
    return String(value).slice(0, 200)
  },

  captureError(scope, err, meta = {}) {
    const entry = {
      ts: new Date().toISOString(),
      level: 'error',
      scope: String(scope || 'app'),
      message: err?.message || String(err || 'unknown'),
      stack: err?.stack ? String(err.stack).slice(0, 800) : '',
      meta: this._redact(meta)
    }
    this._buf.push(entry)
    if (this._buf.length > this._max) this._buf = this._buf.slice(-this._max)
    try {
      console.error(`[SM:${entry.scope}]`, entry.message, meta)
    } catch { /* */ }
    // Avoid DB.log on persist failures — that re-dirties the store
    if (!meta?.noDbLog) {
      try {
        if (typeof DB !== 'undefined' && typeof DB.log === 'function') {
          DB.log('obs_error', `${entry.scope}: ${entry.message}`)
        }
      } catch { /* */ }
    }
    this._maybeRemote(entry)
    return entry
  },

  captureEvent(name, meta = {}) {
    const entry = { ts: new Date().toISOString(), level: 'info', scope: name, meta: this._redact(meta) }
    this._buf.push(entry)
    if (this._buf.length > this._max) this._buf = this._buf.slice(-this._max)
    this._maybeRemote(entry)
    return entry
  },

  recent(n = 20) {
    return this._buf.slice(-n)
  },

  bindGlobalHandlers() {
    if (this._bound || typeof window === 'undefined') return
    this._bound = true
    window.addEventListener('error', event => {
      this.captureError('window_error', event.error || new Error(event.message), { noDbLog: true })
    })
    window.addEventListener('unhandledrejection', event => {
      const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason || 'rejection'))
      this.captureError('unhandled_rejection', reason, { noDbLog: true })
    })
  },

  /** Optional remote sink: studioInfo.observabilityUrl or window.__SM_OBS_URL */
  _maybeRemote(entry) {
    try {
      const url = (typeof DB !== 'undefined' && DB.get?.('studioInfo')?.observabilityUrl) ||
        (typeof window !== 'undefined' && window.__SM_OBS_URL) || ''
      if (!url || typeof fetch !== 'function') return
      // Fire-and-forget; never block UI
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...entry,
          app: 'studio-m',
          v: (typeof AppConfig !== 'undefined' && AppConfig.APP_VERSION) || '6.0.0'
        }),
        keepalive: true,
        mode: 'cors'
      }).catch(() => {})
    } catch { /* */ }
  }
}

if (typeof window !== 'undefined') window.SMObservability = SMObservability
if (typeof window !== 'undefined') SMObservability.bindGlobalHandlers()

export { SMObservability }
