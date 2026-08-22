/**
 * Client for supabase/functions/studio-mutate
 *
 * SaaS policy:
 * - When mutateRequiredWhenOnline (default if cloud enabled): await Edge BEFORE local money commit.
 * - Offline / no cloud session while required: FAIL CLOSED (block money writes).
 * - A localhost-only explicit override supports isolated development fixtures.
 */
const StudioMutateClient = {
  _localDevelopmentOverride() {
    try {
      const host = String(globalThis?.location?.hostname || '')
      return (host === 'localhost' || host === '127.0.0.1')
        && globalThis.__CRMSTUDIO_ALLOW_LOCAL_FINANCE__ === true
    } catch { return false }
  },
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
   * Always true on a non-local browser origin. Local settings cannot disable it.
   */
  requiredWhenOnline() {
    try {
      // A browser flag or locally stored studio setting must never disable the
      // production finance authority. Only an explicit localhost development
      // override is accepted.
      if (this._localDevelopmentOverride()) return false
      if (typeof window !== 'undefined' && window.__SM_MUTATE_REQUIRED === true) return true
      const info = typeof DB !== 'undefined' ? DB.get?.('studioInfo') : null
      if (info && info.mutateRequiredWhenOnline === true) return true
      const cloudOn = !!(info && info.cloudEnabled)
      let hasUrl = !!(info && info.supabaseUrl)
      if (!hasUrl && typeof Cloud !== 'undefined' && typeof Cloud.resolvedConfig === 'function') {
        hasUrl = !!Cloud.resolvedConfig()?.url
      }
      const browserProduction = typeof location !== 'undefined'
        && !['localhost', '127.0.0.1'].includes(String(location.hostname || ''))
      return browserProduction || (cloudOn && hasUrl)
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
   * Authoritative mutate when required. Retryable failures never grant local
   * commit authority.
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
      ? Number(opts.expectedVersion)
      : (info?.ledgerVersion != null ? Number(info.ledgerVersion) : 0)
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
      return { ok: false, reason: 'invalid_expected_version', error: 'نسخه دفتر کل نامعتبر است' }
    }

    if (required) {
      if (this._isOffline()) {
        return {
          ok: false,
          retryable: true,
          reason: 'offline_blocked',
          error: 'آفلاین — عملیات مالی بدون تأیید سرور ثبت نمی‌شود'
        }
      }
      if (!url) {
        return {
          ok: false,
          retryable: true,
          reason: 'no_endpoint',
          error: 'آدرس سرویس مالی تنظیم نشده است'
        }
      }
      if (!auth) {
        return {
          ok: false,
          retryable: true,
          reason: 'no_cloud_session',
          error: 'نشست معتبر سرور برای عملیات مالی لازم است'
        }
      }
      if (!studioId) {
        return {
          ok: false,
          retryable: true,
          reason: 'no_studio',
          error: 'شناسه استودیو برای عملیات مالی مشخص نیست'
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
        expectedVersion
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
        return {
          ok: false,
          retryable: res.status === 401 || res.status === 429 || res.status >= 500,
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
          retryable: true,
          reason: 'network',
          error: e.message || 'خطای شبکه؛ هیچ ثبت مالی محلی انجام نشد'
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
