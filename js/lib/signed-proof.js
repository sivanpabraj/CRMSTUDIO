/**
 * Studio M — HMAC-signed ephemeral proofs (OTP login, contract verify, customer session)
 */

const PROOF_SECRET_KEY = 'sm_proof_secret'

function canonicalPayload(obj) {
  const keys = Object.keys(obj).filter(k => k !== 'sig' && k !== 'v').sort()
  return keys.map(k => `${k}=${obj[k]}`).join('|')
}

async function getProofSecret() {
  try {
    let s = sessionStorage.getItem(PROOF_SECRET_KEY)
    if (!s) {
      s = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('')
      sessionStorage.setItem(PROOF_SECRET_KEY, s)
    }
    return s
  } catch {
    return null
  }
}

async function hmacSign(data, secret) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function signObject(obj, payloadFn) {
  const canonical = payloadFn ? payloadFn(obj) : canonicalPayload(obj)
  const secret = await getProofSecret()
  if (!secret) return { ...obj, v: 1 }
  const sig = await hmacSign(canonical, secret)
  return { ...obj, sig, v: 1 }
}

export async function verifyObject(obj, payloadFn, matchFields = {}) {
  if (!obj || typeof obj !== 'object') return false
  for (const [k, v] of Object.entries(matchFields)) {
    if (obj[k] !== v) return false
  }
  if (obj.expires != null && Date.now() > obj.expires) return false
  if (!obj.sig) {
    return !!(typeof AppConfig !== 'undefined' && AppConfig.isLocalDev?.())
  }
  try {
    const secret = sessionStorage.getItem(PROOF_SECRET_KEY)
    if (!secret) return false
    const canonical = payloadFn ? payloadFn(obj) : canonicalPayload(obj)
    const expected = await hmacSign(canonical, secret)
    return obj.sig === expected
  } catch {
    return false
  }
}

export async function issueProof(storageKey, fields, ttlMs) {
  const base = { ...fields, expires: Date.now() + ttlMs, v: 1 }
  const signed = await signObject(base, () => canonicalPayload(base))
  sessionStorage.setItem(storageKey, JSON.stringify(signed))
  return signed
}

export async function verifyProof(storageKey, matchFields = {}) {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return false
    const proof = JSON.parse(raw)
    return verifyObject(proof, () => canonicalPayload(proof), matchFields)
  } catch {
    return false
  }
}

export function clearProof(storageKey) {
  try { sessionStorage.removeItem(storageKey) } catch { /* */ }
}

export function clearProofSecret() {
  try { sessionStorage.removeItem(PROOF_SECRET_KEY) } catch { /* */ }
}

const SignedProof = {
  SECRET_KEY: PROOF_SECRET_KEY,
  signObject,
  verifyObject,
  issue: issueProof,
  verify: verifyProof,
  clear: clearProof,
  clearSecret: clearProofSecret
}

if (typeof window !== 'undefined') window.SignedProof = SignedProof
