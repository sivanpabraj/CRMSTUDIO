import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/010_authoritative_finance_and_permissions.sql', 'utf8')
const edge = readFileSync('supabase/functions/studio-mutate/index.ts', 'utf8')
const finance = readFileSync('js/finance-sync.js', 'utf8')

describe('authoritative finance boundary', () => {
  it('posts through one atomic database command', () => {
    expect(migration).toContain('post_finance_command')
    expect(migration).toContain('finance_journal_lines')
    expect(edge).toContain("supabase.rpc('post_finance_command'")
    expect(edge).not.toContain(".from('studio_ledger_entries').insert")
  })

  it('does not commit money locally when server confirmation is queueable', () => {
    const block = finance.slice(finance.indexOf('if (res.queueable)'), finance.indexOf('if (res.queueable)') + 420)
    expect(block).toContain('ok: false')
    expect(block).not.toContain('queueOutbox: true')
  })

  it('removes direct authenticated writes to authoritative ledgers', () => {
    expect(migration).toContain('revoke insert, update, delete on public.studio_mutation_audit')
    expect(migration).toContain('revoke insert, update, delete on public.studio_ledger_entries')
  })
})
