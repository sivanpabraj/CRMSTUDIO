import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/migrations/023_customer_portal_secure_messaging.sql', 'utf8')
const hardening = readFileSync('supabase/migrations/024_customer_portal_advisor_hardening.sql', 'utf8')

describe('customer portal cloud security', () => {
  it('binds access from the authenticated verified phone only', () => {
    expect(sql).toContain('from auth.users u where u.id = v_user_id')
    expect(sql).toContain("raise exception 'verified_phone_required'")
    expect(sql).toContain('a.user_id = (select auth.uid())')
    expect(sql).toContain('revoke execute on function public.claim_customer_contracts() from public, anon')
  })

  it('keeps messages append-only and hidden from anonymous users', () => {
    expect(sql).toContain('alter table public.customer_portal_messages enable row level security')
    expect(sql).toContain('grant select, insert on public.customer_portal_messages to authenticated')
    expect(sql).toContain('revoke all on public.customer_portal_access, public.customer_portal_messages from anon')
    expect(sql).not.toMatch(/grant\s+(update|delete).*customer_portal_messages/i)
  })

  it('authorizes private attachments by contract and message reference', () => {
    expect(sql).toContain("(storage.foldername(name))[2] = 'customer'")
    expect(sql).toContain('a.contract_id::text = (storage.foldername(name))[3]')
    expect(sql).toContain('m.attachment_path = storage.objects.name')
    expect(sql).toContain('owner_id = (select auth.uid())::text')
    expect(sql).not.toContain('create policy public')
  })

  it('covers foreign keys and avoids parallel permissive contract policies', () => {
    expect(hardening).toContain('customer_portal_access (studio_id)')
    expect(hardening).toContain('customer_portal_messages (sender_id)')
    expect(hardening).toContain('drop policy if exists contracts_select_member')
    expect(hardening).toContain('create policy contracts_read_authorized')
  })
})
