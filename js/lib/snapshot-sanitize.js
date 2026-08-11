/**
 * Studio M — Cloud snapshot sanitization
 * Strips secrets before push; merges local secrets after pull.
 */

const SNAPSHOT_SECRET_USER_FIELDS = ['password', 'salt']
const SNAPSHOT_SECRET_STUDIO_FIELDS = [
  'smsApiKey',
  'smsUsername',
  'licenseKey',
  'supabaseAnonKey',
  'supabaseServiceKey',
  'supabaseUrl'
]
const SNAPSHOT_OMIT_ROOT_KEYS = ['securityState', 'apiKeys']

export function sanitizeSnapshotForCloud(raw) {
  if (!raw || typeof raw !== 'object') {
    return { _meta: { dbVersion: typeof AppConfig !== 'undefined' ? AppConfig.DB_VERSION : 22, sanitized: true } }
  }

  const out = structuredClone(raw)

  for (const key of SNAPSHOT_OMIT_ROOT_KEYS) {
    delete out[key]
  }

  if (Array.isArray(out.users)) {
    out.users = out.users.map(u => {
      const copy = { ...u }
      for (const f of SNAPSHOT_SECRET_USER_FIELDS) delete copy[f]
      if (copy.portalOtp) {
        // Never ship OTP secrets — keep verification metadata only
        copy.portalOtp = {
          verified: !!copy.portalOtp.verified,
          verifiedAt: copy.portalOtp.verifiedAt || '',
          via: copy.portalOtp.via || '',
          sentAt: copy.portalOtp.sentAt || ''
        }
      }
      return copy
    })
  }

  if (out.studioInfo && typeof out.studioInfo === 'object') {
    out.studioInfo = { ...out.studioInfo }
    for (const f of SNAPSHOT_SECRET_STUDIO_FIELDS) delete out.studioInfo[f]
  }

  out._meta = {
    ...(out._meta || {}),
    sanitized: true,
    sanitizedAt: new Date().toISOString()
  }
  return out
}

export function mergeLocalSecretsAfterPull(remote, local) {
  if (!remote || typeof remote !== 'object') return remote
  if (!local || typeof local !== 'object') return remote

  const merged = structuredClone(remote)

  if (Array.isArray(merged.users) && Array.isArray(local.users)) {
    const localById = new Map(local.users.map(u => [u.id, u]))
    merged.users = merged.users.map(u => {
      const loc = localById.get(u.id)
      if (!loc) return u
      const copy = { ...u }
      if (loc.password) copy.password = loc.password
      if (loc.salt) copy.salt = loc.salt
      if (loc.portalOtp) {
        const locOtp = loc.portalOtp
        const hasPlain = locOtp.code && locOtp.code !== '[REDACTED]'
        const hasHash = locOtp.codeHash && locOtp.codeHash !== '[REDACTED]'
        if (hasPlain || hasHash) {
          copy.portalOtp = { ...(copy.portalOtp || {}), ...locOtp }
        }
      }
      return copy
    })
  }

  if (merged.studioInfo && local.studioInfo) {
    merged.studioInfo = { ...merged.studioInfo }
    for (const f of SNAPSHOT_SECRET_STUDIO_FIELDS) {
      if (local.studioInfo[f] && !merged.studioInfo[f]) {
        merged.studioInfo[f] = local.studioInfo[f]
      }
    }
  }

  if (Array.isArray(local.apiKeys) && local.apiKeys.length) {
    merged.apiKeys = local.apiKeys
  }

  if (local.securityState && typeof local.securityState === 'object') {
    merged.securityState = local.securityState
  }

  return merged
}

if (typeof window !== 'undefined') {
  window.SnapshotSanitize = { sanitizeSnapshotForCloud, mergeLocalSecretsAfterPull }
}
