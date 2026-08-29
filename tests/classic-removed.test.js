import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'

describe('classic panel removal', () => {
  it('contains no classic source entry', () => {
    for (const path of ['admin.html', 'admin.js', 'admin.css', 'js/admin-core.js', 'js/admin-sections.js']) {
      expect(existsSync(path), path).toBe(false)
    }
  })
})
