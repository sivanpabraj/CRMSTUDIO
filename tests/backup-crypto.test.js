import { beforeAll, describe, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { backupAad, decryptBackup, encryptBackup } from '../supabase/functions/_shared/backup-crypto.js'
import { assertBackupPayloadSafe } from '../supabase/functions/_shared/backup-policy.js'

beforeAll(() => {
  if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
})

describe('cloud backup AES-GCM envelope (behavior)', () => {
  const key = Buffer.alloc(32, 7).toString('base64')
  const aad = backupAad('20000000-0000-4000-8000-000000000001', 23, 1)

  it('round-trips Unicode ERP data without loss', async () => {
    const payload = { contracts: [{ id: 'c1', couple: 'سیوان و ژیلا' }], amount: 1200000 }
    const encrypted = await encryptBackup(payload, key, aad)
    expect(await decryptBackup(encrypted, key, aad)).toEqual(payload)
    expect(encrypted.ciphertext).not.toContain('سیوان')
  })

  it('rejects ciphertext tampering', async () => {
    const encrypted = await encryptBackup({ finance: [1, 2, 3] }, key, aad)
    const bytes = Buffer.from(encrypted.ciphertext, 'base64')
    bytes[0] ^= 1
    await expect(decryptBackup({ ...encrypted, ciphertext: bytes.toString('base64') }, key, aad))
      .rejects.toThrow('backup_authentication_failed')
  })

  it('binds ciphertext to tenant/schema metadata', async () => {
    const encrypted = await encryptBackup({ ok: true }, key, aad)
    await expect(decryptBackup(encrypted, key, `${aad}|other-tenant`))
      .rejects.toThrow('backup_authentication_failed')
  })

  it.each([
    { users: [{ passwordHash: 'stolen' }] },
    { users: [{ portalOtp: { codeHash: 'stolen' } }] },
    { studioInfo: { smsApiKey: 'stolen' } },
    { nested: { providerSecret: 'stolen' } },
    { config: { service_role_key: 'stolen' } },
  ])('rejects credential material before server-side encryption', (payload) => {
    expect(() => assertBackupPayloadSafe(payload)).toThrow(/backup_secret_field/)
  })

  it('accepts ordinary business data and non-secret password metadata', () => {
    expect(assertBackupPayloadSafe({
      contracts: [{ id: 'c1', total: 1200000 }],
      users: [{ passwordChangedAt: '2026-08-22T00:00:00Z' }],
    })).toBe(true)
  })

})
