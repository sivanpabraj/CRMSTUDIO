import { describe, it, expect } from 'vitest'
import { SMObservability } from '../js/lib/observability.js'

describe('SMObservability', () => {
  it('records scoped errors without requiring DB', () => {
    const before = SMObservability.recent().length
    SMObservability.captureError('unit_test', new Error('boom'), { noDbLog: true })
    const recent = SMObservability.recent()
    expect(recent.length).toBeGreaterThan(before)
    expect(recent.at(-1).scope).toBe('unit_test')
    expect(recent.at(-1).message).toContain('boom')
  })

  it('redacts secrets from metadata', () => {
    SMObservability.captureEvent('secret_test', {
      password: 'do-not-log',
      nested: { authorization: 'Bearer abc.def.ghi' }
    })
    const entry = SMObservability.recent().at(-1)
    expect(entry.meta.password).toBe('[redacted]')
    expect(entry.meta.nested.authorization).toBe('[redacted]')
  })
})
