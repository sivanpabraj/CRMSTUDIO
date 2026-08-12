/**
 * Guard: Pro UI must not use document.write (prefer DOM APIs).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../studio-m/js')

describe('studio-m document.write ban', () => {
  it('has zero document.write in Pro JS sources', () => {
    const offenders = []
    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(dir, name), 'utf8')
      if (/document\.write\s*\(/.test(src)) offenders.push(name)
    }
    expect(offenders).toEqual([])
  })
})
