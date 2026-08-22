const FORBIDDEN_EXACT_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'salt',
  'otp',
  'otpcode',
  'otp_code',
  'otphash',
  'otp_hash',
  'codehash',
  'service_role',
  'servicerolekey',
  'service_role_key',
  'supabaseservicekey',
  'smsapikey',
  'sms_api_key',
  'smssecret',
  'sms_secret',
  'smsproviderkey',
  'sms_provider_key',
])

function normalizedKey(key) {
  return String(key || '').replace(/[-\s]/g, '_').toLowerCase()
}

function isForbiddenKey(key) {
  const normalized = normalizedKey(key)
  if (FORBIDDEN_EXACT_KEYS.has(normalized)) return true
  return /^(?:sms|provider).*(?:api_?key|secret|token|password)$/.test(normalized)
}

/**
 * The backup API must not rely on a browser sanitizer. It rejects secret-like
 * fields at any nesting depth before encryption so an altered client cannot
 * turn the archive into a credential escrow.
 */
export function assertBackupPayloadSafe(payload, limits = {}) {
  const maxDepth = Number.isInteger(limits.maxDepth) ? limits.maxDepth : 40
  const maxNodes = Number.isInteger(limits.maxNodes) ? limits.maxNodes : 250000
  const seen = new WeakSet()
  let nodes = 0

  function visit(value, depth, path) {
    nodes += 1
    if (nodes > maxNodes || depth > maxDepth) throw new Error('backup_payload_too_complex')
    if (value === null || typeof value !== 'object') return
    if (seen.has(value)) throw new Error('backup_payload_cyclic')
    seen.add(value)

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, depth + 1, `${path}[${index}]`))
      return
    }

    for (const [key, child] of Object.entries(value)) {
      if (isForbiddenKey(key)) throw new Error(`backup_secret_field:${path}.${key}`)
      visit(child, depth + 1, `${path}.${key}`)
    }
  }

  visit(payload, 0, '$')
  return true
}

