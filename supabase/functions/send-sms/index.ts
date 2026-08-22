import { createClient } from '@supabase/supabase-js'
import {
  isAllowedOrigin,
  readBoundedJson,
  validateSmsPayload,
} from '../_shared/request-policy.js'

type EdgeDeps = {
  createClient: typeof createClient
  env: (name: string) => string | undefined
  fetch: typeof fetch
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
    'X-Content-Type-Options': 'nosniff',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) })
}

async function responseJson(res: Response): Promise<any> {
  try { return await res.json() } catch { return {} }
}

export function createSendSmsHandler(deps: EdgeDeps) {
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
  const serviceRoleKey = deps.env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceRoleKey) {
    return json({ ok: false, error: 'server_not_configured' }, 503, origin)
  }

  try {
    const body = await readBoundedJson(req)
    const validated = validateSmsPayload(body)
    if (!validated.ok) return json({ ok: false, error: validated.error }, 400, origin)
    const { studioId, purpose, idempotencyKey, phones, text } = validated

    const supabase = deps.createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return json({ ok: false, error: 'unauthorized' }, 401, origin)

    const { data: reservation, error: reserveError } = await supabase.rpc('reserve_sms_dispatch', {
      p_studio_id: studioId,
      p_purpose: purpose,
      p_recipient_count: phones.length,
      p_idempotency_key: idempotencyKey,
    })
    if (reserveError) {
      const message = String(reserveError.message || '')
      if (/permission|membership|denied|42501/i.test(message)) {
        return json({ ok: false, error: 'sms_permission_denied' }, 403, origin)
      }
      if (/rate_limit|daily_quota/i.test(message)) {
        return json({ ok: false, error: message.includes('daily') ? 'studio_daily_quota' : 'rate_limit_exceeded' }, 429, origin)
      }
      console.error('sms_reservation_failed', { userId: user.id, code: reserveError.code })
      return json({ ok: false, error: 'sms_reservation_failed' }, 500, origin)
    }
    if (reservation?.deduped) {
      return reservation.status === 'sent'
        ? json({ ok: true, deduped: true }, 200, origin)
        : json({ ok: false, error: `duplicate_${reservation.status}` }, 409, origin)
    }

    const provider = deps.env('SMS_PROVIDER') || 'kavenegar'
    const config = {
      apiKey: deps.env('SMS_API_KEY') || '',
      lineNumber: deps.env('SMS_LINE_NUMBER') || '',
      username: deps.env('SMS_USERNAME') || '',
    }
    const result = await sendSms(provider, config, phones, text, deps.fetch)
    const service = deps.createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: completed, error: completionError } = await service.rpc('complete_sms_dispatch', {
      p_dispatch_id: reservation.dispatchId,
      p_success: result.ok,
      p_failure_code: result.ok ? null : String(result.error || 'provider_failed').slice(0, 120),
    })
    if (completionError || completed !== true) {
      console.error('sms_completion_failed', { userId: user.id, code: completionError?.code || 'not_completed' })
      return json({ ok: false, error: 'sms_completion_failed' }, 500, origin)
    }
    return json(result, result.ok ? 200 : 502, origin)
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'request_too_large') return json({ ok: false, error: code }, 413, origin)
    return json({ ok: false, error: 'invalid_request' }, 400, origin)
  }
  }
}

function parseMeliCreds(username: string, apiKey: string) {
  if (username && apiKey) return { user: username, pass: apiKey }
  const split = String(apiKey || '').indexOf(':')
  return split > 0
    ? { user: apiKey.slice(0, split), pass: apiKey.slice(split + 1) }
    : { user: '', pass: '' }
}

export async function sendSms(
  provider: string,
  config: { apiKey: string; lineNumber: string; username: string },
  phones: string[],
  text: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string }> {
  if (!config.apiKey) return { ok: false, error: 'sms_not_configured' }
  switch (provider) {
    case 'melipayamak': {
      const { user, pass } = parseMeliCreds(config.username, config.apiKey)
      if (!config.lineNumber) return { ok: false, error: 'line_number_required' }
      if (!user && !config.apiKey.includes(':')) {
        for (const phone of phones) {
          const res = await fetchFn(`https://console.melipayamak.com/api/send/simple/${encodeURIComponent(config.apiKey)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: config.lineNumber, to: phone, text }),
          })
          const data = await responseJson(res)
          if (!res.ok || !data?.recId || Number(data.recId) < 0) return { ok: false, error: 'melipayamak_failed' }
        }
        return { ok: true }
      }
      if (!user || !pass) return { ok: false, error: 'melipayamak_credentials_invalid' }
      for (const phone of phones) {
        const form = new URLSearchParams({ username: user, password: pass, to: phone, from: config.lineNumber, text, isFlash: 'false' })
        const res = await fetchFn('https://rest.payamak-panel.com/api/SendSMS/SendSMS', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
        })
        const data = await responseJson(res)
        if (!res.ok || data?.RetStatus !== 1) return { ok: false, error: 'melipayamak_failed' }
      }
      return { ok: true }
    }
    case 'kavenegar':
      for (const phone of phones) {
        const res = await fetchFn(`https://api.kavenegar.com/v1/${encodeURIComponent(config.apiKey)}/sms/send.json`, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ receptor: phone, sender: config.lineNumber, message: text }),
        })
        const data = await responseJson(res)
        if (!res.ok || data?.return?.status !== 200) return { ok: false, error: 'kavenegar_failed' }
      }
      return { ok: true }
    case 'smsir': {
      const res = await fetchFn('https://api.sms.ir/v1/send/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': config.apiKey },
        body: JSON.stringify({ Message: text, MobileNumbers: phones, LineNumber: config.lineNumber, SendDate: '' }),
      })
      const data = await responseJson(res)
      return res.ok && data?.IsSuccessful ? { ok: true } : { ok: false, error: 'smsir_failed' }
    }
    case 'farazsms': {
      const res = await fetchFn('https://api.iranpayamak.com/ws/v1/sms/simple', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Api-Key': config.apiKey },
        body: JSON.stringify({ text, recipients: phones, line_number: config.lineNumber, number_format: 'english' }),
      })
      const data = await responseJson(res)
      return res.ok && data?.status === 'success' ? { ok: true } : { ok: false, error: 'farazsms_failed' }
    }
    default:
      return { ok: false, error: 'unknown_provider' }
  }
}

const runtime = globalThis as typeof globalThis & {
  Deno?: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Promise<Response>): void }
}
if (runtime.Deno?.serve) {
  runtime.Deno.serve(createSendSmsHandler({
    createClient,
    env: name => runtime.Deno?.env.get(name),
    fetch: globalThis.fetch,
  }))
}
