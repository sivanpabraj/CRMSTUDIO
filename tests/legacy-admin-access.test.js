import { describe, it, expect } from 'vitest'

/**
 * Mirrors Access.canAccessLegacyAdmin after manager-only lockdown.
 * Classic admin is emergency escape for studio_manager / system_admin only.
 */
function canAccessLegacyAdmin(user, { isSystemAdmin, isStudioManager }) {
  if (!user) return false
  return !!(isSystemAdmin(user) || isStudioManager(user))
}

describe('legacy admin access policy', () => {
  const yes = () => true
  const no = () => false

  it('allows studio manager', () => {
    expect(canAccessLegacyAdmin({ id: '1' }, { isSystemAdmin: no, isStudioManager: yes })).toBe(true)
  })

  it('allows system admin', () => {
    expect(canAccessLegacyAdmin({ id: '1' }, { isSystemAdmin: yes, isStudioManager: no })).toBe(true)
  })

  it('denies secretary / calendar-only staff', () => {
    expect(canAccessLegacyAdmin({ id: '1', roles: ['office_secretary'] }, {
      isSystemAdmin: no,
      isStudioManager: no
    })).toBe(false)
  })

  it('denies anonymous', () => {
    expect(canAccessLegacyAdmin(null, { isSystemAdmin: no, isStudioManager: no })).toBe(false)
  })
})
