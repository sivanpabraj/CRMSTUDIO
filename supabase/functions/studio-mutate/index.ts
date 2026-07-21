// Supabase Edge Function — authoritative studio finance mutations (SaaS)
// Deploy: supabase functions deploy studio-mutate
// Requires migrations 007 (audit) + 008 (ledger entries).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || '',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  Vary: 'Origin',
})

function allowedOrigin(req: Request): string | null {
  const reqOrigin = req.headers.get('Origin')
  const allowList = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!reqOrigin) return allowList[0] || null
  if (allowList.length === 0) return reqOrigin
  return allowList.includes(reqOrigin) ? reqOrigin : null
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

const FINANCE_OPS = new Set([
  'record_deposit',
  'record_withdrawal',
  'transfer_banks',
  'delete_transaction',
  'update_transaction',
])

type Membership = {
  studio_id: string
  roles?: string[] | null
  role?: string | null
  status: string
}

function memberRoles(m: Membership): string[] {
  if (Array.isArray(m.roles) && m.roles.length) return m.roles.map(String)
  if (m.role) return [String(m.role)]
  return []
}

Deno.serve(async (req) => {
  const origin = allowedOrigin(req)
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    if (!origin) return new Response('forbidden', { status: 403 })
    return new Response('ok', { headers })
  }

  try {
    if (!origin && (Deno.env.get('ALLOWED_ORIGINS') || '').trim()) {
      return json({ ok: false, error: 'origin not allowed' }, 403, origin)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ ok: false, error: 'unauthorized' }, 401, origin)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()
    if (userErr || !user) return json({ ok: false, error: 'not authenticated' }, 401, origin)

    // Schema uses roles text[]; never select non-existent `role` column.
    const { data: memberships, error: memErr } = await supabase
      .from('studio_members')
      .select('studio_id, roles, status')
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (memErr || !memberships?.length) {
      return json({ ok: false, error: 'not a studio member' }, 403, origin)
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return json({ ok: false, error: 'invalid body' }, 400, origin)
    }

    const op = String(body.op || '')
    const idempotencyKey = String(body.idempotencyKey || '').slice(0, 128)
    const studioId = String(body.studioId || '')
    if (!studioId) {
      return json({ ok: false, error: 'studioId required' }, 400, origin)
    }

    const member = (memberships as Membership[]).find((m) => m.studio_id === studioId)
    if (!member) return json({ ok: false, error: 'studio access denied' }, 403, origin)

    // Spoofing guard: studioId must be an active membership (checked above).
    const roles = memberRoles(member)
    if (!roles.length) {
      return json({ ok: false, error: 'member has no roles' }, 403, origin)
    }

    if (!FINANCE_OPS.has(op)) {
      return json({ ok: false, error: `unsupported op: ${op}` }, 400, origin)
    }

    if (!idempotencyKey) {
      return json({ ok: false, error: 'idempotencyKey required' }, 400, origin)
    }

    // Idempotency: prefer ledger row, then audit
    const { data: priorLedger } = await supabase
      .from('studio_ledger_entries')
      .select('id, status, payload, created_at')
      .eq('studio_id', studioId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (priorLedger) {
      return json({
        ok: true,
        deduped: true,
        result: {
          op,
          studioId,
          status: priorLedger.status || 'accepted',
          ledgerId: priorLedger.id,
          acceptedAt: priorLedger.created_at,
        },
      }, 200, origin)
    }

    const { data: priorAudit } = await supabase
      .from('studio_mutation_audit')
      .select('id, result, created_at')
      .eq('studio_id', studioId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (priorAudit?.result) {
      return json({ ok: true, deduped: true, result: priorAudit.result }, 200, origin)
    }

    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {}
    const amountRaw = (payload as Record<string, unknown>).amount
    const amount = typeof amountRaw === 'number' ? amountRaw : Number(amountRaw) || null
    const expectedVersion = body.expectedVersion == null || body.expectedVersion === ''
      ? null
      : Number(body.expectedVersion)

    // Sequential ledger version (migration 009). Skip conflict check when client sends null
    // (first sync / unknown); still bump when RPC available.
    let ledgerVersion: number | null = null
    {
      const { data: ver, error: verErr } = await supabase.rpc('claim_ledger_version', {
        p_studio_id: studioId,
        p_expected_version: Number.isFinite(expectedVersion as number) ? expectedVersion : null,
      })
      if (verErr) {
        const msg = verErr.message || ''
        if (/ledger_conflict/i.test(msg)) {
          const parts = msg.split(':')
          return json({
            ok: false,
            error: 'ledger conflict — refresh and retry',
            reason: 'ledger_conflict',
            serverVersion: parts[1] ? Number(parts[1]) : null,
            clientVersion: parts[2] ? Number(parts[2]) : expectedVersion,
          }, 409, origin)
        }
        if (!/function|does not exist|schema cache/i.test(msg)) {
          return json({ ok: false, error: msg || 'ledger version claim failed' }, 500, origin)
        }
        // 009 not deployed yet — continue without versioning
      } else {
        ledgerVersion = typeof ver === 'number' ? ver : Number(ver)
      }
    }

    const result = {
      op,
      studioId,
      acceptedAt: new Date().toISOString(),
      payload,
      status: 'accepted',
      roles,
      ledgerVersion,
      note: 'Edge accept — studio_ledger_entries is SaaS finance SoR foundation',
    }

    const { data: auditRow, error: auditErr } = await supabase
      .from('studio_mutation_audit')
      .insert({
        studio_id: studioId,
        user_id: user.id,
        op,
        idempotency_key: idempotencyKey,
        payload,
        result,
      })
      .select('id')
      .maybeSingle()

    if (auditErr) {
      // Unique violation → concurrent duplicate
      if (/duplicate|unique/i.test(auditErr.message || '')) {
        return json({ ok: true, deduped: true, result }, 200, origin)
      }
      return json({
        ok: false,
        error: auditErr.message || 'audit write failed',
        reason: 'audit_failed',
      }, 500, origin)
    }

    const { data: ledgerRow, error: ledgerErr } = await supabase
      .from('studio_ledger_entries')
      .insert({
        studio_id: studioId,
        user_id: user.id,
        audit_id: auditRow?.id || null,
        op,
        idempotency_key: idempotencyKey,
        amount,
        payload,
        status: 'accepted',
        ledger_version: ledgerVersion,
      })
      .select('id')
      .maybeSingle()

    if (ledgerErr) {
      if (/duplicate|unique/i.test(ledgerErr.message || '')) {
        return json({
          ok: true,
          deduped: true,
          result: { ...result, ledgerPending: false },
        }, 200, origin)
      }
      // Audit succeeded but ledger missing — still accept with warning (008 may not be applied)
      return json({
        ok: true,
        warning: ledgerErr.message,
        result: {
          ...result,
          status: 'accepted_audit_only',
          auditId: auditRow?.id || null,
          note: 'Deploy migration 008_studio_ledger_entries for full SaaS ledger SoR',
        },
      }, 200, origin)
    }

    return json({
      ok: true,
      result: {
        ...result,
        auditId: auditRow?.id || null,
        ledgerId: ledgerRow?.id || null,
      },
    }, 200, origin)
  } catch (e) {
    return json({ ok: false, error: e?.message || 'server error' }, 500, origin)
  }
})
