export const MAX_JSON_BYTES = 16 * 1024

export function normalizeIranPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (/^09\d{9}$/.test(digits)) return digits
  if (/^989\d{9}$/.test(digits)) return `0${digits.slice(2)}`
  if (/^9\d{9}$/.test(digits)) return `0${digits}`
  return null
}

export function isAllowedOrigin(requestOrigin, configuredOrigins) {
  if (!requestOrigin) return true
  const allowed = String(configuredOrigins || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return allowed.includes(requestOrigin)
}

export async function readBoundedJson(req, maxBytes = MAX_JSON_BYTES) {
  const declared = Number(req.headers.get('content-length') || 0)
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('request_too_large')
  }
  const raw = await req.text()
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new Error('request_too_large')
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('invalid_json')
  }
}

export function validateSmsPayload(body) {
  const allowedPurposes = new Set([
    'portal_invite', 'contract_verify', 'cheque_reminder', 'generic',
  ])
  const studioId = String(body?.studioId || '')
  const purpose = String(body?.purpose || 'generic').toLowerCase()
  const idempotencyKey = String(body?.idempotencyKey || '')
  const rawPhones = Array.isArray(body?.phones) ? body.phones : [body?.phone].filter(Boolean)
  const phones = [...new Set(rawPhones.map(normalizeIranPhone).filter(Boolean))]
  const text = String(body?.text || '').trim()

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studioId)) {
    return { ok: false, error: 'invalid_studio_id' }
  }
  if (!allowedPurposes.has(purpose)) return { ok: false, error: 'purpose_not_allowed' }
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return { ok: false, error: 'invalid_idempotency_key' }
  }
  if (!phones.length || phones.length > 10 || phones.length !== rawPhones.length) {
    return { ok: false, error: 'invalid_recipients' }
  }
  if (!text || text.length > 500) return { ok: false, error: 'invalid_text' }
  return { ok: true, studioId, purpose, idempotencyKey, phones, text }
}
