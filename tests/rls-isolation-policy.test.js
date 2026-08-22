/**
 * Mirrors Supabase RLS predicates for studio tenancy (unit-level isolation proof).
 * Staging SQL: docs/RLS_ISOLATION_CHECKS.md
 */
import { describe, it, expect } from 'vitest'

function userStudioIds(memberships, userId, now = new Date('2026-08-16T12:00:00Z')) {
  return memberships
    .filter(m => m.user_id === userId
      && m.status === 'active'
      && !m.revoked_at
      && (!m.valid_from || new Date(m.valid_from) <= now)
      && (!m.valid_until || new Date(m.valid_until) > now))
    .map(m => m.studio_id)
}

function canSelectStudio(memberships, userId, studioId) {
  return userStudioIds(memberships, userId).includes(studioId)
}

function canInsertAudit(memberships, userId, studioId) {
  return canSelectStudio(memberships, userId, studioId)
}

function canClaimLedger(memberships, userId, studioId) {
  return canSelectStudio(memberships, userId, studioId)
}

function mutateStudioAccess(memberships, userId, requestedStudioId) {
  if (!canSelectStudio(memberships, userId, requestedStudioId)) {
    return { ok: false, error: 'studio access denied' }
  }
  return { ok: true }
}

describe('RLS isolation policy mirror', () => {
  const memberships = [
    { user_id: 'user_a', studio_id: 'studio_a', status: 'active', roles: ['studio_manager'] },
    { user_id: 'user_b', studio_id: 'studio_b', status: 'active', roles: ['studio_manager'] },
    { user_id: 'user_a', studio_id: 'studio_b', status: 'inactive', roles: ['office_secretary'] },
    {
      user_id: 'freelancer', studio_id: 'studio_a', status: 'active', roles: ['freelancer'],
      valid_until: '2026-08-15T12:00:00Z'
    },
    {
      user_id: 'revoked_user', studio_id: 'studio_a', status: 'active', roles: ['photographer'],
      revoked_at: '2026-08-16T11:00:00Z'
    }
  ]

  it('denies cross-tenant snapshot/audit visibility', () => {
    expect(canSelectStudio(memberships, 'user_a', 'studio_b')).toBe(false)
    expect(canInsertAudit(memberships, 'user_a', 'studio_b')).toBe(false)
  })

  it('allows own tenant', () => {
    expect(canSelectStudio(memberships, 'user_a', 'studio_a')).toBe(true)
    expect(canClaimLedger(memberships, 'user_a', 'studio_a')).toBe(true)
  })

  it('mutate rejects spoofed studioId', () => {
    expect(mutateStudioAccess(memberships, 'user_a', 'studio_b').ok).toBe(false)
    expect(mutateStudioAccess(memberships, 'user_a', 'studio_a').ok).toBe(true)
  })

  it('inactive membership does not grant access', () => {
    expect(canSelectStudio(memberships, 'user_a', 'studio_b')).toBe(false)
  })

  it('expired or revoked membership does not grant access', () => {
    expect(canSelectStudio(memberships, 'freelancer', 'studio_a')).toBe(false)
    expect(canSelectStudio(memberships, 'revoked_user', 'studio_a')).toBe(false)
  })
})
