import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FINANCE_OPS = new Set([
  'record_deposit',
  'record_withdrawal',
  'transfer_banks',
  'update_transaction',
  'delete_transaction',
])

function allowedOrigin(req: Request): string | null {
  const requestOrigin = req.headers.get('Origin')
  if (!requestOrigin) return null
  const allowList = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return allowList.includes(requestOrigin) ? requestOrigin : null
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

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get('Origin')
  const origin = allowedOrigin(req)

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

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anonKey) return json({ ok: false, error: 'server_not_configured' }, 503, origin)

  try {
    const body = await req.json()
    const operation = String(body?.op || '')
    const studioId = String(body?.studioId || '')
    const idempotencyKey = String(body?.idempotencyKey || '')
    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {}

    if (!FINANCE_OPS.has(operation)) {
      return json({ ok: false, error: 'unsupported_operation' }, 400, origin)
    }
    if (!/^[0-9a-f-]{36}$/i.test(studioId)) {
      return json({ ok: false, error: 'invalid_studio_id' }, 400, origin)
    }
    if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      return json({ ok: false, error: 'invalid_idempotency_key' }, 400, origin)
    }

    const supabase = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return json({ ok: false, error: 'unauthorized' }, 401, origin)

    const { data, error } = await supabase.rpc('post_finance_command', {
      p_studio_id: studioId,
      p_operation: operation,
      p_idempotency_key: idempotencyKey,
      p_payload: payload,
    })
    if (error) {
      const message = String(error.message || '')
      if (/permission|denied|42501/i.test(message)) {
        return json({ ok: false, error: 'finance_permission_denied' }, 403, origin)
      }
      if (/not_found/i.test(message)) return json({ ok: false, error: 'transaction_not_found' }, 404, origin)
      if (/invalid|unsupported|required|forbidden/i.test(message)) {
        return json({ ok: false, error: message.split('\n')[0].slice(0, 160) }, 400, origin)
      }
      console.error('post_finance_command_failed', { userId: user.id, operation, code: error.code })
      return json({ ok: false, error: 'finance_command_failed' }, 500, origin)
    }

    return json({ ok: true, deduped: !!data?.deduped, result: data }, 200, origin)
  } catch {
    return json({ ok: false, error: 'invalid_request' }, 400, origin)
  }
})
