/**
 * Static guard: transaction inserts and bank-balance ledger writes must live in FinanceSync.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const TX_INSERT_ALLOWED = new Set(['js/finance-sync.js'])
const BANK_BALANCE_ALLOWED = new Set(['js/finance-sync.js'])
const GENERATED_OR_EXTERNAL = new Set([
  '.git', 'artifacts', 'coverage', 'dist', 'node_modules', 'test-results'
])

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (GENERATED_OR_EXTERNAL.has(name)) continue
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(js|html)$/.test(name)) out.push(p)
  }
  return out
}

describe('finance writer allowlist', () => {
  it('forbids SecureDB.insert(transactions) outside FinanceSync', () => {
    const offenders = []
    const re = /SecureDB\.insert\(\s*['"]transactions['"]/g
    for (const file of walk(root)) {
      const rel = path.relative(root, file).replace(/\\/g, '/')
      if (TX_INSERT_ALLOWED.has(rel) || rel.startsWith('tests/')) continue
      if (re.test(fs.readFileSync(file, 'utf8'))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it('forbids SecureDB.update(banks, … { balance }) outside FinanceSync', () => {
    const offenders = []
    // Same-call object literal only (avoids false positives from nearby insert)
    const re = /SecureDB\.update\(\s*['"]banks['"]\s*,\s*[^,)]+\s*,\s*\{[^}]*\bbalance\s*:/g
    for (const file of walk(root)) {
      const rel = path.relative(root, file).replace(/\\/g, '/')
      if (BANK_BALANCE_ALLOWED.has(rel) || rel.startsWith('tests/')) continue
      const src = fs.readFileSync(file, 'utf8')
      if (re.test(src)) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})
