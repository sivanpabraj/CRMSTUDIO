/**
 * Studio M — Cloud snapshot sanitization
 * Strips secrets before push; merges local secrets after pull.
 */

const SNAPSHOT_SECRET_USER_FIELDS = ['password', 'salt']
const SNAPSHOT_SECRET_STUDIO_FIELDS = ['smsApiKey', 'licenseKey']
const SNAPSHOT_OMIT_ROOT_KEYS = ['securityState', 'apiKeys']

export function sanitizeSnapshotForCloud(raw) {
  if (!raw || typeof raw !== 'object') return { _meta: { dbVersion: 20, sanitized: true } }

  const out = structuredClone(raw)

  for (const key of SNAPSHOT_OMIT_ROOT_KEYS) {
    delete out[key]
  }

  if (Array.isArray(out.users)) {
    out.users = out.users.map(u => {
      const copy = { ...u }
      for (const f of SNAPSHOT_SECRET_USER_FIELDS) delete copy[f]
      if (copy.portalOtp?.code) {
        copy.portalOtp = { ...copy.portalOtp, code: '[REDACTED]' }
      }
      if (copy.portalOtp?.codeHash) {
        copy.portalOtp = { ...copy.portalOtp, codeHash: '[REDACTED]', codeSalt: '[REDACTED]' }
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
      if (loc.portalOtp?.code && loc.portalOtp.code !== '[REDACTED]') {
        copy.portalOtp = { ...copy.portalOtp, ...loc.portalOtp }
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
    if (local.studioInfo.supabaseAnonKey && !merged.studioInfo.supabaseAnonKey) {
      merged.studioInfo.supabaseAnonKey = local.studioInfo.supabaseAnonKey
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
