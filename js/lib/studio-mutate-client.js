/**
 * Client for supabase/functions/studio-mutate
 *
 * SaaS policy:
 * - When mutateRequiredWhenOnline (default if cloud enabled): await Edge BEFORE local money commit.
 * - Offline / no cloud session while required: FAIL CLOSED (block money writes).
 * - Optional mutateEnabled-only mode: post-commit audit (legacy single-studio).
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

  /**
   * Default true when cloud sync is configured+enabled (public SaaS posture).
   * Kill-switch: studioInfo.mutateRequiredWhenOnline === false or __SM_MUTATE_REQUIRED === false.
   */
  requiredWhenOnline() {
    try {
      if (typeof window !== 'undefined' && window.__SM_MUTATE_REQUIRED === false) return false
      if (typeof window !== 'undefined' && window.__SM_MUTATE_REQUIRED === true) return true
      const info = typeof DB !== 'undefined' ? DB.get?.('studioInfo') : null
      if (info && info.mutateRequiredWhenOnline === false) return false
      if (info && info.mutateRequiredWhenOnline === true) return true
      const cloudOn = !!(info && info.cloudEnabled)
      let hasUrl = !!(info && info.supabaseUrl)
      if (!hasUrl && typeof Cloud !== 'undefined' && typeof Cloud.resolvedConfig === 'function') {
        hasUrl = !!Cloud.resolvedConfig()?.url
      }
      return cloudOn && hasUrl
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

  /** Stable idempotency key for a logical money op (no random suffix). */
  stableKey(op, payload = {}) {
    if (payload.idempotencyKey) return String(payload.idempotencyKey).slice(0, 128)
    const anchor = payload.transactionId || payload.pairId || payload.outTransactionId || ''
    if (anchor) return `${op}:${anchor}`.slice(0, 128)
    return `${op}:missing_anchor`.slice(0, 128)
  },

  _studioId() {
    const info = typeof DB !== 'undefined' ? DB.get?.('studioInfo') : null
    return info?.supabaseStudioId || info?.cloudStudioId || ''
  },

  _isOffline() {
    try {
      return typeof navigator !== 'undefined' && navigator.onLine === false
    } catch {
      return false
    }
  },

  /**
   * Authoritative mutate when required; optional audit when only enabled.
   * Queueable reasons (offline / no session / network before accept) let FinanceSync
   * commit locally + enqueue outbox instead of hard-blocking.
   */
  async authorize(op, payload = {}, opts = {}) {
    const required = this.requiredWhenOnline()
    const optional = this.enabled()
    if (!required && !optional) return { skipped: true, reason: 'not_required' }

    const url = this._endpoint()
    const auth = await this._authHeader()
    const idempotencyKey = String(opts.idempotencyKey || this.stableKey(op, payload)).slice(0, 128)
    const studioId = this._studioId()
    const info = typeof DB !== 'undefined' ? DB.get?.('studioInfo') : null
    const expectedVersion = opts.expectedVersion != null
      ? opts.expectedVersion
      : (info?.ledgerVersion != null ? Number(info.ledgerVersion) : null)

    if (required) {
      if (this._isOffline()) {
        return {
          ok: false,
          queueable: true,
          reason: 'offline_blocked',
          error: 'آفلاین — در صف همگام‌سازی مالی قرار می‌گیرد'
        }
      }
      if (!url) {
        return {
          ok: false,
          queueable: true,
          reason: 'no_endpoint',
          error: 'آدرس Edge studio-mutate تنظیم نشده — صف محلی'
        }
      }
      if (!auth) {
        return {
          ok: false,
          queueable: true,
          reason: 'no_cloud_session',
          error: 'ورود ابر لازم است — تراکنش در صف می‌ماند تا ورود'
        }
      }
      if (!studioId) {
        return {
          ok: false,
          queueable: true,
          reason: 'no_studio',
          error: 'شناسه استودیو ابری مشخص نیست — صف محلی'
        }
      }
    } else if (!url || !auth) {
      return { skipped: true, reason: !url ? 'no_endpoint' : 'no_cloud_session' }
    }

    try {
      const body = {
        op,
        idempotencyKey,
        studioId,
        payload,
        expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : null
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        mode: 'cors'
      })
      const resBody = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (typeof SMObservability !== 'undefined') {
          SMObservability.captureError('studio_mutate', new Error(resBody.error || res.statusText), {
            op,
            required,
            status: res.status
          })
        }
        const queueable = res.status === 401 || res.status === 429
        return {
          ok: false,
          queueable,
          reason: res.status === 409 ? 'ledger_conflict' : 'server_rejected',
          error: resBody.error || res.statusText || 'mutate rejected',
          status: res.status,
          ...resBody
        }
      }
      if (typeof SMObservability !== 'undefined') {
        SMObservability.captureEvent('studio_mutate', {
          op,
          required,
          deduped: !!resBody.deduped,
          status: resBody.result?.status || 'ok',
          ledgerVersion: resBody.result?.ledgerVersion
        })
      }
      return { ok: true, deduped: !!resBody.deduped, ...resBody }
    } catch (e) {
      if (typeof SMObservability !== 'undefined') {
        SMObservability.captureError('studio_mutate', e, { op, required, offline: true })
      }
      if (required) {
        return {
          ok: false,
          queueable: true,
          reason: 'network',
          error: e.message || 'خطای شبکه mutate — صف محلی'
        }
      }
      return { ok: false, error: e.message }
    }
  },

  /**
   * Legacy fire-and-forget audit when mutate is optional only.
   * When requiredWhenOnline, prefer authorize() from FinanceSync before commit.
   */
  report(op, payload = {}) {
    if (this.requiredWhenOnline()) {
      return this.authorize(op, payload, { idempotencyKey: this.stableKey(op, payload) })
    }
    if (!this.enabled()) return Promise.resolve({ skipped: true, reason: 'not_required' })
    return this.authorize(op, payload, { idempotencyKey: this.stableKey(op, payload) })
  }
}

if (typeof window !== 'undefined') window.StudioMutateClient = StudioMutateClient

export { StudioMutateClient }
