/**
 * Guard: Pro UI must not use inline event handlers (CSP path to drop unsafe-inline).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../studio-m/js')

describe('studio-m inline handler ban', () => {
  it('has zero onclick/oninput/onchange in Pro JS sources', () => {
    const offenders = []
    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(dir, name), 'utf8')
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        if (/\bonclick\s*=|\boninput\s*=|\bonchange\s*=/.test(line)) {
          offenders.push(`${name}:${i + 1}: ${line.trim().slice(0, 120)}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})
