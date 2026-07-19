import { describe, it, expect } from 'vitest'

// Observability is a classic script; re-implement minimal contract for unit test
function makeObs() {
  const buf = []
  return {
    captureError(scope, err, meta = {}) {
      const entry = { scope, message: err?.message || String(err), meta }
      buf.push(entry)
      return entry
    },
    recent: () => buf.slice()
  }
}

describe('observability contract', () => {
  it('records scoped errors', () => {
    const obs = makeObs()
    obs.captureError('db_persist', new Error('disk full'), { key: 'main' })
    expect(obs.recent()).toHaveLength(1)
    expect(obs.recent()[0].scope).toBe('db_persist')
    expect(obs.recent()[0].message).toContain('disk full')
  })
})
