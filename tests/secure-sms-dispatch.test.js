import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('secure SMS dispatch', () => {
  const migration = readFileSync('supabase/migrations/012_secure_sms_dispatch.sql', 'utf8')
  const edge = readFileSync('supabase/functions/send-sms/index.ts', 'utf8')
  const client = readFileSync('js/sms.js', 'utf8')

  it('uses durable quotas and server-side role authorization', () => {
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('sms_studio_daily_quota')
    expect(migration).toContain("p_purpose = 'generic'")
    expect(migration).toContain('revoke all on function public.reserve_sms_dispatch')
  })

  it('fails closed on CORS and pins the Edge dependency', () => {
    expect(edge).toContain('@supabase/supabase-js@2.110.0')
    expect(edge).not.toContain('if (allowList.length === 0) return reqOrigin')
    expect(edge).toContain("error: 'origin_not_allowed'")
    expect(edge).not.toContain('new Map()')
  })

  it('binds each request to a studio and idempotency key', () => {
    expect(client).toContain('studioId')
    expect(client).toContain('idempotencyKey')
    expect(edge).toContain("supabase.rpc('reserve_sms_dispatch'")
  })
})
