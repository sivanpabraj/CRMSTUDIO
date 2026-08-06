import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

describe('classic panel removal', () => {
  it('contains no classic source entry', () => {
    for (const path of ['admin.html', 'admin.js', 'admin.css', 'js/admin-core.js', 'js/admin-sections.js']) {
      expect(existsSync(path), path).toBe(false)
    }
  })

  it('ships only a generated compatibility redirect', () => {
    const copy = readFileSync('scripts/copy-static.mjs', 'utf8')
    const vite = readFileSync('vite.config.js', 'utf8')
    expect(copy).toContain('permanent Studio M redirect')
    expect(vite).not.toContain('VITE_ALLOW_CLASSIC')
  })
})
