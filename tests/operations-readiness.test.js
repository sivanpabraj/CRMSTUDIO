import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('operations readiness', () => {
  it('checks immutable journal balance without exporting customer data', () => {
    const sql = readFileSync('scripts/ops-integrity.sql', 'utf8')
    const workflow = readFileSync('.github/workflows/ops-check.yml', 'utf8')
    expect(sql).toContain('sum(debit_irr) <> sum(credit_irr)')
    expect(workflow).toContain('SUPABASE_DB_URL')
    expect(workflow).toContain('DEPLOYMENT_APP_URL')
    expect(workflow).toContain('deployment-security-smoke.mjs')
    expect(workflow).not.toContain('pg_dump')
  })

  it('publishes a non-cached edge health endpoint', () => {
    const health = readFileSync('supabase/functions/health/index.ts', 'utf8')
    expect(health).toContain("'Cache-Control': 'no-store'")
    expect(health).not.toContain('service_role')
  })
})
