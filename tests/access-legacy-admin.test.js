import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('Access.canAccessLegacyAdmin (real module)', () => {
  it('allows only studio manager / system admin', () => {
    const rolesSrc = fs.readFileSync(path.join(root, 'js/roles.js'), 'utf8')
    const accessSrc = fs.readFileSync(path.join(root, 'js/access.js'), 'utf8')
    const sandbox = {
      console,
      window: {},
      Auth: { getUser: () => null },
      DB: { findPersonnelByUserId: () => null, findPersonnelByPhone: () => null, filter: () => [] }
    }
    sandbox.window = sandbox
    vm.runInNewContext(rolesSrc + '\n' + accessSrc + '\nthis.Access = Access;', sandbox)

    const Access = sandbox.Access
    expect(Access.canAccessLegacyAdmin({ id: '1', roles: ['studio_manager'], status: 'active' })).toBe(true)
    expect(Access.canAccessLegacyAdmin({ id: '2', roles: ['system_admin'], status: 'active' })).toBe(true)
    expect(Access.canAccessLegacyAdmin({ id: '3', roles: ['office_secretary'], status: 'active' })).toBe(false)
    expect(Access.canAccessLegacyAdmin({ id: '4', roles: ['coordinator'], status: 'active' })).toBe(false)
    expect(Access.canAccessLegacyAdmin(null)).toBe(false)
  })
})
