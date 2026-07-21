/**
 * Client for supabase/functions/studio-mutate
 * Feature-flagged: studioInfo.mutateEnabled or window.__SM_MUTATE_ENABLED
 * Offline-first remains SoR until server ledger tables are authoritative.
 */
const StudioMutateClient = {
  enabled() {
    try {
      if (typeof window !== 'undefined' && window.__SM_MUTATE_ENABLED === true) return true
      const info = typeof DB !== 'undefined' ? DB.get?.('studioInfo') : null
      return !!(info && info.mutateEnabled)
    } catch {
      return false
    }
  },

  _endpoint() {
    try {
      if (typeof window !== 'undefined' && window.__SM_MUTATE_URL) return String(window.__SM_MUTATE_URL)
      if (typeof Cloud === 'undefined') return ''
      const cfg = typeof Cloud.resolvedConfig === 'function' ? Cloud.resolvedConfig() : null
      const base = cfg?.url || ''
      if (!base) return ''
      return `${String(base).replace(/\/$/, '')}/functions/v1/studio-mutate`
    } catch {
      return ''
    }
  },

  async _authHeader() {
    try {
      if (typeof Cloud === 'undefined' || typeof Cloud.client !== 'function') return null
      const client = await Cloud.client()
      if (!client?.auth?.getSession) return null
      const { data } = await client.auth.getSession()
      const token = data?.session?.access_token
      if (token) return { Authorization: `Bearer ${token}` }
    } catch { /* offline / no cloud session */ }
    return null
  },

  /**
   * Fire-and-forget audit of a finance op when online.
   * Never blocks / never fails the local FinanceSync write path.
   */
  report(op, payload = {}) {
    if (!this.enabled()) return Promise.resolve({ skipped: true })
    const url = this._endpoint()
    if (!url || typeof fetch !== 'function') return Promise.resolve({ skipped: true, reason: 'no_endpoint' })

    const idempotencyKey = `${op}_${payload.transactionId || payload.pairId || Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const info = typeof DB !== 'undefined' ? DB.get?.('studioInfo') : null
    const studioId = info?.supabaseStudioId || info?.cloudStudioId || ''

    return this._authHeader().then((auth) => {
      if (!auth) return { skipped: true, reason: 'no_cloud_session' }
      return fetch(url, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ op, idempotencyKey, studioId, payload }),
        keepalive: true,
        mode: 'cors'
      }).then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (typeof SMObservability !== 'undefined') {
            SMObservability.captureError('studio_mutate', new Error(body.error || res.statusText), { op })
          }
          return { ok: false, ...body }
        }
        if (typeof SMObservability !== 'undefined') {
          SMObservability.captureEvent('studio_mutate', { op, deduped: !!body.deduped })
        }
        return { ok: true, ...body }
      }).catch((e) => {
        if (typeof SMObservability !== 'undefined') {
          SMObservability.captureError('studio_mutate', e, { op, offline: true })
        }
        return { ok: false, error: e.message }
      })
    }).catch(() => ({ skipped: true }))
  }
}

if (typeof window !== 'undefined') window.StudioMutateClient = StudioMutateClient

export { StudioMutateClient }
