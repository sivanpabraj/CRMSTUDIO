import { describe, it, expect } from 'vitest'
import {
  sanitizeSnapshotForCloud,
  mergeLocalSecretsAfterPull
} from '../js/lib/snapshot-sanitize.js'

describe('snapshot-sanitize', () => {
  it('redacts passwords and api keys before cloud push', () => {
    const raw = {
      users: [{ id: 'u1', name: 'A', password: 'hash', salt: 's1', portalOtp: { code: '123456' } }],
      studioInfo: { name: 'X', smsApiKey: 'secret-key', licenseKey: 'lic' },
      apiKeys: [{ id: 'k1', key: 'abc' }],
      securityState: { loginAttempts: {} },
      contracts: [{ id: 'c1' }]
    }
    const out = sanitizeSnapshotForCloud(raw)
    expect(out.users[0].password).toBeUndefined()
    expect(out.users[0].salt).toBeUndefined()
    expect(out.users[0].portalOtp.code).toBe('[REDACTED]')
    expect(out.studioInfo.smsApiKey).toBeUndefined()
    expect(out.apiKeys).toBeUndefined()
    expect(out.securityState).toBeUndefined()
    expect(out._meta.sanitized).toBe(true)
    expect(out.contracts).toHaveLength(1)
  })

  it('merges local secrets after pull', () => {
    const remote = {
      users: [{ id: 'u1', name: 'A', portalOtp: { code: '[REDACTED]', verified: true } }],
      studioInfo: { name: 'X' }
    }
    const local = {
      users: [{ id: 'u1', name: 'A', password: 'local-hash', salt: 'local-salt', portalOtp: { code: '999999', verified: true } }],
      studioInfo: { name: 'X', smsApiKey: 'local-sms' },
      apiKeys: [{ id: 'k1', key: 'local-key' }],
      securityState: { loginAttempts: { '0912': { count: 1 } } }
    }
    const merged = mergeLocalSecretsAfterPull(remote, local)
    expect(merged.users[0].password).toBe('local-hash')
    expect(merged.users[0].salt).toBe('local-salt')
    expect(merged.studioInfo.smsApiKey).toBe('local-sms')
    expect(merged.apiKeys).toHaveLength(1)
    expect(merged.securityState.loginAttempts['0912'].count).toBe(1)
  })
})
