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
  _authoritativeIdentity: null,

  _allowsLocalIdentity() {
    return typeof AppConfig?.allowsLocalIdentity === 'function'
      ? !!AppConfig.allowsLocalIdentity()
      : !!AppConfig?.isLocalDev?.()
  },

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
    if (/provider is not enabled|Unsupported provider|validation_failed/i.test(m)) {
      return 'Google provider در Supabase خاموش است — Authentication → Providers → Google را Enable کنید'
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
    // In production the endpoint is part of the signed/deployed build. A
    // browser-controlled IndexedDB value must never be able to redirect Auth
    // to an attacker-owned Supabase project. Local overrides exist only in an
    // explicitly flagged localhost demo build.
    const localIdentity = this._allowsLocalIdentity()
    const url = localIdentity ? (st.url || env.url) : env.url
    const anonKey = localIdentity ? (st.anonKey || env.anonKey) : env.anonKey
    return {
      enabled: (localIdentity ? st.enabled : true) && !!url && !!anonKey,
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
    return this.isConfigured() && (this._allowsLocalIdentity() ? this.studioCloudConfig().enabled : true)
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

  toE164Phone(phone) {
    const digits = String(phone || '').replace(/\D/g, '')
    if (/^09\d{9}$/.test(digits)) return `+98${digits.slice(1)}`
    if (/^989\d{9}$/.test(digits)) return `+${digits}`
    if (/^9\d{9}$/.test(digits)) return `+98${digits}`
    return ''
  },

  async sendPhoneOtp(phone, { shouldCreateUser = true } = {}) {
    const c = await this.client()
    const normalized = this.toE164Phone(phone)
    if (!c || !normalized) return { ok: false, error: 'شماره موبایل برای ورود ابری معتبر نیست' }
    const { error } = await c.auth.signInWithOtp({
      phone: normalized,
      options: { shouldCreateUser: !!shouldCreateUser }
    })
    return error ? { ok: false, error: this.formatAuthError(error.message) } : { ok: true }
  },

  async verifyPhoneOtp(phone, token) {
    const c = await this.client()
    const normalized = this.toE164Phone(phone)
    const code = String(token || '').replace(/\D/g, '')
    if (!c || !normalized || !/^\d{6}$/.test(code)) return { ok: false, error: 'کد ۶ رقمی معتبر نیست' }
    const { data, error } = await c.auth.verifyOtp({ phone: normalized, token: code, type: 'sms' })
    if (error || !data?.session) return { ok: false, error: this.formatAuthError(error?.message || 'تأیید پیامک ناموفق بود') }
    return { ok: true, session: data.session, user: data.user }
  },

  async claimCustomerContracts() {
    const c = await this.client()
    const sess = await this.session()
    if (!c || !sess?.user) return { ok: false, error: 'ورود پیامکی Supabase لازم است' }
    const { data, error } = await c.rpc('claim_customer_contracts')
    return error
      ? { ok: false, error: this.formatAuthError(error.message) }
      : { ok: true, contracts: data || [] }
  },

  async signInWithOAuth(provider) {
    if (!['google', 'apple'].includes(provider)) return { ok: false, error: 'ارائه‌دهنده ورود مجاز نیست' }
    const c = await this.client()
    if (!c) return { ok: false, error: 'Supabase پیکربندی نشده' }
    const { data, error } = await c.auth.signInWithOAuth({
      provider,
      options: { redirectTo: this.authRedirectUrl() }
    })
    return error ? { ok: false, error: this.formatAuthError(error.message) } : { ok: true, url: data?.url || '' }
  },

  async _portalContract(localId, cloudContractId = '') {
    const c = await this.client()
    if (!c) return null
    let query = c.from('contracts').select('id, studio_id, local_id')
    query = cloudContractId ? query.eq('id', cloudContractId) : query.eq('local_id', String(localId || ''))
    const { data, error } = await query.limit(1).maybeSingle()
    return error ? null : data
  },

  async sendPortalMessage(message) {
    const c = await this.client()
    const sess = await this.session()
    if (!c || !sess?.user) return { ok: false, error: 'ورود Supabase لازم است' }
    const contract = await this._portalContract(message.contractLocalId, message.contractId)
    if (!contract) return { ok: false, error: 'قرارداد ابری یافت نشد' }
    const row = {
      studio_id: contract.studio_id,
      contract_id: contract.id,
      contract_local_id: contract.local_id,
      request_key: String(message.requestKey || ''),
      request_type: String(message.requestType || 'message'),
      sender_id: sess.user.id,
      sender_kind: String(message.senderKind || 'customer'),
      sender_name: String(message.senderName || '').slice(0, 160),
      body: String(message.body || '').trim().slice(0, 4000),
      attachment_path: message.attachment?.storagePath || null,
      attachment_name: message.attachment?.name || null,
      attachment_mime: message.attachment?.mime || null,
      attachment_size: message.attachment?.size || null
    }
    const { data, error } = await c.from('customer_portal_messages').insert(row).select('*').single()
    return error ? { ok: false, error: error.message } : { ok: true, message: data }
  },

  async listPortalMessages({ contractLocalId = '', since = '' } = {}) {
    const c = await this.client()
    if (!c || !await this.session()) return { ok: false, error: 'ورود Supabase لازم است' }
    let query = c.from('customer_portal_messages').select('*').order('created_at', { ascending: true }).limit(500)
    if (contractLocalId) query = query.eq('contract_local_id', String(contractLocalId))
    if (since) query = query.gt('created_at', since)
    const { data, error } = await query
    return error ? { ok: false, error: error.message } : { ok: true, messages: data || [] }
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

    let identity = null
    if (data.session) {
      const reg = await this._registerStudio(studioName, phone, name, joinCode)
      if (!reg.ok) return reg
      if (!reg.pendingApproval) {
        const restored = await this.restoreAuthoritativeIdentity()
        if (!restored.ok) return restored
        identity = restored.identity
      }
      await RealtimeSync.start(this)
    }

    return { ok: true, session: data.session, user: data.user, identity, needsEmailConfirm: !data.session }
  },

  async signIn({ email, password, phone }) {
    const c = await this.client()
    if (!c) return { ok: false, error: 'Supabase پیکربندی نشده' }
    const identifier = email?.trim()
      ? { email: email.trim() }
      : { phone: this.toE164Phone(phone) }
    if (!identifier.email && !identifier.phone) return { ok: false, error: 'شماره یا ایمیل معتبر نیست' }
    const { data, error } = await c.auth.signInWithPassword({ ...identifier, password })
    if (error) return { ok: false, error: this.formatAuthError(error.message) }
    const identity = await this.restoreAuthoritativeIdentity()
    if (!identity.ok) {
      await c.auth.signOut()
      return identity
    }
    await RealtimeSync.start(this)
    try {
      if (typeof FinanceOutbox !== 'undefined' && FinanceOutbox.flush) {
        await FinanceOutbox.flush()
      }
    } catch { /* outbox best-effort */ }
    return { ok: true, session: data.session, user: data.user, identity: identity.identity }
  },

  async restoreAuthoritativeIdentity() {
    const c = await this.client()
    if (!c) return { ok: false, code: 'cloud_required', error: 'Supabase پیکربندی نشده است' }

    // getUser performs a request to Auth and validates the access token.  A
    // browser-provided session object is not accepted as proof of identity.
    const { data: userData, error: userError } = await c.auth.getUser()
    const authUser = userData?.user
    if (userError || !authUser?.id) {
      this._authoritativeIdentity = null
      if (typeof Auth !== 'undefined') Auth.clearCloudIdentity?.()
      return { ok: false, code: 'not_authenticated', error: 'نشست معتبر سرور یافت نشد' }
    }

    const selectedStudioId = this.studioCloudConfig().studioId
    const now = new Date().toISOString()
    let memberQuery = c
      .from('studio_members')
      .select('studio_id, roles, phone, display_name, status, valid_from, valid_until, revoked_at, session_version')
      .eq('user_id', authUser.id)
      .eq('status', 'active')
      .is('revoked_at', null)
      .lte('valid_from', now)
      .or(`valid_until.is.null,valid_until.gt.${now}`)
    if (selectedStudioId) memberQuery = memberQuery.eq('studio_id', selectedStudioId)
    const { data: memberRows, error: memberError } = await memberQuery.limit(2)
    const memberships = Array.isArray(memberRows) ? memberRows : []

    if (memberError || memberships.length === 0) {
      this._authoritativeIdentity = null
      if (typeof Auth !== 'undefined') Auth.clearCloudIdentity?.()
      return { ok: false, code: 'no_active_membership', error: 'عضویت فعال استودیو برای این حساب وجود ندارد' }
    }
    if (!selectedStudioId && memberships.length > 1) {
      this._authoritativeIdentity = null
      if (typeof Auth !== 'undefined') Auth.clearCloudIdentity?.()
      return {
        ok: false,
        code: 'tenant_selection_required',
        error: 'این حساب عضو چند استودیو است؛ انتخاب صریح استودیو لازم است',
        studios: memberships.map(row => row.studio_id)
      }
    }
    const membership = memberships[0]

    const principal = typeof Auth !== 'undefined'
      ? Auth.acceptCloudIdentity?.(authUser, membership)
      : null
    if (!principal) {
      this._authoritativeIdentity = null
      return { ok: false, code: 'invalid_membership', error: 'عضویت سرور فاقد نقش معتبر است' }
    }
    this._authoritativeIdentity = principal
    await this._saveStudioLink(membership.studio_id)
    return { ok: true, identity: principal, authUser, membership }
  },

  async verifyCurrentPassword(password) {
    const identity = this._authoritativeIdentity
    if (!identity?.phone) return { ok: false, error: 'هویت فعال سرور یافت نشد' }
    const result = await this.signIn({ phone: identity.phone, password })
    return result.ok ? { ok: true } : { ok: false, error: 'رمز فعلی اشتباه است' }
  },

  async changePassword(currentPassword, newPassword) {
    const current = await this.verifyCurrentPassword(currentPassword)
    if (!current.ok) return current
    const c = await this.client()
    const { error } = await c.auth.updateUser({
      password: newPassword,
      current_password: currentPassword
    })
    return error
      ? { ok: false, error: this.formatAuthError(error.message) }
      : { ok: true }
  },

  async registerCurrentStudio({ studioName, phone, name }) {
    const registered = await this._registerStudio(studioName, phone, name, null)
    if (!registered.ok) return registered
    return this.restoreAuthoritativeIdentity()
  },

  /** Stash cloud config for auth-callback.html (OAuth PKCE exchange). */
  stashOAuthConfig({ intent = 'signin' } = {}) {
    try {
      // OAuth callback uses build-time public config only. Remove legacy
      // browser-controlled endpoint/key values so they cannot redirect PKCE.
      sessionStorage.removeItem('sm_cloud_url')
      sessionStorage.removeItem('sm_cloud_key')
      sessionStorage.setItem('sm_oauth_intent', intent)
      sessionStorage.setItem('sm_oauth_return', '/studio-m/index.html#settings')
    } catch { /* private mode */ }
  },

  /**
   * Google OAuth via Supabase Auth (provider must be enabled in Dashboard).
   * Never put Client Secret in the app — only in Supabase Google provider settings.
   */
  async signInWithGoogle({ intent = 'signin' } = {}) {
    const c = await this.client()
    if (!c) return { ok: false, error: 'Supabase پیکربندی نشده — ابتدا URL و Anon Key را ذخیره کنید' }
    if (!this.isConfigured()) return { ok: false, error: 'پیکربندی ابر ناقص است' }
    this.stashOAuthConfig({ intent })
    const redirectTo = this.authRedirectUrl()
    const { data, error } = await c.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: false,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account'
        }
      }
    })
    if (error) return { ok: false, error: this.formatAuthError(error.message) }
    return { ok: true, url: data?.url || '', provider: 'google' }
  },

  /**
   * After OAuth redirect lands back in the app: attach studio + start realtime.
   */
  async completeOAuthReturn() {
    const sess = await this.session()
    if (!sess?.user) return { ok: false, skipped: true, reason: 'no_session' }

    const restored = await this.restoreAuthoritativeIdentity()
    let studioId = restored.ok ? restored.identity.studioId : null
    if (!restored.ok && restored.code !== 'no_active_membership') return restored
    if (!studioId) {
      const info = typeof DB !== 'undefined' ? (DB.get('studioInfo') || {}) : {}
      const localUser = typeof Auth !== 'undefined' ? Auth.getUser?.() : null
      const display = localUser?.name
        || sess.user.user_metadata?.full_name
        || sess.user.user_metadata?.name
        || sess.user.email
        || 'مدیر'
      const phone = localUser?.phone || info.phone || ''
      const studioName = info.name || AppConfig.DEFAULT_STUDIO_NAME
      const reg = await this._registerStudio(studioName, phone, display, null)
      if (!reg.ok) return reg
      studioId = reg.studioId
      const registeredIdentity = await this.restoreAuthoritativeIdentity()
      if (!registeredIdentity.ok) return registeredIdentity
    }

    if (!this.studioCloudConfig().enabled && typeof SecureDB !== 'undefined') {
      const info = DB.get('studioInfo') || {}
      await SecureDB.merge('studioInfo', { ...info, cloudEnabled: true })
    }

    await RealtimeSync.start(this)
    try { sessionStorage.removeItem('sm_oauth_intent') } catch { /* */ }
    return { ok: true, studioId, user: sess.user, provider: sess.user.app_metadata?.provider || 'google' }
  },

  async signOut() {
    RealtimeSync.stop()
    const c = await this.client()
    if (c) await c.auth.signOut()
    this._client = null
    this._authoritativeIdentity = null
  },

  async _registerStudio(studioName, phone, name, joinCode) {
    const c = await this.client()
    if (joinCode) {
      const { data, error } = await c.rpc('request_studio_join', {
        p_token: String(joinCode).trim(),
        p_display_name: name || 'عضو',
        p_phone: Utils.normalizePhone(phone)
      })
      if (error) return { ok: false, error: this.formatAuthError(error.message) }
      return {
        ok: true,
        pendingApproval: true,
        requestId: data,
        message: 'درخواست عضویت ثبت شد و پس از تأیید مدیر فعال می‌شود.'
      }
    }
    const { data, error } = await c.rpc('register_studio', {
      p_studio_name: studioName || AppConfig.DEFAULT_STUDIO_NAME,
      p_phone: Utils.normalizePhone(phone),
      p_display_name: name || 'مدیر',
      p_join_code: null
    })
    if (error) return { ok: false, error: error.message }
    await this._saveStudioLink(data)
    return { ok: true, studioId: data }
  },

  async _loadMemberStudioId() {
    if (!this._allowsLocalIdentity()) {
      const restored = await this.restoreAuthoritativeIdentity()
      return restored.ok ? restored.identity.studioId : null
    }
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

  async createStudioInvitation(roles = ['office_secretary'], expiresInMinutes = 1440) {
    const c = await this.client()
    const studioId = this.resolvedConfig().studioId
    if (!c || !studioId) return { ok: false, error: 'اتصال ابری یا شناسه استودیو موجود نیست' }
    const { data, error } = await c.rpc('create_studio_invitation', {
      p_studio_id: studioId,
      p_roles: roles,
      p_expires_in_minutes: expiresInMinutes,
      p_max_uses: 1
    })
    return error ? { ok: false, error: this.formatAuthError(error.message) } : { ok: true, token: data }
  },

  async reviewStudioJoin(requestId, approve) {
    const c = await this.client()
    if (!c) return { ok: false, error: 'اتصال ابری موجود نیست' }
    const { data, error } = await c.rpc('review_studio_join', {
      p_request_id: requestId,
      p_approve: !!approve
    })
    return error ? { ok: false, error: this.formatAuthError(error.message) } : { ok: true, studioId: data }
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

  /** Immediate push of pending entity changes (before tab sleep / switch device). */
  async flushPushNow() {
    if (!this.isEnabled()) return { ok: false, skipped: true }
    return SyncEngine.flushEntityPush(this)
  },

  async ensureLiveSync() {
    if (!this.isEnabled()) return { ok: false, skipped: true }
    const sess = await this.session()
    if (!sess) return { ok: false, error: 'no session' }
    return RealtimeSync.start(this)
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

  async createBackupArchive(label = 'manual') {
    if (!this.isEnabled()) return { ok: false, skipped: true, error: 'پشتیبان ابری غیرفعال است' }
    const sess = await this.session()
    if (!sess?.user) return { ok: false, error: 'برای پشتیبان ابری باید وارد Supabase شوید' }

    let studioId = this.studioCloudConfig().studioId
    if (!studioId) studioId = await this._loadMemberStudioId()
    if (!studioId) return { ok: false, error: 'استودیوی ابری یافت نشد' }

    const raw = typeof DB !== 'undefined' ? JSON.parse(DB.exportJSON()) : {}
    const payload = sanitizeSnapshotForCloud(raw)
    const result = await this._callBackupEdge({
      action: 'create',
      studioId,
      payload,
      label: String(label || 'manual').slice(0, 32),
      schemaVersion: payload._meta?.dbVersion || AppConfig.DB_VERSION,
      appVersion: AppConfig.APP_VERSION
    })
    return result.ok
      ? { ok: true, id: result.backupId, manifest: result.manifest }
      : result
  },

  async _callBackupEdge(body) {
    const cfg = this.resolvedConfig()
    const sess = await this.session()
    if (!cfg.url || !cfg.anonKey || !sess?.access_token) {
      return { ok: false, error: 'ورود ابری لازم است' }
    }
    try {
      const res = await fetch(`${cfg.url}/functions/v1/cloud-backup`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sess.access_token}`,
          apikey: cfg.anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      const data = await res.json().catch(() => ({}))
      return res.ok ? data : { ok: false, error: data.error || `backup_http_${res.status}` }
    } catch {
      return { ok: false, error: 'backup_network_failed' }
    }
  },

  async restoreBackupArchive(backupId) {
    if (!this.isEnabled()) return { ok: false, error: 'پشتیبان ابری غیرفعال است' }
    const studioId = this.studioCloudConfig().studioId || await this._loadMemberStudioId()
    if (!studioId) return { ok: false, error: 'استودیوی ابری یافت نشد' }
    const restored = await this._callBackupEdge({ action: 'restore', studioId, backupId })
    if (!restored.ok) return restored
    const imported = await DB.importJSON(JSON.stringify(restored.payload))
    if (!imported.ok) return imported
    await DB.flush()
    return { ok: true, manifest: restored.manifest }
  },

  async listBackupArchives(limit = 20) {
    if (!this.isEnabled()) return { ok: false, skipped: true, backups: [] }
    const studioId = this.studioCloudConfig().studioId || await this._loadMemberStudioId()
    const c = await this.client()
    if (!studioId || !c || !await this.session()) return { ok: false, error: 'ورود ابری لازم است', backups: [] }
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20))
    const { data, error } = await c
      .from('studio_backup_archives')
      .select('id, source, checksum, size_bytes, db_version, app_version, manifest, created_at, created_by')
      .eq('studio_id', studioId)
      .order('created_at', { ascending: false })
      .limit(safeLimit)
    return error ? { ok: false, error: error.message, backups: [] } : { ok: true, backups: data || [] }
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

    if (!this._allowsLocalIdentity()) {
      const identity = await this.restoreAuthoritativeIdentity()
      if (!identity.ok) return { ok: true, skipped: true, reason: identity.code }
    }

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
    try {
      if (typeof FinanceOutbox !== 'undefined' && FinanceOutbox.flush) {
        await FinanceOutbox.flush()
      }
    } catch { /* */ }
    return pull.ok ? pull : entityPull
  }
}

window.Cloud = Cloud
window.dispatchEvent(new Event('cloud-ready'))

export default Cloud
