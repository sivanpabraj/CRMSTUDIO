import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { webcrypto } from 'node:crypto'
import {
  signObject,
  verifyObject,
  issueProof,
  verifyProof,
  clearProof,
  clearProofSecret
} from '../js/lib/signed-proof.js'

describe('SignedProof HMAC', () => {
  const store = new Map()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('crypto', webcrypto)
    vi.stubGlobal('AppConfig', { isLocalDev: () => false })
    vi.stubGlobal('sessionStorage', {
      getItem: k => store.get(k) ?? null,
      setItem: (k, v) => { store.set(k, v) },
      removeItem: k => { store.delete(k) }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('signs and verifies object payload', async () => {
    const signed = await signObject(
      { userId: 'u1', expires: Date.now() + 60000 },
      o => `${o.userId}|${o.expires}`
    )
    expect(signed.sig).toMatch(/^[a-f0-9]{64}$/)
    const ok = await verifyObject(signed, o => `${o.userId}|${o.expires}`)
    expect(ok).toBe(true)
  })

  it('rejects tampered signature', async () => {
    const signed = await signObject({ userId: 'u1', expires: Date.now() + 60000 })
    signed.userId = 'u2'
    const ok = await verifyObject(signed)
    expect(ok).toBe(false)
  })

  it('issues and verifies storage proof', async () => {
    await issueProof('test_proof', { userId: 'u1' }, 60000)
    expect(await verifyProof('test_proof', { userId: 'u1' })).toBe(true)
    expect(await verifyProof('test_proof', { userId: 'u2' })).toBe(false)
    clearProof('test_proof')
    expect(await verifyProof('test_proof', { userId: 'u1' })).toBe(false)
  })

  it('clears proof secret invalidates verification', async () => {
    await issueProof('test_proof', { userId: 'u1' }, 60000)
    clearProofSecret()
    expect(await verifyProof('test_proof', { userId: 'u1' })).toBe(false)
  })
})
