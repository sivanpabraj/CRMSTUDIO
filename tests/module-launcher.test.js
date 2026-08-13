import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const source = fs.readFileSync('studio-m/js/module-launcher.js', 'utf8')
const css = fs.readFileSync('studio-m/css/module-launcher.css', 'utf8')
const html = fs.readFileSync('studio-m/index.html', 'utf8')

describe('STE100 module launcher', () => {
  it('uses permission-filtered routes instead of duplicated static navigation', () => {
    expect(source).toContain('visibleRoutes()')
    expect(source).toContain('route.group')
    expect(source).toContain('SM.navigate(route)')
  })

  it('supports search, shortcut and complete keyboard behavior', () => {
    expect(source).toContain("event.key.toLowerCase() === 'k'")
    expect(source).toContain("event.key === 'Escape'")
    expect(source).toContain("'ArrowDown', 'ArrowUp'")
    expect(source).toContain("event.key === 'Tab'")
  })

  it('exposes correct dialog and trigger semantics', () => {
    expect(source).toContain('aria-haspopup')
    expect(source).toContain('aria-expanded')
    expect(source).toContain('role="dialog"')
    expect(source).toContain('aria-modal="true"')
  })

  it('is RTL-safe, responsive and motion-aware', () => {
    expect(css).toContain('inset-inline-start')
    expect(css).toContain('@media (max-width: 540px)')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).not.toMatch(/(^|[;{]\s*)left\s*:/m)
  })

  it('loads before application bootstrap', () => {
    expect(html).toContain('css/module-launcher.css')
    expect(html).toContain('js/module-launcher.js')
    expect(html.indexOf('js/module-launcher.js')).toBeLessThan(html.indexOf('js/app.js'))
  })
})
