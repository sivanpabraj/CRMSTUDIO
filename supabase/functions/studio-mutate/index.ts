import { createClient } from '@supabase/supabase-js'
import { isAllowedOrigin, readBoundedJson } from '../_shared/request-policy.js'

const FINANCE_OPS = new Set([
  'record_deposit',
  'record_withdrawal',
  'transfer_banks',
  'update_transaction',
  'delete_transaction',
])

type EdgeDeps = {
  createClient: typeof createClient
  env: (name: string) => string | undefined
}

function allowedOrigin(req: Request, env: EdgeDeps['env']): string | null {
  const requestOrigin = req.headers.get('Origin')
  if (!requestOrigin) return null
  return isAllowedOrigin(requestOrigin, env('ALLOWED_ORIGINS') || '')
    ? requestOrigin
    : null
}

function headers(origin: string | null) {
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) })
}

export function createStudioMutateHandler(deps: EdgeDeps) {
  return async (req: Request) => {
  const requestOrigin = req.headers.get('Origin')
  const origin = allowedOrigin(req, deps.env)

  if (req.method === 'OPTIONS') {
    return origin
      ? new Response(null, { status: 204, headers: headers(origin) })
      : json({ ok: false, error: 'origin_not_allowed' }, 403, null)
  }
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, origin)
  if (requestOrigin && !origin) return json({ ok: false, error: 'origin_not_allowed' }, 403, null)

  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return json({ ok: false, error: 'unauthorized' }, 401, origin)
  }

  const url = deps.env('SUPABASE_URL')
  const anonKey = deps.env('SUPABASE_ANON_KEY')
  if (!url || !anonKey) return json({ ok: false, error: 'server_not_configured' }, 503, origin)

  try {
    const body = await readBoundedJson(req)
    const operation = String(body?.op || '')
    const studioId = String(body?.studioId || '')
    const idempotencyKey = String(body?.idempotencyKey || '')
    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {}
    const expectedVersion = body?.expectedVersion

    if (!FINANCE_OPS.has(operation)) {
      return json({ ok: false, error: 'unsupported_operation' }, 400, origin)
    }
    if (!/^[0-9a-f-]{36}$/i.test(studioId)) {
      return json({ ok: false, error: 'invalid_studio_id' }, 400, origin)
    }
    if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      return json({ ok: false, error: 'invalid_idempotency_key' }, 400, origin)
    }
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
      return json({ ok: false, error: 'invalid_expected_ledger_version' }, 400, origin)
    }

    const supabase = deps.createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return json({ ok: false, error: 'unauthorized' }, 401, origin)

    const { data, error } = await supabase.rpc('post_finance_command', {
      p_studio_id: studioId,
      p_operation: operation,
      p_idempotency_key: idempotencyKey,
      p_payload: { ...payload, _expectedLedgerVersion: expectedVersion },
    })
    if (error) {
      const message = String(error.message || '')
      if (/permission|denied|42501/i.test(message)) {
        return json({ ok: false, error: 'finance_permission_denied' }, 403, origin)
      }
      if (/not_found/i.test(message)) return json({ ok: false, error: 'transaction_not_found' }, 404, origin)
      if (/ledger_version_conflict/i.test(message) || error.code === '40001') {
        return json({ ok: false, error: 'ledger_conflict' }, 409, origin)
      }
      if (/invalid|unsupported|required|forbidden/i.test(message)) {
        return json({ ok: false, error: message.split('\n')[0].slice(0, 160) }, 400, origin)
      }
      console.error('post_finance_command_failed', { userId: user.id, operation, code: error.code })
      return json({ ok: false, error: 'finance_command_failed' }, 500, origin)
    }

    // Return the authoritative projection with the command receipt. If this
    // read fails the command remains safely idempotent and the client retries
    // the same key instead of inventing a local balance.
    const { data: balances, error: balancesError } = await supabase
      .from('finance_account_balances')
      .select('account_ref,balance_irr')
      .eq('studio_id', studioId)
      .like('account_ref', 'asset:bank:%')
    if (balancesError) {
      console.error('finance_projection_failed', { userId: user.id, operation, code: balancesError.code })
      return json({ ok: false, error: 'finance_projection_failed', retrySameIdempotencyKey: true }, 503, origin)
    }

    return json({
      ok: true,
      deduped: !!data?.deduped,
      result: { ...data, balances: balances || [] },
    }, 200, origin)
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'request_too_large') return json({ ok: false, error: code }, 413, origin)
    return json({ ok: false, error: 'invalid_request' }, 400, origin)
  }
  }
}

const runtime = globalThis as typeof globalThis & {
  Deno?: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Promise<Response>): void }
}
if (runtime.Deno?.serve) {
  runtime.Deno.serve(createStudioMutateHandler({
    createClient,
    env: name => runtime.Deno?.env.get(name),
  }))
}
