import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

describe('Studio M initial transfer budget', () => {
  it('keeps the statically requested JavaScript at or below 100 KiB gzip', () => {
    const html = readFileSync('studio-m/index.html', 'utf8')
    const sources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1])
    const gzipBytes = sources.reduce((total, source) => {
      const file = resolve('studio-m', source)
      return existsSync(file) ? total + gzipSync(readFileSync(file)).length : total
    }, 0)
    expect(gzipBytes).toBeLessThanOrEqual(100 * 1024)
  })
})
