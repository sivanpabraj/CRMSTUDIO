import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  escapeContractHtml,
  renderSafePackageCard,
  safePackageColor,
} from '../js/lib/contract-render-security.js'
import { canWriteCollection } from '../js/lib/secure-db-policy.js'
import {
  jwtRole,
  normalizeSupabaseUrl,
  phoneToCloudEmail,
  safeAppRedirect,
  safeRedirectPath,
  studioMLoginReturnPath,
  validateAnonKey,
} from '../js/lib/security-paths.js'
import {
  clearProof,
  clearProofSecret,
  issueProof,
  signObject,
  verifyObject,
  verifyProof,
} from '../js/lib/signed-proof.js'
import {
  mergeLocalSecretsAfterPull,
  sanitizeSnapshotForCloud,
} from '../js/lib/snapshot-sanitize.js'
import { StudioMutateClient } from '../js/lib/studio-mutate-client.js'

describe('contract renderer rejects executable package metadata', () => {
  it('encodes every HTML-significant character and nullish values', () => {
    expect(escapeContractHtml(null)).toBe('')
    expect(escapeContractHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('accepts only constrained CSS colors', () => {
    expect(safePackageColor(undefined)).toBe('#64748b')
    expect(safePackageColor('red')).toBe('red')
    expect(safePackageColor('#abc')).toBe('#abc')
    expect(safePackageColor('url(javascript:alert(1))')).toBe('#64748b')
    expect(safePackageColor('#123456789')).toBe('#64748b')
  })

  it('renders absent fields safely and limits attacker-controlled feature count', () => {
    const empty = renderSafePackageCard({})
    expect(empty).toContain('data-package-id=""')
    expect(empty).not.toContain(' active')

    const attack = renderSafePackageCard({
      packageItem: { id: '" autofocus onfocus=alert(1)', name: '<img src=x onerror=alert(1)>', color: 'bad;color:red' },
      tier: { icon: '<svg/onload=alert(1)>', label: '<script>alert(1)</script>', color: '#fff' },
      totalLabel: '<iframe srcdoc=x>',
      active: true,
      features: ['<img src=x>', '&', '"', "'", '<script>fifth()</script>'],
    })
    expect(attack).toContain('pkg-pick-card active')
    expect(attack).toContain('--pkg-color:#64748b')
    expect(attack).not.toContain('<script>')
    expect(attack).toContain('data-package-id="&quot; autofocus onfocus=alert(1)"')
    expect(attack).not.toContain('data-package-id="" autofocus')
    expect(attack).not.toContain('fifth()')
  })
})

describe('client policy and redirect adversarial matrix', () => {
  it('covers default/setup/custom-finance decisions', () => {
    expect(canWriteCollection()).toBe(false)
    expect(canWriteCollection({ setupPhase: true })).toBe(true)
    expect(canWriteCollection({ collection: 'custom', csrfValid: true, financeCollections: new Set(['custom']) })).toBe(false)
    expect(canWriteCollection({ collection: 'custom', csrfValid: true, manageFinance: true, financeCollections: new Set(['custom']) })).toBe(true)
  })

  it.each([null, 1, '', '  ', 'https://evil.test/x', 'HTTP://evil.test', '//evil.test', '\\evil.test', 'relative'])(
    'rejects unsafe redirect input %j', value => {
    expect(safeRedirectPath(value, 'https://crm.test')).toBeNull()
    }
  )

  it('fails closed on malformed origins and preserves safe path components', () => {
    expect(safeRedirectPath('/a?x=1#h', 'https://crm.test')).toBe('/a?x=1#h')
    expect(safeRedirectPath('/a', 'not a valid origin')).toBeNull()
    expect(safeAppRedirect(null, 'https://crm.test')).toBeNull()
    expect(safeAppRedirect('  ', 'https://crm.test')).toBeNull()
    expect(safeAppRedirect('//evil.test', 'https://crm.test')).toBeNull()
    expect(safeAppRedirect('\\evil.test', 'https://crm.test')).toBeNull()
    expect(safeAppRedirect('/safe', 'https://crm.test')).toBe('/safe')
  })

  it('normalizes return paths and Supabase configuration variants', () => {
    expect(studioMLoginReturnPath('', '')).toBe('/studio-m/index.html#dashboard')
    expect(studioMLoginReturnPath('/studio-m/', '')).toBe('/studio-m/#dashboard')
    expect(normalizeSupabaseUrl(null)).toBe('')
    expect(normalizeSupabaseUrl('abc.supabase.co///')).toBe('https://abc.supabase.co')
    expect(normalizeSupabaseUrl('https://abc.supabase.co/rest/v1/')).toBe('https://abc.supabase.co')
  })

  it('rejects forged privileged JWT roles and malformed payloads', () => {
    const jwt = role => `h.${btoa(JSON.stringify({ role })).replace(/=/g, '')}.s`
    expect(jwtRole(jwt('authenticated'))).toBe('authenticated')
    expect(jwtRole('h.%%%.s')).toBe('')
    expect(validateAnonKey(jwt('authenticated'))).toMatchObject({ ok: false, error: 'invalid api key role' })
    expect(validateAnonKey('opaque-publishable-key')).toEqual({ ok: true })
    expect(phoneToCloudEmail(null)).toBe('uuser@studiom.app')
    expect(phoneToCloudEmail('+98 (912) 345-6789')).toBe('u989123456789@studiom.app')
  })
})

describe('signed proof forgery and storage failure matrix', () => {
  let store

  beforeEach(() => {
    store = new Map()
    vi.stubGlobal('crypto', webcrypto)
    vi.stubGlobal('AppConfig', { isLocalDev: () => false })
    vi.stubGlobal('sessionStorage', {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: key => store.delete(key),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('rejects non-objects, mismatched fields, expiration, and unsigned production proofs', async () => {
    expect(await verifyObject(null)).toBe(false)
    expect(await verifyObject({ userId: 'u1', sig: 'x' }, undefined, { userId: 'u2' })).toBe(false)
    expect(await verifyObject({ expires: Date.now() - 1, sig: 'x' })).toBe(false)
    expect(await verifyObject({ userId: 'u1' })).toBe(false)
  })

  it('permits unsigned proof only in explicit local development mode', async () => {
    vi.stubGlobal('AppConfig', { isLocalDev: () => true })
    expect(await verifyObject({ userId: 'u1' })).toBe(true)
    vi.stubGlobal('AppConfig', {})
    expect(await verifyObject({ userId: 'u1' })).toBe(false)
  })

  it('fails closed if proof storage is absent, corrupt, or throws', async () => {
    expect(await verifyProof('missing')).toBe(false)
    store.set('broken', '{')
    expect(await verifyProof('broken')).toBe(false)

    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
    })
    const unsigned = await signObject({ userId: 'u1' })
    expect(unsigned.sig).toBeUndefined()
    expect(await verifyObject({ userId: 'u1', sig: 'forged' })).toBe(false)
    expect(() => clearProof('x')).not.toThrow()
    expect(() => clearProofSecret()).not.toThrow()
  })

  it('binds custom canonical payloads and rejects mutation after signing', async () => {
    const payload = { userId: 'u1', nonce: 'n1', expires: Date.now() + 1000 }
    const signed = await signObject(payload, value => `${value.userId}:${value.nonce}`)
    expect(await verifyObject(signed, value => `${value.userId}:${value.nonce}`)).toBe(true)
    expect(await verifyObject({ ...signed, nonce: 'n2' }, value => `${value.userId}:${value.nonce}`)).toBe(false)
    await issueProof('p', { userId: 'u1' }, -1)
    expect(await verifyProof('p')).toBe(false)
  })
})

describe('snapshot secret redaction edge cases', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns sanitized metadata for non-object inputs with configured and default schema versions', () => {
    vi.stubGlobal('AppConfig', { DB_VERSION: 42 })
    expect(sanitizeSnapshotForCloud(null)).toEqual({ _meta: { dbVersion: 42, sanitized: true } })
    vi.stubGlobal('AppConfig', undefined)
    expect(sanitizeSnapshotForCloud('bad')).toEqual({ _meta: { dbVersion: 22, sanitized: true } })
  })

  it('preserves only non-secret OTP verification metadata', () => {
    const out = sanitizeSnapshotForCloud({ users: [{ id: 'u', portalOtp: {} }, { id: 'v' }], studioInfo: null })
    expect(out.users[0].portalOtp).toEqual({ verified: false, verifiedAt: '', via: '', sentAt: '' })
    expect(out.users[1].portalOtp).toBeUndefined()
  })

  it('does not mutate input and handles missing/redacted local secret material', () => {
    const remote = { users: [{ id: 'u1' }, { id: 'u2' }], studioInfo: { supabaseUrl: 'remote' } }
    const local = {
      users: [{ id: 'u1', portalOtp: { code: '[REDACTED]', codeHash: '[REDACTED]' } }],
      studioInfo: { supabaseUrl: 'local', licenseKey: '', supabaseAnonKey: 'anon' },
      apiKeys: [],
      securityState: 'invalid',
    }
    const merged = mergeLocalSecretsAfterPull(remote, local)
    expect(merged.users[0].portalOtp).toBeUndefined()
    expect(merged.users[1]).toEqual({ id: 'u2' })
    expect(merged.studioInfo.supabaseUrl).toBe('remote')
    expect(merged.studioInfo.supabaseAnonKey).toBe('anon')
    expect(merged.apiKeys).toBeUndefined()
    expect(merged.securityState).toBeUndefined()
    expect(remote.studioInfo).toEqual({ supabaseUrl: 'remote' })
  })

  it('returns invalid remote unchanged and does not merge invalid local snapshots', () => {
    expect(mergeLocalSecretsAfterPull(null, {})).toBeNull()
    const remote = { contracts: [{ id: 'c1' }] }
    expect(mergeLocalSecretsAfterPull(remote, null)).toBe(remote)
    expect(mergeLocalSecretsAfterPull(remote, 'bad')).toBe(remote)
  })
})

describe('StudioMutateClient fail-closed transport matrix', () => {
  const defineLocation = hostname => Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { hostname },
  })

  beforeEach(() => {
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('DB', { get: () => ({ supabaseStudioId: 'studio-1', ledgerVersion: 3 }) })
    vi.stubGlobal('navigator', { onLine: true })
    defineLocation('crm.example.ir')
    delete globalThis.__SM_MUTATE_ENABLED
    delete globalThis.__SM_MUTATE_REQUIRED
    delete globalThis.__SM_MUTATE_URL
    delete globalThis.__CRMSTUDIO_ALLOW_LOCAL_FINANCE__
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('allows the explicit localhost fixture override but not loopback without the flag', () => {
    defineLocation('localhost')
    expect(StudioMutateClient.requiredWhenOnline()).toBe(false)
    globalThis.__CRMSTUDIO_ALLOW_LOCAL_FINANCE__ = true
    expect(StudioMutateClient.requiredWhenOnline()).toBe(false)
    defineLocation('127.0.0.1')
    expect(StudioMutateClient.requiredWhenOnline()).toBe(false)
  })

  it('fails closed if authority configuration throws', () => {
    Object.defineProperty(globalThis, 'DB', { configurable: true, get: () => { throw new Error('corrupt') } })
    expect(StudioMutateClient.enabled()).toBe(false)
    expect(StudioMutateClient.requiredWhenOnline()).toBe(true)
  })

  it('resolves flags, Cloud endpoints, auth variants, and stable anchors', async () => {
    globalThis.__SM_MUTATE_ENABLED = true
    expect(StudioMutateClient.enabled()).toBe(true)
    globalThis.__SM_MUTATE_URL = 'https://edge.test/mutate'
    expect(StudioMutateClient._endpoint()).toBe('https://edge.test/mutate')
    delete globalThis.__SM_MUTATE_URL
    vi.stubGlobal('Cloud', { resolvedConfig: () => ({ url: 'https://abc.supabase.co/' }) })
    expect(StudioMutateClient._endpoint()).toBe('https://abc.supabase.co/functions/v1/studio-mutate')
    expect(await StudioMutateClient._authHeader()).toBeNull()
    globalThis.Cloud.client = async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } })
    expect(await StudioMutateClient._authHeader()).toEqual({ Authorization: 'Bearer t' })
    expect(StudioMutateClient.stableKey('op', { idempotencyKey: 'x'.repeat(200) })).toHaveLength(128)
    expect(StudioMutateClient.stableKey('op', { pairId: 'p' })).toBe('op:p')
    expect(StudioMutateClient.stableKey('op', { outTransactionId: 'o' })).toBe('op:o')
    expect(StudioMutateClient.stableKey('op')).toBe('op:missing_anchor')
  })

  it('blocks required writes with missing endpoint, studio, or invalid explicit version', async () => {
    globalThis.__SM_MUTATE_REQUIRED = true
    vi.stubGlobal('Cloud', { client: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } }) })
    expect(await StudioMutateClient.authorize('op')).toMatchObject({ ok: false, reason: 'no_endpoint' })

    globalThis.__SM_MUTATE_URL = 'https://edge.test'
    globalThis.DB = { get: () => ({}) }
    expect(await StudioMutateClient.authorize('op')).toMatchObject({ ok: false, reason: 'no_studio' })
    expect(await StudioMutateClient.authorize('op', {}, { expectedVersion: 1.5 })).toMatchObject({ ok: false, reason: 'invalid_expected_version' })
  })

  it('skips optional transport when endpoint or session is unavailable', async () => {
    defineLocation('localhost')
    globalThis.__SM_MUTATE_ENABLED = true
    expect(await StudioMutateClient.authorize('op')).toMatchObject({ skipped: true, reason: 'no_endpoint' })
    globalThis.__SM_MUTATE_URL = 'https://edge.test'
    expect(await StudioMutateClient.authorize('op')).toMatchObject({ skipped: true, reason: 'no_cloud_session' })
  })

  it('classifies conflict and throttling responses without granting authority', async () => {
    globalThis.__SM_MUTATE_REQUIRED = true
    globalThis.__SM_MUTATE_URL = 'https://edge.test'
    vi.stubGlobal('Cloud', { client: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } }) })
    const captureError = vi.fn()
    vi.stubGlobal('SMObservability', { captureError, captureEvent: vi.fn() })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 409, statusText: '', json: async () => ({ error: 'conflict' }),
    })))
    expect(await StudioMutateClient.authorize('op')).toMatchObject({ ok: false, retryable: false, reason: 'ledger_conflict' })
    globalThis.fetch.mockResolvedValue({ ok: false, status: 429, statusText: 'rate', json: async () => { throw new Error('bad json') } })
    expect(await StudioMutateClient.authorize('op')).toMatchObject({ ok: false, retryable: true, reason: 'server_rejected' })
    expect(captureError).toHaveBeenCalledTimes(2)
  })

  it('records accepted/deduplicated commands and network failures', async () => {
    globalThis.__SM_MUTATE_REQUIRED = true
    globalThis.__SM_MUTATE_URL = 'https://edge.test'
    vi.stubGlobal('Cloud', { client: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } }) })
    const captureEvent = vi.fn()
    const captureError = vi.fn()
    vi.stubGlobal('SMObservability', { captureEvent, captureError })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ deduped: true, result: { ledgerVersion: 4 } }) })))
    expect(await StudioMutateClient.authorize('op')).toMatchObject({ ok: true, deduped: true })
    expect(captureEvent).toHaveBeenCalledWith('studio_mutate', expect.objectContaining({ deduped: true, ledgerVersion: 4 }))

    globalThis.fetch.mockRejectedValue(new Error('down'))
    expect(await StudioMutateClient.authorize('op')).toMatchObject({ ok: false, retryable: true, reason: 'network' })

    defineLocation('localhost')
    delete globalThis.__SM_MUTATE_REQUIRED
    globalThis.__SM_MUTATE_ENABLED = true
    expect(await StudioMutateClient.authorize('op')).toMatchObject({ ok: false, error: 'down' })
    expect(captureError).toHaveBeenCalled()
  })

  it('report handles required, disabled, and optional modes', async () => {
    const authorize = vi.spyOn(StudioMutateClient, 'authorize').mockResolvedValue({ ok: true })
    vi.spyOn(StudioMutateClient, 'requiredWhenOnline').mockReturnValueOnce(true).mockReturnValue(false)
    await expect(StudioMutateClient.report('a', { transactionId: 't' })).resolves.toEqual({ ok: true })
    globalThis.__SM_MUTATE_ENABLED = false
    defineLocation('localhost')
    await expect(StudioMutateClient.report('b')).resolves.toMatchObject({ skipped: true })
    globalThis.__SM_MUTATE_ENABLED = true
    await expect(StudioMutateClient.report('c')).resolves.toEqual({ ok: true })
    expect(authorize).toHaveBeenCalledTimes(2)
  })
})
