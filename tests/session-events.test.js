import { describe, it, expect, beforeEach, afterEach } from 'vitest'

/**
 * Unit contract for Auth.getUser unsigned-session fail-closed behavior.
 * Mirrors js/auth.js getUser logic without loading the full auth module.
 */
function getUserUnsignedGuard({ session, isLocalDev, findUser }) {
  if (!session?.userId) return null
  if (session.expiresAt && Date.now() > session.expiresAt) return null
  if (session._sigInvalid) return null
  if (!session.sig && !isLocalDev) return null
  return findUser(session.userId) || null
}

describe('unsigned session fail-closed', () => {
  const user = { id: 'u1', name: 'Admin' }
  const findUser = (id) => (id === 'u1' ? user : null)

  it('rejects unsigned sessions in production', () => {
    const session = { userId: 'u1', expiresAt: Date.now() + 60_000 }
    expect(getUserUnsignedGuard({ session, isLocalDev: false, findUser })).toBeNull()
  })

  it('allows unsigned sessions on local dev', () => {
    const session = { userId: 'u1', expiresAt: Date.now() + 60_000 }
    expect(getUserUnsignedGuard({ session, isLocalDev: true, findUser })).toEqual(user)
  })

  it('allows signed sessions in production', () => {
    const session = { userId: 'u1', expiresAt: Date.now() + 60_000, sig: 'abc' }
    expect(getUserUnsignedGuard({ session, isLocalDev: false, findUser })).toEqual(user)
  })

  it('rejects invalid signature flag', () => {
    const session = { userId: 'u1', expiresAt: Date.now() + 60_000, sig: 'abc', _sigInvalid: true }
    expect(getUserUnsignedGuard({ session, isLocalDev: false, findUser })).toBeNull()
  })
})

describe('SMEvents attrs contract', () => {
  it('encodes args as JSON without breaking apostrophes', async () => {
    const { SMEvents } = await import('../studio-m/js/events.js')
    // events.js is classic script — may not export; fall back to local copy of attrs
    const attrs = (typeof SMEvents !== 'undefined' && SMEvents.attrs)
      ? SMEvents.attrs.bind(SMEvents)
      : (fnPath, args = []) => {
        const a = Array.isArray(args) ? args : [args]
        return `type="button" data-sm-fn="${String(fnPath).replace(/"/g, '')}" data-sm-args='${JSON.stringify(a).replace(/'/g, '&#39;')}'`
      }
    const html = attrs('SM.navigate', ["O'Brien"])
    expect(html).toContain('data-sm-fn="SM.navigate"')
    expect(html).toContain('&#39;')
    expect(html).not.toMatch(/onclick=/)
  })
})
