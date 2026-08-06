import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0'

const MAX_TEXT_LEN = 500
const MAX_PHONES = 10
const PURPOSES = new Set([
  'otp_login', 'portal_invite', 'password_reset', 'contract_verify',
  'cheque_reminder', 'generic',
])

function allowedOrigin(req: Request): string | null {
  const requestOrigin = req.headers.get('Origin')
  const allowList = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (!requestOrigin) return null
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
    'X-Content-Type-Options': 'nosniff',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) })
}

function normalizePhone(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '')
  if (/^09\d{9}$/.test(digits)) return digits
  if (/^989\d{9}$/.test(digits)) return `0${digits.slice(2)}`
  if (/^9\d{9}$/.test(digits)) return `0${digits}`
  return null
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
    const studioId = String(body?.studioId || '')
    const purpose = String(body?.purpose || 'generic').toLowerCase()
    const idempotencyKey = String(body?.idempotencyKey || '')
    const rawPhones = Array.isArray(body?.phones) ? body.phones : [body?.phone].filter(Boolean)
    const phones = [...new Set(rawPhones.map(normalizePhone).filter(Boolean))] as string[]
    const text = String(body?.text || '').trim()

    if (!/^[0-9a-f-]{36}$/i.test(studioId)) return json({ ok: false, error: 'invalid_studio_id' }, 400, origin)
    if (!PURPOSES.has(purpose)) return json({ ok: false, error: 'purpose_not_allowed' }, 400, origin)
    if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      return json({ ok: false, error: 'invalid_idempotency_key' }, 400, origin)
    }
    if (!phones.length || phones.length > MAX_PHONES || phones.length !== rawPhones.length) {
      return json({ ok: false, error: 'invalid_recipients' }, 400, origin)
    }
    if (!text || text.length > MAX_TEXT_LEN) return json({ ok: false, error: 'invalid_text' }, 400, origin)

    const supabase = createClient(url, anonKey, {
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

    const provider = Deno.env.get('SMS_PROVIDER') || 'kavenegar'
    const config = {
      apiKey: Deno.env.get('SMS_API_KEY') || '',
      lineNumber: Deno.env.get('SMS_LINE_NUMBER') || '',
      username: Deno.env.get('SMS_USERNAME') || '',
    }
    const result = await sendSms(provider, config, phones, text)
    const { error: completionError } = await supabase.rpc('complete_sms_dispatch', {
      p_dispatch_id: reservation.dispatchId,
      p_success: result.ok,
      p_failure_code: result.ok ? null : String(result.error || 'provider_failed').slice(0, 120),
    })
    if (completionError) {
      console.error('sms_completion_failed', { userId: user.id, code: completionError.code })
    }
    return json(result, result.ok ? 200 : 502, origin)
  } catch {
    return json({ ok: false, error: 'invalid_request' }, 400, origin)
  }
})

function parseMeliCreds(username: string, apiKey: string) {
  if (username && apiKey) return { user: username, pass: apiKey }
  const split = String(apiKey || '').indexOf(':')
  return split > 0
    ? { user: apiKey.slice(0, split), pass: apiKey.slice(split + 1) }
    : { user: '', pass: '' }
}

async function sendSms(
  provider: string,
  config: { apiKey: string; lineNumber: string; username: string },
  phones: string[],
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!config.apiKey) return { ok: false, error: 'sms_not_configured' }
  switch (provider) {
    case 'melipayamak': {
      const { user, pass } = parseMeliCreds(config.username, config.apiKey)
      if (!config.lineNumber) return { ok: false, error: 'line_number_required' }
      if (!user && !config.apiKey.includes(':')) {
        for (const phone of phones) {
          const res = await fetch(`https://console.melipayamak.com/api/send/simple/${encodeURIComponent(config.apiKey)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: config.lineNumber, to: phone, text }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || !data?.recId || Number(data.recId) < 0) return { ok: false, error: 'melipayamak_failed' }
        }
        return { ok: true }
      }
      if (!user || !pass) return { ok: false, error: 'melipayamak_credentials_invalid' }
      for (const phone of phones) {
        const form = new URLSearchParams({ username: user, password: pass, to: phone, from: config.lineNumber, text, isFlash: 'false' })
        const res = await fetch('https://rest.payamak-panel.com/api/SendSMS/SendSMS', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || data?.RetStatus !== 1) return { ok: false, error: 'melipayamak_failed' }
      }
      return { ok: true }
    }
    case 'kavenegar':
      for (const phone of phones) {
        const res = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(config.apiKey)}/sms/send.json`, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ receptor: phone, sender: config.lineNumber, message: text }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || data?.return?.status !== 200) return { ok: false, error: 'kavenegar_failed' }
      }
      return { ok: true }
    case 'smsir': {
      const res = await fetch('https://api.sms.ir/v1/send/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': config.apiKey },
        body: JSON.stringify({ Message: text, MobileNumbers: phones, LineNumber: config.lineNumber, SendDate: '' }),
      })
      const data = await res.json().catch(() => ({}))
      return res.ok && data?.IsSuccessful ? { ok: true } : { ok: false, error: 'smsir_failed' }
    }
    case 'farazsms': {
      const res = await fetch('https://api.iranpayamak.com/ws/v1/sms/simple', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Api-Key': config.apiKey },
        body: JSON.stringify({ text, recipients: phones, line_number: config.lineNumber, number_format: 'english' }),
      })
      const data = await res.json().catch(() => ({}))
      return res.ok && data?.status === 'success' ? { ok: true } : { ok: false, error: 'farazsms_failed' }
    }
    default:
      return { ok: false, error: 'unknown_provider' }
  }
}
