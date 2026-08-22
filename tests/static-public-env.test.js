import { describe, expect, it } from 'vitest'
import { Buffer } from 'node:buffer'
import { assertPublishableSupabaseKey, injectStaticPublicEnv, renderStaticBuildFlags } from '../scripts/lib/static-public-env.mjs'

describe('static production environment injection', () => {
  const source = `const url = import.meta.env?.VITE_SUPABASE_URL || ''
const key = import.meta.env?.VITE_SUPABASE_ANON_KEY || ''`

  it('injects the trusted build-time public endpoint and key', () => {
    const output = injectStaticPublicEnv(source, {
      VITE_SUPABASE_URL: 'https://trusted.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_test_key'
    })

    expect(output).toContain('"https://trusted.supabase.co"')
    expect(output).toContain('"sb_publishable_test_key"')
    expect(output).not.toContain('import.meta.env')
  })

  it('rejects modern secret keys', () => {
    expect(() => injectStaticPublicEnv(source, {
      VITE_SUPABASE_URL: 'https://trusted.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_secret_never_ship_this'
    })).toThrow(/never a secret/)
  })

  it('rejects JWT service_role keys', () => {
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')
    const key = `header.${payload}.signature`
    expect(() => injectStaticPublicEnv(source, {
      VITE_SUPABASE_URL: 'https://trusted.supabase.co',
      VITE_SUPABASE_ANON_KEY: key
    })).toThrow(/never a secret/)
  })

  it('accepts empty development config and a JWT carrying only the anon role', () => {
    expect(() => assertPublishableSupabaseKey('')).not.toThrow()
    const payload = Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')
    expect(() => assertPublishableSupabaseKey(`header.${payload}.signature`)).not.toThrow()
  })

  it('rejects malformed and non-anon JWT-like values', () => {
    expect(() => assertPublishableSupabaseKey('header.not-base64.signature')).toThrow(/not a recognized/)
    const payload = Buffer.from(JSON.stringify({ role: 'authenticated' })).toString('base64url')
    expect(() => assertPublishableSupabaseKey(`header.${payload}.signature`)).toThrow(/not a recognized/)
  })

  it('replaces every public placeholder while preserving unrelated expressions', () => {
    const repeated = `${source}\nconst second = import.meta.env?.VITE_SUPABASE_URL\nconst keep = import.meta.env?.PRIVATE_KEY`
    const output = injectStaticPublicEnv(repeated, {
      VITE_SUPABASE_URL: ' https://trusted.supabase.co ',
      VITE_SUPABASE_ANON_KEY: ' sb_publishable_test_key '
    })
    expect(output.match(/"https:\/\/trusted\.supabase\.co"/g)).toHaveLength(2)
    expect(output).toContain('import.meta.env?.PRIVATE_KEY')
  })

  it('keeps local identity disabled unless the isolated E2E build explicitly opts in', () => {
    expect(renderStaticBuildFlags({})).toContain('{"localDemo":false}')
    expect(renderStaticBuildFlags({ E2E_LOCAL_DEMO_BUILD: 'true' })).toContain('{"localDemo":false}')
    expect(renderStaticBuildFlags({ E2E_LOCAL_DEMO_BUILD: '1' })).toContain('{"localDemo":true}')
  })
})
