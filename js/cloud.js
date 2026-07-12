/**
 * Studio M — Supabase Cloud (Auth + Hybrid Sync)
 * Phase 2: entity row-sync (primary) + full snapshot (fallback, 60s)
 */
import { createClient } from '@supabase/supabase-js'
import { SyncEngine } from './sync/engine.js'
import { RealtimeSync } from './sync/realtime.js'
import { sanitizeSnapshotForCloud, mergeLocalSecretsAfterPull } from './lib/snapshot-sanitize.js'

const Cloud = {
  _client: null,
  _pushPending: false,
  _snapshotPending: false,
  _lastPullAt: 0,
  _lastCloudErrorToastAt: 0,

  normalizeUrl(url) {
    let u = String(url || '').trim()
    if (!u) return ''
    const dash = u.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i)
    if (dash) u = `https://${dash[1]}.supabase.co`
    u = u.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '')
    if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`
    return u
  },

  jwtRole(key) {
    try {
      const part = String(key || '').split('.')[1]
      if (!part) return ''
      const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
      return json.role || ''
    } catch {
      return ''
    }
  },

  validateAnonKey(key) {
    const role = this.jwtRole(key)
    if (!role) return { ok: true }
    if (role === 'service_role') {
      return { ok: false, error: 'کلید service_role برای اپ مجاز نیست — فقط anon public key را بگذارید' }
    }
    if (role !== 'anon') {
      return { ok: false, error: 'کلید API نامعتبر است' }
    }
    return { ok: true }
  },

  formatAuthError(message) {
    const m = String(message || '')
    if (m.includes('requested path is invalid')) {
      return 'Site URL در Supabase هنوز xxx.supabase.co است. Dashboard → Authentication → URL Configuration → Site URL = http://localhost:5173/studio-m/auth-callback.html'
    }
    if (m.includes('email_address_invalid')) {
      return 'فرمت ایمیل auth نامعتبر است — اپ را رفرش کنید و دوباره ثبت‌نام کنید'
    }
    if (/invalid api key|invalid_api_key|UNAUTHORIZED_INVALID_API_KEY/i.test(m)) {
      return 'Anon Key اشتباه است — service_role را در اپ استفاده نکنید'
    }
    return m
  },

  authRedirectUrl() {
    if (typeof window === 'undefined') return undefined
    return `${window.location.origin}/studio-m/auth-callback.html`
  },

  envConfig() {
    const url = this.normalizeUrl(import.meta.env?.VITE_SUPABASE_URL || '')
    const anonKey = String(import.meta.env?.VITE_SUPABASE_ANON_KEY || '').trim()
    return { url, anonKey }
  },

  studioCloudConfig() {
    const info = typeof DB !== 'undefined' ? (DB.get('studioInfo') || {}) : {}
    return {
      enabled: !!info.cloudEnabled,
      url: this.normalizeUrl(info.supabaseUrl || ''),
      anonKey: String(info.supabaseAnonKey || '').trim(),
      studioId: String(info.supabaseStudioId || '').trim()
    }
  },

  resolvedConfig() {
    const env = this.envConfig()
    const st = this.studioCloudConfig()
    const url = st.url || env.url
    const anonKey = st.anonKey || env.anonKey
    return {
      enabled: st.enabled && !!url && !!anonKey,
      url,
      anonKey,
      studioId: st.studioId
    }
  },

  isConfigured() {
    const c = this.resolvedConfig()
    return !!(c.url && c.anonKey)
  },

  isEnabled() {
    return this.isConfigured() && this.studioCloudConfig().enabled
  },

  phoneToEmail(phone) {
    const p = typeof Utils !== 'undefined' ? Utils.normalizePhone(phone) : String(phone || '').replace(/\D/g, '')
    return `u${p || 'user'}@studiom.app`
  },

  async client() {
    const cfg = this.resolvedConfig()
    if (!cfg.url || !cfg.anonKey) return null
    const keyCheck = this.validateAnonKey(cfg.anonKey)
    if (!keyCheck.ok) throw new Error(keyCheck.error)
    if (!this._client) {
      this._client = createClient(cfg.url, cfg.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'sm_supabase_auth'
        }
      })
    }
    return this._client
  },

  async session() {
    const c = await this.client()
    if (!c) return null
    const { data } = await c.auth.getSession()
    return data.session
  },

  async signUp({ email, password, phone, name, studioName, joinCode }) {
    const c = await this.client()
    if (!c) return { ok: false, error: 'Supabase پیکربندی نشده' }

    const mail = email?.trim() || this.phoneToEmail(phone)
    const { data, error } = await c.auth.signUp({
      email: mail,
      password,
      options: {
        data: { phone: Utils.normalizePhone(phone), name, studio_name: studioName },
        emailRedirectTo: this.authRedirectUrl()
      }
    })
    if (error) return { ok: false, error: this.formatAuthError(error.message) }

    if (data.session) {
      const reg = await this._registerStudio(studioName, phone, name, joinCode)
      if (!reg.ok) return reg
      await RealtimeSync.start(this)
    }

    return { ok: true, session: data.session, user: data.user, needsEmailConfirm: !data.session }
  },

  async signIn({ email, password, phone }) {
    const c = await this.client()
    if (!c) return { ok: false, error: 'Supabase پیکربندی نشده' }
    const mail = email?.trim() || this.phoneToEmail(phone)
    const { data, error } = await c.auth.signInWithPassword({ email: mail, password })
    if (error) return { ok: false, error: this.formatAuthError(error.message) }
    await this._loadMemberStudioId()
    await RealtimeSync.start(this)
    return { ok: true, session: data.session, user: data.user }
  },

  async signOut() {
    RealtimeSync.stop()
    const c = await this.client()
    if (c) await c.auth.signOut()
    this._client = null
  },

  async _registerStudio(studioName, phone, name, joinCode) {
    const c = await this.client()
    const { data, error } = await c.rpc('register_studio', {
      p_studio_name: studioName || AppConfig.DEFAULT_STUDIO_NAME,
      p_phone: Utils.normalizePhone(phone),
      p_display_name: name || 'مدیر',
      p_join_code: joinCode || null
    })
    if (error) return { ok: false, error: error.message }
    await this._saveStudioLink(data)
    return { ok: true, studioId: data }
  },

  async _loadMemberStudioId() {
    const c = await this.client()
    const sess = await this.session()
    if (!c || !sess?.user) return null

    const { data, error } = await c
      .from('studio_members')
      .select('studio_id, roles, phone, display_name')
      .eq('user_id', sess.user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (error || !data?.studio_id) return null
    await this._saveStudioLink(data.studio_id)
    return data.studio_id
  },

  async _saveStudioLink(studioId) {
    if (!studioId || typeof SecureDB === 'undefined') return
    const info = DB.get('studioInfo') || {}
    await SecureDB.merge('studioInfo', {
      ...info,
      cloudEnabled: true,
      supabaseStudioId: studioId,
      cloudLastSyncAt: info.cloudLastSyncAt || ''
    })
  },

  async enableCloud({ url, anonKey }) {
    if (typeof SecureDB === 'undefined') return { ok: false, error: 'DB unavailable' }
    const cleanUrl = this.normalizeUrl(url)
    const cleanKey = String(anonKey || '').trim()
    const keyCheck = this.validateAnonKey(cleanKey)
    if (cleanKey && !keyCheck.ok) return keyCheck
    const info = DB.get('studioInfo') || {}
    await SecureDB.merge('studioInfo', {
      ...info,
      supabaseUrl: cleanUrl,
      supabaseAnonKey: cleanKey,
      cloudEnabled: true
    })
    this._client = null
    return { ok: true }
  },

  async disableCloud() {
    const info = DB.get('studioInfo') || {}
    await SecureDB.merge('studioInfo', {
      ...info,
      cloudEnabled: false
    })
    return { ok: true }
  },

  statusLabel() {
    if (!this.isConfigured()) return { text: 'غیرفعال — URL/Key وارد نشده', tone: 'muted' }
    if (!this.studioCloudConfig().enabled) return { text: 'پیکربندی شده — sync خاموش', tone: 'warning' }
    return { text: 'ابر فعال', tone: 'success' }
  },

  _notifyCloudError(message) {
    const msg = String(message || 'خطا در sync')
    console.warn('[Cloud]', msg)
    const now = Date.now()
    if (now - this._lastCloudErrorToastAt < 30000) return
    this._lastCloudErrorToastAt = now
    Utils.toast?.(`ابر: ${msg}`, 'error')
  },

  schedulePush() {
    if (!this.isEnabled()) return
    SyncEngine.scheduleEntityPush(this)
    SyncEngine.scheduleSnapshotPush(this)
  },

  async _pushSnapshotDebounced() {
    if (!this.isEnabled() || !this._snapshotPending) return { ok: false, skipped: true }
    this._snapshotPending = false
    this._pushPending = true
    return this.pushSnapshot()
  },

  async pushSnapshot() {
    if (!this.isEnabled()) return { ok: false, skipped: true }

    const sess = await this.session()
    if (!sess) return { ok: false, error: 'ابر: ورود Supabase لازم است' }

    let studioId = this.studioCloudConfig().studioId
    if (!studioId) studioId = await this._loadMemberStudioId()
    if (!studioId) return { ok: false, error: 'استودیوی ابری یافت نشد' }

    const c = await this.client()
    const raw = typeof DB !== 'undefined' ? JSON.parse(DB.exportJSON()) : {}
    const json = sanitizeSnapshotForCloud(raw)
    const meta = json._meta || {}

    const { data, error } = await c.rpc('upsert_studio_snapshot', {
      p_studio_id: studioId,
      p_data: json,
      p_db_version: meta.dbVersion || AppConfig.DB_VERSION,
      p_app_version: AppConfig.APP_VERSION
    })
    if (error) return { ok: false, error: error.message }

    await SecureDB.merge('studioInfo', {
      ...DB.get('studioInfo'),
      cloudLastSyncAt: data || new Date().toISOString(),
      cloudLastSyncDir: 'push'
    })
    await DB.flush?.()
    return { ok: true, at: data }
  },

  async pullSnapshot({ force = false } = {}) {
    if (!this.isEnabled()) return { ok: false, skipped: true }
    const now = Date.now()
    if (!force && now - this._lastPullAt < 15000) return { ok: false, skipped: true }
    this._lastPullAt = now

    const sess = await this.session()
    if (!sess) return { ok: false, error: 'ابر: ورود Supabase لازم است' }

    let studioId = this.studioCloudConfig().studioId
    if (!studioId) studioId = await this._loadMemberStudioId()
    if (!studioId) return { ok: false, error: 'استودیوی ابری یافت نشد' }

    const c = await this.client()
    const { data, error } = await c
      .from('studio_snapshots')
      .select('data, updated_at, db_version')
      .eq('studio_id', studioId)
      .maybeSingle()

    if (error) return { ok: false, error: error.message }
    if (!data?.data || typeof data.data !== 'object') return { ok: false, error: 'snapshot خالی' }

    const localAt = DB.get('studioInfo')?.cloudLastSyncAt || ''
    const remoteAt = data.updated_at || ''
    if (!force && localAt && remoteAt && new Date(localAt) >= new Date(remoteAt)) {
      return { ok: true, skipped: true, reason: 'local_newer' }
    }

    const localRaw = typeof DB !== 'undefined' ? JSON.parse(DB.exportJSON()) : {}
    const merged = mergeLocalSecretsAfterPull(data.data, localRaw)
    const result = await DB.importJSON(JSON.stringify(merged))
    if (!result.ok) return result

    await SecureDB.merge('studioInfo', {
      ...DB.get('studioInfo'),
      supabaseStudioId: studioId,
      cloudLastSyncAt: remoteAt,
      cloudLastSyncDir: 'pull'
    })
    await DB.flush?.()
    return { ok: true, at: remoteAt }
  },

  async syncContractsFromLocal() {
    if (!this.isEnabled()) return { ok: false, skipped: true }
    const sess = await this.session()
    if (!sess) return { ok: false, error: 'not signed in' }

    let studioId = this.studioCloudConfig().studioId
    if (!studioId) studioId = await this._loadMemberStudioId()
    if (!studioId) return { ok: false, error: 'no studio' }

    const c = await this.client()
    const rows = (DB.get('contracts') || []).map(ct => ({
      studio_id: studioId,
      local_id: ct.id,
      contract_num: ct.contractNum || ct.contract_num || '',
      groom: ct.groom || '',
      bride: ct.bride || '',
      groom_phone: ct.groomPhone || ct.phoneGroom || '',
      bride_phone: ct.bridePhone || ct.phoneBride || '',
      event_date: ct.eventDate || ct.date || '',
      status: ct.status || 'active',
      total: Number(ct.total) || 0,
      payload: ct,
      updated_at: new Date().toISOString()
    }))

    if (!rows.length) return { ok: true, count: 0 }

    const { error } = await c.from('contracts').upsert(rows, { onConflict: 'studio_id,local_id' })
    if (error) return { ok: false, error: error.message }
    return { ok: true, count: rows.length }
  },

  async pushEntities() {
    SyncEngine._entityPending = true
    return SyncEngine.pushAll(this)
  },

  async pullEntities(opts = {}) {
    return SyncEngine.pullAll(this, opts)
  },

  async pushAll() {
    SyncEngine._entityPending = true
    const entities = await SyncEngine.pushAll(this)
    this._pushPending = true
    const snapshot = await this.pushSnapshot()
    return { ok: entities.ok && snapshot.ok, entities, snapshot }
  },

  async pullAll({ force = false } = {}) {
    const entities = await SyncEngine.pullAll(this, { force })
    if (entities.ok && entities.applied > 0) return entities
    return this.pullSnapshot({ force })
  },

  syncModeLabel() {
    if (!this.isEnabled()) return 'خاموش'
    const live = RealtimeSync.status?.() === 'live' ? ' · realtime' : ''
    return `entity + snapshot${live}`
  },

  async updateAuthPassword(newPassword) {
    const c = await this.client()
    if (!c) return { ok: false, error: 'Supabase پیکربندی نشده' }
    const pw = Utils.normalizePassword(newPassword)
    if (!pw || pw.length < AppConfig.MIN_PASSWORD_LENGTH) {
      return { ok: false, error: `رمز حداقل ${AppConfig.MIN_PASSWORD_LENGTH} کاراکتر` }
    }
    const { error } = await c.auth.updateUser({ password: pw })
    if (error) return { ok: false, error: this.formatAuthError(error.message) }
    return { ok: true }
  },

  realtimeStatus() {
    return RealtimeSync.status?.() || 'off'
  },

  async bootstrap() {
    if (!this.isConfigured()) return { ok: true, skipped: true }

    const entityPull = await SyncEngine.pullAll(this, { force: true })
    if (entityPull.ok && entityPull.applied > 0) {
      Utils.toast?.(`${Utils.fmtNum?.(entityPull.applied) || entityPull.applied} رکورد از ابر همگام شد`, 'success')
      return entityPull
    }
    if (entityPull.conflictCount > 0) {
      Utils.toast?.(`${entityPull.conflictCount} تعارض sync — تنظیمات → ابر`, 'warning')
    }

    const pull = await this.pullSnapshot()
    if (pull.ok && !pull.skipped) {
      Utils.toast?.('داده از ابر بازیابی شد', 'success')
    } else if (!pull.ok && !pull.skipped && !entityPull.skipped) {
      this._notifyCloudError(pull.error || entityPull.error || 'دریافت از ابر ناموفق')
    }
    if (this.isEnabled()) await RealtimeSync.start(this)
    return pull.ok ? pull : entityPull
  }
}

window.Cloud = Cloud
window.dispatchEvent(new Event('cloud-ready'))

export default Cloud
