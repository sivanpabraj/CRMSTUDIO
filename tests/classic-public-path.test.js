import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('classic admin public path retirement', () => {
  it('admin.html early gate ignores legacy sm_allow_classic flag', () => {
    const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8')
    const gate = html.slice(0, html.indexOf('</script>'))
    expect(gate).toMatch(/sm_classic_unlock/)
    expect(gate).not.toMatch(/sm_allow_classic/)
  })

  it('portal-mgmt does not deep-link classic for operators', () => {
    const src = fs.readFileSync(path.join(root, 'studio-m/js/portal-mgmt.js'), 'utf8')
    expect(src).not.toMatch(/admin\.html\?classic=1/)
  })

  it('page-nav no longer exposes adminClassic public entry', () => {
    const src = fs.readFileSync(path.join(root, 'js/page-nav.js'), 'utf8')
    expect(src).not.toMatch(/adminClassic\s*:/)
  })
})
