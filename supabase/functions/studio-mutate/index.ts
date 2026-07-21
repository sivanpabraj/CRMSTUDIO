// Supabase Edge Function — authoritative studio mutations (finance-first stub)
// Deploy: supabase functions deploy studio-mutate
// This is the foundation for moving mutation authority off the browser.
// Client may continue using IndexedDB offline; when online, call this for money ops.

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

    const { data: memberships, error: memErr } = await supabase
      .from('studio_members')
      .select('studio_id, role, status')
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
    const studioId = String(body.studioId || memberships[0].studio_id)
    const member = memberships.find((m) => m.studio_id === studioId)
    if (!member) return json({ ok: false, error: 'studio access denied' }, 403, origin)

    if (!FINANCE_OPS.has(op)) {
      return json({ ok: false, error: `unsupported op: ${op}` }, 400, origin)
    }

    if (!idempotencyKey) {
      return json({ ok: false, error: 'idempotencyKey required' }, 400, origin)
    }

    // Idempotency: if a prior audit row exists, return it
    const { data: prior } = await supabase
      .from('studio_mutation_audit')
      .select('id, result, created_at')
      .eq('studio_id', studioId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (prior?.result) {
      return json({ ok: true, deduped: true, result: prior.result }, 200, origin)
    }

    // Stub authority path: accept payload, write audit row for reconciliation.
    // Full ledger tables can be wired in a follow-up migration.
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {}
    const result = {
      op,
      studioId,
      acceptedAt: new Date().toISOString(),
      payload,
      status: 'accepted_pending_ledger',
      note: 'Edge stub — deploy migration for studio_mutation_audit + ledger tables to activate server SoR',
    }

    const { error: auditErr } = await supabase.from('studio_mutation_audit').insert({
      studio_id: studioId,
      user_id: user.id,
      op,
      idempotency_key: idempotencyKey,
      payload,
      result,
    })

    // Table may not exist yet — still return accepted so clients can feature-detect
    if (auditErr) {
      return json({
        ok: true,
        stub: true,
        warning: auditErr.message,
        result,
      }, 200, origin)
    }

    return json({ ok: true, result }, 200, origin)
  } catch (e) {
    return json({ ok: false, error: e?.message || 'server error' }, 500, origin)
  }
})
