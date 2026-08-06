/**
 * Mirrors Supabase RLS predicates for studio tenancy (unit-level isolation proof).
 * Staging SQL: docs/RLS_ISOLATION_CHECKS.md
 */
import { describe, it, expect } from 'vitest'

function userStudioIds(memberships, userId) {
  return memberships
    .filter(m => m.user_id === userId && m.status === 'active')
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
    { user_id: 'user_a', studio_id: 'studio_b', status: 'inactive', roles: ['office_secretary'] }
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
})
