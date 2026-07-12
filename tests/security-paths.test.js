import { describe, it, expect } from 'vitest'
import {
  safeRedirectPath,
  safeAppRedirect,
  studioMLoginReturnPath,
  normalizeSupabaseUrl,
  jwtRole,
  validateAnonKey,
  phoneToCloudEmail,
} from '../js/lib/security-paths.js'

describe('safeRedirectPath', () => {
  const origin = 'http://localhost:5173'

  it('allows same-origin relative paths', () => {
    expect(safeRedirectPath('/studio-m/', origin)).toBe('/studio-m/')
    expect(safeRedirectPath('/index.html?x=1', origin)).toBe('/index.html?x=1')
  })

  it('blocks external URLs', () => {
    expect(safeRedirectPath('https://evil.com', origin)).toBeNull()
    expect(safeRedirectPath('//evil.com/path', origin)).toBeNull()
  })

  it('blocks non-path values', () => {
    expect(safeRedirectPath('', origin)).toBeNull()
    expect(safeRedirectPath('studio-m/', origin)).toBeNull()
  })
})

describe('safeAppRedirect', () => {
  const origin = 'http://localhost:5173'

  it('allows relative app paths', () => {
    expect(safeAppRedirect('studio-m/', origin)).toBe('/studio-m/')
    expect(safeAppRedirect('admin.html', origin)).toBe('/admin.html')
  })

  it('blocks external URLs', () => {
    expect(safeAppRedirect('https://evil.com', origin)).toBeNull()
  })
})

describe('studioMLoginReturnPath', () => {
  it('preserves hash on studio-m path', () => {
    expect(studioMLoginReturnPath('/studio-m/index.html', '#settings'))
      .toBe('/studio-m/index.html#settings')
  })
})

describe('normalizeSupabaseUrl', () => {
  it('strips trailing slash and rest path', () => {
    expect(normalizeSupabaseUrl('https://abc.supabase.co/')).toBe('https://abc.supabase.co')
    expect(normalizeSupabaseUrl('https://abc.supabase.co/rest/v1')).toBe('https://abc.supabase.co')
  })

  it('converts dashboard URL', () => {
    expect(normalizeSupabaseUrl('https://supabase.com/dashboard/project/abc123'))
      .toBe('https://abc123.supabase.co')
  })
})

describe('validateAnonKey', () => {
  const anonPayload = btoa(JSON.stringify({ role: 'anon', ref: 'test' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const anonKey = `header.${anonPayload}.sig`

  const srPayload = btoa(JSON.stringify({ role: 'service_role', ref: 'test' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const serviceKey = `header.${srPayload}.sig`

  it('accepts anon role', () => {
    expect(validateAnonKey(anonKey).ok).toBe(true)
  })

  it('rejects service_role', () => {
    expect(validateAnonKey(serviceKey).ok).toBe(false)
  })
})

describe('phoneToCloudEmail', () => {
  it('prefixes u and uses studiom.app domain', () => {
    expect(phoneToCloudEmail('09187756267')).toBe('u09187756267@studiom.app')
  })
})

describe('jwtRole', () => {
  it('returns empty for invalid token', () => {
    expect(jwtRole('not-a-jwt')).toBe('')
  })
})
