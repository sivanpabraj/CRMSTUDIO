import { describe, expect, it, vi } from 'vitest'
import { createSendSmsHandler, sendSms } from '../supabase/functions/send-sms/index.ts'
import { createStudioMutateHandler } from '../supabase/functions/studio-mutate/index.ts'
import { createCloudBackupHandler } from '../supabase/functions/cloud-backup/index.ts'
import { createHealthHandler } from '../supabase/functions/health/index.ts'

const studioId = '21000000-0000-4000-8000-000000000001'
const origin = 'https://crm.example.ir'

function request(body, { method = 'POST', allowedOrigin = origin, auth = true, headers = {} } = {}) {
  return new globalThis.Request('https://edge.test/function', {
    method,
    headers: {
      ...(allowedOrigin ? { Origin: allowedOrigin } : {}),
      ...(auth ? { Authorization: 'Bearer token' } : {}),
      'Content-Type': 'application/json',
      ...headers
    },
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {})
  })
}

async function payload(response) { return response.json() }

function env(overrides = {}) {
  const values = {
    ALLOWED_ORIGINS: origin,
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'anon-secret',
    SUPABASE_SERVICE_ROLE_KEY: 'service-secret',
    SMS_PROVIDER: 'unknown',
    SMS_API_KEY: 'provider-secret',
    SMS_LINE_NUMBER: '1000',
    SMS_USERNAME: '',
    BACKUP_ENCRYPTION_KEY_V1: 'encryption-secret',
    ...overrides
  }
  return name => values[name]
}

function validSms() {
  return { studioId, purpose: 'generic', idempotencyKey: 'sms-request-0001', phones: ['09121111111'], text: 'hello' }
}

describe('send-sms edge handler', () => {
  function clients({ user = { id: 'u1' }, userError = null, reservation = { dispatchId: 'd1' }, reserveError = null, completed = true, completionError = null } = {}) {
    const userClient = { auth: { getUser: vi.fn(async () => ({ data: { user }, error: userError })) }, rpc: vi.fn(async () => ({ data: reservation, error: reserveError })) }
    const service = { rpc: vi.fn(async () => ({ data: completed, error: completionError })) }
    return { createClient: vi.fn((_url, key) => key === 'service-secret' ? service : userClient), userClient, service }
  }

  it.each([
    ['GET', 405, 'method_not_allowed'],
    ['OPTIONS', 204, null]
  ])('handles %s method', async (method, status, error) => {
    const c = clients()
    const res = await createSendSmsHandler({ createClient: c.createClient, env: env(), fetch: vi.fn() })(request(null, { method }))
    expect(res.status).toBe(status)
    if (error) expect(await payload(res)).toMatchObject({ error })
  })

  it('rejects a disallowed preflight and accepts a server-to-server request without Origin', async () => {
    const c = clients({ reservation: { deduped: true, status: 'sent' } })
    const handler = createSendSmsHandler({ createClient: c.createClient, env: env(), fetch: vi.fn() })
    expect((await handler(request(null, { method: 'OPTIONS', allowedOrigin: 'https://evil.test' }))).status).toBe(403)
    expect((await handler(request(validSms(), { allowedOrigin: null }))).status).toBe(200)
  })

  it('rejects origin, auth, missing configuration, invalid body and oversized body', async () => {
    const c = clients()
    const handler = createSendSmsHandler({ createClient: c.createClient, env: env(), fetch: vi.fn() })
    expect((await handler(request(validSms(), { allowedOrigin: 'https://evil.test' }))).status).toBe(403)
    expect((await handler(request(validSms(), { auth: false }))).status).toBe(401)
    expect((await createSendSmsHandler({ createClient: c.createClient, env: env({ SUPABASE_URL: '' }), fetch: vi.fn() })(request(validSms()))).status).toBe(503)
    expect((await handler(request({ nope: true }))).status).toBe(400)
    expect((await handler(request(validSms(), { headers: { 'Content-Length': '20000' } }))).status).toBe(413)
    expect((await handler(request('{bad'))).status).toBe(400)
  })

  it('maps auth, permission, quota, generic reservation and duplicate states', async () => {
    for (const [options, status] of [
      [{ user: null }, 401],
      [{ reserveError: { message: 'permission denied', code: '42501' } }, 403],
      [{ reserveError: { message: 'daily_quota', code: 'x' } }, 429],
      [{ reserveError: { message: 'rate_limit', code: 'x' } }, 429],
      [{ reserveError: { message: 'database unavailable', code: 'x' } }, 500],
      [{ reservation: { deduped: true, status: 'sent' } }, 200],
      [{ reservation: { deduped: true, status: 'reserved' } }, 409]
    ]) {
      const c = clients(options)
      const res = await createSendSmsHandler({ createClient: c.createClient, env: env(), fetch: vi.fn() })(request(validSms()))
      expect(res.status).toBe(status)
    }
  })

  it('completes a provider result using service credentials without leaking secrets', async () => {
    const c = clients()
    const res = await createSendSmsHandler({ createClient: c.createClient, env: env(), fetch: vi.fn() })(request(validSms()))
    expect(res.status).toBe(502)
    const text = await res.text()
    expect(text).not.toContain('provider-secret')
    expect(text).not.toContain('service-secret')
    expect(c.service.rpc).toHaveBeenCalledWith('complete_sms_dispatch', expect.objectContaining({ p_success: false }))

    const failed = clients({ completed: false })
    expect((await createSendSmsHandler({ createClient: failed.createClient, env: env(), fetch: vi.fn() })(request(validSms()))).status).toBe(500)
  })

  it('records a successful provider completion with no failure code', async () => {
    const c = clients()
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ return: { status: 200 } }) }))
    const res = await createSendSmsHandler({ createClient: c.createClient, env: env({ SMS_PROVIDER: '', SMS_USERNAME: undefined }), fetch })(request(validSms()))
    expect(res.status).toBe(200)
    expect(c.service.rpc).toHaveBeenCalledWith('complete_sms_dispatch', expect.objectContaining({ p_success: true, p_failure_code: null }))
  })
})

describe('SMS provider adapter', () => {
  const config = { apiKey: 'key', lineNumber: '1000', username: '' }
  const okJson = data => vi.fn(async () => ({ ok: true, json: async () => data }))

  it('rejects absent credentials and unknown providers', async () => {
    expect(await sendSms('kavenegar', { ...config, apiKey: '' }, ['09121111111'], 'x', vi.fn())).toMatchObject({ error: 'sms_not_configured' })
    expect(await sendSms('other', config, ['09121111111'], 'x', vi.fn())).toMatchObject({ error: 'unknown_provider' })
  })

  it('covers Kavenegar, SMS.ir and Faraz success and failure responses', async () => {
    expect((await sendSms('kavenegar', config, ['09121111111'], 'x', okJson({ return: { status: 200 } }))).ok).toBe(true)
    expect((await sendSms('kavenegar', config, ['09121111111'], 'x', okJson({ return: { status: 500 } }))).ok).toBe(false)
    expect((await sendSms('smsir', config, ['09121111111'], 'x', okJson({ IsSuccessful: true }))).ok).toBe(true)
    expect((await sendSms('smsir', config, ['09121111111'], 'x', okJson({ IsSuccessful: false }))).ok).toBe(false)
    expect((await sendSms('farazsms', config, ['09121111111'], 'x', okJson({ status: 'success' }))).ok).toBe(true)
    expect((await sendSms('farazsms', config, ['09121111111'], 'x', okJson({ status: 'failed' }))).ok).toBe(false)
  })

  it('covers both Melipayamak credential modes and provider failures', async () => {
    expect((await sendSms('melipayamak', { ...config, lineNumber: '' }, ['09121111111'], 'x', vi.fn())).error).toBe('line_number_required')
    expect((await sendSms('melipayamak', config, ['09121111111'], 'x', okJson({ recId: 1 }))).ok).toBe(true)
    expect((await sendSms('melipayamak', config, ['09121111111'], 'x', okJson({ recId: -1 }))).ok).toBe(false)
    expect((await sendSms('melipayamak', { ...config, apiKey: 'user:pass' }, ['09121111111'], 'x', okJson({ RetStatus: 1 }))).ok).toBe(true)
    expect((await sendSms('melipayamak', { ...config, username: 'user' }, ['09121111111'], 'x', okJson({ RetStatus: 0 }))).ok).toBe(false)
    expect((await sendSms('melipayamak', { ...config, apiKey: ':' }, ['09121111111'], 'x', vi.fn())).error).toBe('melipayamak_credentials_invalid')
    expect((await sendSms('kavenegar', config, ['09121111111'], 'x', vi.fn(async () => ({ ok: true, json: async () => { throw new Error('bad json') } })))).ok).toBe(false)
  })
})

describe('studio-mutate edge handler', () => {
  const valid = { op: 'record_deposit', studioId, idempotencyKey: 'finance-command-1', expectedVersion: 0, payload: { transactionId: 't1', amount: 10, bankId: 'b1' } }
  function client({ user = { id: 'u1' }, rpcData = { ledgerVersion: 1 }, rpcError = null, balances = [], balancesError = null } = {}) {
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), like: vi.fn(async () => ({ data: balances, error: balancesError })) }
    const value = { auth: { getUser: vi.fn(async () => ({ data: { user }, error: user ? null : {} })) }, rpc: vi.fn(async () => ({ data: rpcData, error: rpcError })), from: vi.fn(() => query) }
    return { createClient: vi.fn(() => value), value }
  }

  it('enforces method, CORS, auth, configuration, body limits and input contract', async () => {
    const c = client(); const handler = createStudioMutateHandler({ createClient: c.createClient, env: env() })
    expect((await handler(request(null, { method: 'GET' }))).status).toBe(405)
    expect((await handler(request(null, { method: 'OPTIONS' }))).status).toBe(204)
    expect((await handler(request(null, { method: 'OPTIONS', allowedOrigin: 'https://evil.test' }))).status).toBe(403)
    expect((await handler(request(valid, { allowedOrigin: null }))).status).toBe(200)
    expect((await handler(request(valid, { allowedOrigin: 'https://evil.test' }))).status).toBe(403)
    expect((await handler(request(valid, { auth: false }))).status).toBe(401)
    expect((await createStudioMutateHandler({ createClient: c.createClient, env: env({ SUPABASE_ANON_KEY: '' }) })(request(valid))).status).toBe(503)
    expect((await handler(request({ ...valid, op: 'hack' }))).status).toBe(400)
    expect((await handler(request({ ...valid, studioId: 'bad' }))).status).toBe(400)
    expect((await handler(request({ ...valid, idempotencyKey: 'x' }))).status).toBe(400)
    expect((await handler(request({ ...valid, expectedVersion: undefined }))).status).toBe(400)
    expect((await handler(request(valid, { headers: { 'Content-Length': '20000' } }))).status).toBe(413)
  })

  it('maps permission, missing transaction, conflict, validation and internal errors', async () => {
    for (const [message, code, status] of [
      ['permission denied', '42501', 403], ['transaction_not_found', 'x', 404],
      ['ledger_version_conflict', '40001', 409], ['invalid_amount', 'x', 400], ['database down', 'x', 500]
    ]) {
      const c = client({ rpcError: { message, code } })
      expect((await createStudioMutateHandler({ createClient: c.createClient, env: env() })(request(valid))).status).toBe(status)
    }
  })

  it('returns authoritative balances, dedupe state and projection retry semantics', async () => {
    const c = client({ rpcData: { deduped: true, ledgerVersion: 2 }, balances: [{ account_ref: 'asset:bank:b1', balance_irr: 100 }] })
    const res = await createStudioMutateHandler({ createClient: c.createClient, env: env() })(request(valid))
    expect(res.status).toBe(200)
    expect(await payload(res)).toMatchObject({ ok: true, deduped: true, result: { ledgerVersion: 2 } })
    expect(c.value.rpc).toHaveBeenCalledWith('post_finance_command', expect.objectContaining({ p_payload: expect.objectContaining({ _expectedLedgerVersion: 0 }) }))
    const failed = client({ balancesError: { code: 'x' } })
    expect((await createStudioMutateHandler({ createClient: failed.createClient, env: env() })(request(valid))).status).toBe(503)
    const unauthorized = client({ user: null })
    expect((await createStudioMutateHandler({ createClient: unauthorized.createClient, env: env() })(request(valid))).status).toBe(401)
    const emptyBalances = client({ balances: null })
    expect((await payload(await createStudioMutateHandler({ createClient: emptyBalances.createClient, env: env() })(request(valid)))).result.balances).toEqual([])
    expect((await createStudioMutateHandler({ createClient: c.createClient, env: env() })(request('{bad'))).status).toBe(400)
  })
})

describe('cloud-backup edge handler', () => {
  const valid = { studioId, action: 'create', schemaVersion: 24, appVersion: '1.0.1', payload: { contracts: [{ id: 1 }] } }
  function setup({ user = { id: 'u1' }, rpc = vi.fn(async () => ({ data: 'backup-default', error: null })), encrypt, decrypt, policy = vi.fn() } = {}) {
    const userClient = { auth: { getUser: vi.fn(async () => ({ data: { user }, error: user ? null : {} })) } }
    const service = { rpc }
    const createClient = vi.fn((_url, key) => key === 'service-secret' ? service : userClient)
    return {
      deps: {
        createClient, env: env(), backupAad: vi.fn(() => 'aad'),
        assertBackupPayloadSafe: policy,
        encryptBackup: encrypt || vi.fn(async () => ({ ciphertext: 'cipher', nonce: 'nonce', checksum: 'sum', plaintextBytes: 10 })),
        decryptBackup: decrypt || vi.fn(async () => ({ restored: true }))
      }, service
    }
  }

  it('enforces method, origin, auth, configuration, input and size limits', async () => {
    const s = setup(); const handler = createCloudBackupHandler(s.deps)
    expect((await handler(request(null, { method: 'GET' }))).status).toBe(405)
    expect((await handler(request(null, { method: 'OPTIONS' }))).status).toBe(204)
    expect((await handler(request(null, { method: 'OPTIONS', allowedOrigin: 'https://evil.test' }))).status).toBe(403)
    expect((await handler(request(valid, { allowedOrigin: 'https://evil.test' }))).status).toBe(403)
    expect((await handler(request(valid, { allowedOrigin: null }))).status).toBe(201)
    expect((await handler(request(valid, { auth: false }))).status).toBe(401)
    const unauthorized = setup({ user: null })
    expect((await createCloudBackupHandler(unauthorized.deps)(request(valid))).status).toBe(401)
    expect((await createCloudBackupHandler({ ...s.deps, env: env({ BACKUP_ENCRYPTION_KEY_V1: '' }) })(request(valid))).status).toBe(503)
    expect((await handler(request({ ...valid, studioId: 'bad' }))).status).toBe(400)
    expect((await handler(request({ ...valid, payload: [] }))).status).toBe(400)
    expect((await handler(request({ ...valid, schemaVersion: 0 }))).status).toBe(400)
    expect((await handler(request('{bad'))).status).toBe(400)
    const big = setup({ encrypt: vi.fn(async () => ({ plaintextBytes: 21 * 1024 * 1024 })) })
    expect((await createCloudBackupHandler(big.deps)(request(valid))).status).toBe(413)
    expect((await handler(request(valid, { headers: { 'Content-Length': String(22 * 1024 * 1024) } }))).status).toBe(413)
  })

  it('creates an encrypted backup and never returns encryption or service secrets', async () => {
    const rpc = vi.fn(async () => ({ data: 'backup-1', error: null }))
    const s = setup({ rpc }); const res = await createCloudBackupHandler(s.deps)(request(valid))
    expect(res.status).toBe(201)
    const text = await res.text()
    expect(text).not.toContain('encryption-secret')
    expect(text).not.toContain('service-secret')
    expect(rpc).toHaveBeenCalledWith('store_encrypted_studio_backup', expect.objectContaining({ p_ciphertext: 'cipher', p_actor_id: 'u1' }))
    expect(s.deps.assertBackupPayloadSafe).toHaveBeenCalledWith(valid.payload)
  })

  it('maps create permission, policy and storage failures', async () => {
    const denied = setup({ rpc: vi.fn(async () => ({ error: { message: 'permission 42501' } })) })
    expect((await createCloudBackupHandler(denied.deps)(request(valid))).status).toBe(403)
    const failed = setup({ rpc: vi.fn(async () => ({ error: { message: 'disk' } })) })
    expect((await createCloudBackupHandler(failed.deps)(request(valid))).status).toBe(500)
    const unsafe = setup({ policy: vi.fn(() => { throw new Error('backup_secret_field:$.otp') }) })
    expect((await createCloudBackupHandler(unsafe.deps)(request(valid))).status).toBe(422)
  })

  it('restores an authorized encrypted archive and maps read/key failures', async () => {
    const record = { ciphertext: 'cipher', nonce: 'nonce', checksum: 'sum', manifest: { keyVersion: 1, aad: 'aad' } }
    const ok = setup({ rpc: vi.fn(async () => ({ data: record, error: null })) })
    const res = await createCloudBackupHandler(ok.deps)(request({ studioId, action: 'restore', backupId: 'b1' }))
    expect(res.status).toBe(200)
    expect(await payload(res)).toMatchObject({ payload: { restored: true } })
    const denied = setup({ rpc: vi.fn(async () => ({ data: null, error: { message: 'permission 42501' } })) })
    expect((await createCloudBackupHandler(denied.deps)(request({ studioId, action: 'restore', backupId: 'b1' }))).status).toBe(403)
    const missing = setup({ rpc: vi.fn(async () => ({ data: null, error: null })) })
    expect((await createCloudBackupHandler(missing.deps)(request({ studioId, action: 'restore', backupId: 'b1' }))).status).toBe(404)
    const noKey = setup({ rpc: vi.fn(async () => ({ data: { ...record, manifest: { keyVersion: 9, aad: 'aad' } }, error: null })) })
    expect((await createCloudBackupHandler(noKey.deps)(request({ studioId, action: 'restore', backupId: 'b1' }))).status).toBe(503)
    expect((await createCloudBackupHandler(ok.deps)(request({ studioId, action: 'other' }))).status).toBe(400)
  })
})

describe('health edge handler', () => {
  it('reports configured, degraded and invalid methods with deterministic time', async () => {
    const now = () => new Date('2026-08-22T00:00:00.000Z')
    const healthy = createHealthHandler({ env: env(), now })
    expect((await payload(healthy(new globalThis.Request('https://edge.test', { method: 'GET' })))).status).toBe('ok')
    expect(healthy(new globalThis.Request('https://edge.test', { method: 'HEAD' })).status).toBe(200)
    expect(createHealthHandler({ env: env({ SUPABASE_URL: '' }), now })(new globalThis.Request('https://edge.test')).status).toBe(503)
    expect(healthy(new globalThis.Request('https://edge.test', { method: 'POST' })).status).toBe(405)
  })
})

describe('Deno thin adapters', () => {
  it('registers importable handlers and injects runtime environment', async () => {
    const handlers = []
    vi.stubGlobal('Deno', {
      env: { get: vi.fn(name => env()(name)) },
      serve: vi.fn(handler => handlers.push(handler))
    })
    await import('../supabase/functions/send-sms/index.ts?runtime-adapter')
    await import('../supabase/functions/studio-mutate/index.ts?runtime-adapter')
    await import('../supabase/functions/cloud-backup/index.ts?runtime-adapter')
    await import('../supabase/functions/health/index.ts?runtime-adapter')
    expect(handlers).toHaveLength(4)
    expect((await handlers[0](request(null, { method: 'OPTIONS' }))).status).toBe(204)
    expect((await handlers[1](request(null, { method: 'OPTIONS' }))).status).toBe(204)
    expect((await handlers[2](request(null, { method: 'OPTIONS' }))).status).toBe(204)
    expect(handlers[3](new globalThis.Request('https://edge.test')).status).toBe(200)
    vi.unstubAllGlobals()
  })
})
