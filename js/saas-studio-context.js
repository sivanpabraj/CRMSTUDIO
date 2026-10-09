/**
 * Studio Context (فرانت) — انتخاب استودیو از memberships API v2
 * ستون ۵: IndexedDB بعداً فقط کش همین studioId است
 */
(function (w) {
  'use strict'

  const KEY = 'saas_current_studio_id'
  const TOKEN_KEY = 'saas_access_token'
  const MEM_KEY = 'saas_memberships'
  const memStore = {}

  function getItem(k) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage?.getItem) {
        const val = localStorage.getItem(k)
        if (val !== null) return val
      }
    } catch { /* */ }
    return memStore[k] ?? null
  }

  function setItem(k, v) {
    memStore[k] = String(v ?? '')
    try {
      if (typeof localStorage !== 'undefined' && localStorage?.setItem) {
        localStorage.setItem(k, String(v ?? ''))
      }
    } catch { /* */ }
  }

  function getSessionItem(k) {
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage?.getItem) {
        const val = sessionStorage.getItem(k)
        if (val !== null) return val
      }
    } catch { /* */ }
    return getItem(k)
  }

  function setSessionItem(k, v) {
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage?.setItem) {
        sessionStorage.setItem(k, String(v ?? ''))
      }
    } catch { /* */ }
    setItem(k, v)
  }

  const SaasContext = {
    getStudioId() {
      return getItem(KEY) || ''
    },

    setStudioId(id) {
      setItem(KEY, id || '')
      w.dispatchEvent?.(new CustomEvent('saas-studio-changed', { detail: { studioId: id } }))
    },

    getToken() {
      return getSessionItem(TOKEN_KEY) || getItem(TOKEN_KEY) || ''
    },

    setSession({ accessToken, memberships, user }) {
      if (accessToken) {
        setSessionItem(TOKEN_KEY, accessToken)
        setItem(TOKEN_KEY, accessToken)
      }
      if (memberships) setItem(MEM_KEY, JSON.stringify(memberships))
      if (user) setItem('saas_user', JSON.stringify(user))
      if (memberships?.length === 1) this.setStudioId(memberships[0].studioId)
      else if (memberships?.length && !this.getStudioId()) {
        this.setStudioId(memberships[0].studioId)
      }
    },

    getMemberships() {
      try {
        return JSON.parse(getItem(MEM_KEY) || '[]')
      } catch {
        return []
      }
    },

    headers(extra) {
      const h = { 'Content-Type': 'application/json', ...(extra || {}) }
      const t = this.getToken()
      if (t) h.Authorization = 'Bearer ' + t
      const sid = this.getStudioId()
      if (sid) h['X-Studio-Id'] = sid
      return h
    },

    async login(body) {
      const res = await fetch('/api/v2/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        return { ok: false, error: data.error || 'ورود ناموفق', code: data.code }
      }
      this.setSession(data)
      return data
    },

    async registerStudio(body) {
      const res = await fetch('/api/v2/auth/register-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      return res.json().catch(() => ({}))
    },

    async listContracts() {
      const res = await fetch('/api/v2/contracts', { headers: this.headers() })
      return res.json().catch(() => ({}))
    },

    /** اگر چند membership → UI انتخاب */
    ensureStudioSelected() {
      const list = this.getMemberships()
      if (list.length <= 1) return { ok: true, studioId: this.getStudioId() }
      if (this.getStudioId()) return { ok: true, studioId: this.getStudioId() }
      return { ok: false, needSelect: true, memberships: list }
    }
  }

  w.SaasContext = SaasContext
})(typeof window !== 'undefined' ? window : globalThis)
