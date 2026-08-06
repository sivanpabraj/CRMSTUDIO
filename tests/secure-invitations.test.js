import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/migrations/011_secure_invitations_and_member_rls.sql', 'utf8')

describe('secure membership lifecycle', () => {
  it('uses hashed expiring invitations and manager review', () => {
    expect(sql).toContain("digest(v_token, 'sha256')")
    expect(sql).toContain('expires_at > now()')
    expect(sql).toContain('review_studio_join')
    expect(sql).toContain("status = 'pending'")
  })

  it('retires direct join-code enrollment', () => {
    expect(sql).toContain('use_request_studio_join')
    expect(sql).toContain('revoke insert, update, delete on public.studio_members')
  })
})
