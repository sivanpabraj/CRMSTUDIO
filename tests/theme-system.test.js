import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const source = fs.readFileSync('studio-m/js/theme-system.js', 'utf8')
const css = fs.readFileSync('studio-m/css/dark-glass-theme.css', 'utf8')
const html = fs.readFileSync('studio-m/index.html', 'utf8')

describe('STE100 theme system', () => {
  it('supports light, dark and dark-glass modes with validated persistence', () => {
    expect(source).toContain("id: 'light'")
    expect(source).toContain("id: 'dark'")
    expect(source).toContain("id: 'dark-glass'")
    expect(source).toContain("localStorage.setItem(STORAGE_KEY")
    expect(source).toContain('validTheme')
  })

  it('includes accessible picker and sidebar state', () => {
    expect(source).toContain('role="dialog"')
    expect(source).toContain('role="radiogroup"')
    expect(source).toContain("aria-current")
    expect(source).toContain("aria-expanded")
    expect(source).toContain("event.key === 'Escape'")
  })

  it('provides RTL-safe responsive glass styling and fallbacks', () => {
    expect(css).toContain('margin-inline-start')
    expect(css).toContain('@supports not')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain(':focus-visible')
    expect(css).toContain('@media (max-width: 640px)')
  })

  it('loads theme assets before the application bootstrap', () => {
    expect(html).toContain('css/dark-glass-theme.css')
    expect(html).toContain('js/theme-system.js')
    expect(html.indexOf('js/theme-system.js')).toBeLessThan(html.indexOf('js/app.js'))
  })
})
