// Supabase Edge Function — SMS proxy (API keys stay server-side)
// Deploy: supabase functions deploy send-sms
// Secrets: SMS_PROVIDER, SMS_API_KEY, SMS_LINE_NUMBER (optional)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_TEXT_LEN = 500
const MAX_PHONES = 10
const RATE_WINDOW_MS = 60_000
const RATE_MAX_PER_USER = 5

const rateBuckets = new Map()

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || '',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Vary': 'Origin',
})

function allowedOrigin(req: Request): string | null {
  const reqOrigin = req.headers.get('Origin')
  const allowList = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  if (allowList.length === 0) {
    /* Fail closed unless localhost (dev) — never reflect arbitrary Origin. */
    if (!reqOrigin) return null
    try {
      const u = new URL(reqOrigin)
      if (['localhost', '127.0.0.1', '::1'].includes(u.hostname)) return reqOrigin
    } catch { /* */ }
    return null
  }
  if (!reqOrigin) return allowList[0] || null
  return allowList.includes(reqOrigin) ? reqOrigin : null
}

function normalizePhone(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '')
  if (/^09\d{9}$/.test(digits)) return digits
  if (/^989\d{9}$/.test(digits)) return '0' + digits.slice(2)
  if (/^9\d{9}$/.test(digits)) return '0' + digits
  return null
}

function checkRate(userId: string): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(userId) || { count: 0, resetAt: now + RATE_WINDOW_MS }
  if (now > bucket.resetAt) {
    bucket.count = 0
    bucket.resetAt = now + RATE_WINDOW_MS
  }
  bucket.count += 1
  rateBuckets.set(userId, bucket)
  return bucket.count <= RATE_MAX_PER_USER
}

Deno.serve(async (req) => {
  const origin = allowedOrigin(req)
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    if (!origin) return new Response('forbidden', { status: 403 })
    return new Response('ok', { headers })
  }

  try {
    if (!origin && (Deno.env.get('ALLOWED_ORIGINS') || '').trim()) {
      return json({ ok: false, error: 'origin not allowed' }, 403, origin)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ ok: false, error: 'unauthorized' }, 401, origin)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) {
      return json({ ok: false, error: 'not authenticated' }, 401, origin)
    }

    /* P0: only active studio managers may send SMS (project-wide spam abuse). */
    const { data: membership, error: memErr } = await supabase
      .from('studio_members')
      .select('studio_id, roles, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .contains('roles', ['studio_manager'])
      .limit(1)
      .maybeSingle()
    if (memErr || !membership?.studio_id) {
      return json({ ok: false, error: 'forbidden: studio_manager required' }, 403, origin)
    }

    if (!checkRate(user.id)) {
      return json({ ok: false, error: 'rate limit exceeded' }, 429, origin)
    }

    const body = await req.json()
    const rawPhones = Array.isArray(body.phones) ? body.phones : [body.phone].filter(Boolean)
    if (rawPhones.length > MAX_PHONES) {
      return json({ ok: false, error: `max ${MAX_PHONES} phones per request` }, 400, origin)
    }

    const phones = rawPhones.map(normalizePhone).filter(Boolean) as string[]
    const text = String(body.text || '').trim()
    if (!phones.length || !text) {
      return json({ ok: false, error: 'phones and text required' }, 400, origin)
    }
    if (text.length > MAX_TEXT_LEN) {
      return json({ ok: false, error: `text max ${MAX_TEXT_LEN} chars` }, 400, origin)
    }

    const provider = Deno.env.get('SMS_PROVIDER') || 'kavenegar'
    const apiKey = Deno.env.get('SMS_API_KEY') || ''
    const lineNumber = Deno.env.get('SMS_LINE_NUMBER') || ''
    const username = Deno.env.get('SMS_USERNAME') || ''
    if (provider === 'melipayamak') {
      const { user, pass } = parseMeliCreds(username, apiKey)
      const isConsoleToken = !user && !!apiKey && !String(apiKey).includes(':')
      if (!isConsoleToken && (!user || !pass)) {
        return json({ ok: false, error: 'Melipayamak: SMS_API_KEY=console-token یا SMS_USERNAME+رمز، یا user:pass' }, 503, origin)
      }
      if (!lineNumber) {
        return json({ ok: false, error: 'SMS_LINE_NUMBER (شماره خط ملی پیامک) الزامی است' }, 503, origin)
      }
    } else if (!apiKey) {
      return json({ ok: false, error: 'SMS not configured on server' }, 503, origin)
    }

    const result = await sendSms(provider, { apiKey, lineNumber, username }, phones, text)
    return json(result, result.ok ? 200 : 502, origin)
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500, origin)
  }
})

function json(data: Record<string, unknown>, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

function parseMeliCreds(username: string, apiKey: string): { user: string; pass: string } {
  if (username && apiKey) return { user: username, pass: apiKey }
  const raw = String(apiKey || '')
  const idx = raw.indexOf(':')
  if (idx > 0) return { user: raw.slice(0, idx), pass: raw.slice(idx + 1) }
  return { user: '', pass: '' }
}

/** Melipayamak RetStatus=1 is success; Value is RecId or negative error code */
function meliOk(data: { RetStatus?: number; Value?: string | number; StrRetStatus?: string }): { ok: boolean; error?: string } {
  if (data?.RetStatus === 1) return { ok: true }
  const code = data?.Value != null ? String(data.Value) : ''
  const msg = data?.StrRetStatus || 'melipayamak error'
  return { ok: false, error: code ? `${msg} (${code})` : msg }
}

async function sendSms(
  provider: string,
  config: { apiKey: string; lineNumber: string; username?: string },
  phones: string[],
  text: string
): Promise<{ ok: boolean; error?: string }> {
  switch (provider) {
    case 'melipayamak': {
      const { user, pass } = parseMeliCreds(config.username || '', config.apiKey)
      const from = config.lineNumber || ''
      if (!from) return { ok: false, error: 'SMS_LINE_NUMBER (شماره خط ملی پیامک) الزامی است' }

      // کنسول ملی پیامک: توکن در URL — https://console.melipayamak.com/api/send/simple/{token}
      if (!user && config.apiKey && !String(config.apiKey).includes(':')) {
        for (const phone of phones) {
          const res = await fetch(
            `https://console.melipayamak.com/api/send/simple/${encodeURIComponent(config.apiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ from, to: phone, text }),
            }
          )
          const data = await res.json().catch(() => ({}))
          // status خالی/موفق و recId مثبت = ok؛ status متن خطا می‌دهد
          const errMsg = typeof data?.status === 'string' ? data.status.trim() : ''
          const recId = data?.recId
          const badRec = recId == null || recId === '' || Number(recId) < 0
          if (!res.ok || (errMsg && badRec) || badRec) {
            return { ok: false, error: errMsg || `melipayamak console ${res.status}` }
          }
        }
        return { ok: true }
      }

      for (const phone of phones) {
        const body = new URLSearchParams({
          username: user,
          password: pass,
          to: phone,
          from,
          text,
          isFlash: 'false',
        })
        const res = await fetch('https://rest.payamak-panel.com/api/SendSMS/SendSMS', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        })
        const data = await res.json().catch(() => ({}))
        const check = meliOk(data)
        if (!check.ok) return check
      }
      return { ok: true }
    }
    case 'kavenegar':
      for (const phone of phones) {
        const res = await fetch(`https://api.kavenegar.com/v1/${config.apiKey}/sms/send.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `receptor=${encodeURIComponent(phone)}&sender=${encodeURIComponent(config.lineNumber)}&message=${encodeURIComponent(text)}`,
        })
        const data = await res.json()
        if (!data.return || data.return.status !== 200) {
          return { ok: false, error: data.return?.message || 'kavenegar error' }
        }
      }
      return { ok: true }
    case 'smsir': {
      const res = await fetch('https://api.sms.ir/v1/send/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': config.apiKey,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          Message: text,
          MobileNumbers: phones,
          LineNumber: config.lineNumber,
          SendDate: '',
        }),
      })
      const data = await res.json()
      return data.IsSuccessful ? { ok: true } : { ok: false, error: data.Message || 'smsir error' }
    }
    case 'farazsms': {
      const res = await fetch('https://api.iranpayamak.com/ws/v1/sms/simple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Api-Key': config.apiKey },
        body: JSON.stringify({
          text,
          recipients: phones,
          line_number: config.lineNumber || '90008361',
          number_format: 'english',
        }),
      })
      const data = await res.json()
      return data.status === 'success' ? { ok: true } : { ok: false, error: data.message || 'faraz error' }
    }
    default:
      return { ok: false, error: 'unknown provider' }
  }
}
