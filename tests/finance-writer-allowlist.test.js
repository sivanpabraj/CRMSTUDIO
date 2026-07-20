/**
 * Static guard: transaction inserts must live in FinanceSync (or documented allowlist).
 * Prevents regression of dual finance writers.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const ALLOWED = new Set([
  'js/finance-sync.js'
])

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'test-results' || name === '.git') continue
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(js|html)$/.test(name)) out.push(p)
  }
  return out
}

describe('finance writer allowlist', () => {
  it('forbids SecureDB.insert(transactions) outside FinanceSync', () => {
    const files = walk(root)
    const offenders = []
    const re = /SecureDB\.insert\(\s*['"]transactions['"]/g
    for (const file of files) {
      const rel = path.relative(root, file).replace(/\\/g, '/')
      if (ALLOWED.has(rel)) continue
      if (rel.startsWith('tests/')) continue
      const src = fs.readFileSync(file, 'utf8')
      if (re.test(src)) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})
