-- Thin authoritative ledger accept table for studio-mutate (SaaS SoR foundation).
-- Apply after 007_studio_mutation_audit.sql.

create table if not exists public.studio_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  audit_id uuid references public.studio_mutation_audit(id) on delete set null,
  op text not null,
  idempotency_key text not null,
  amount numeric,
  currency text not null default 'IRR',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'accepted'
    check (status in ('accepted', 'rejected', 'pending', 'superseded')),
  created_at timestamptz not null default now(),
  unique (studio_id, idempotency_key)
);

alter table public.studio_ledger_entries enable row level security;

create policy studio_ledger_entries_member_read on public.studio_ledger_entries
  for select using (
    studio_id in (select unnest(public.user_studio_ids()))
  );

create policy studio_ledger_entries_member_insert on public.studio_ledger_entries
  for insert with check (
    studio_id in (select unnest(public.user_studio_ids()))
    and user_id = auth.uid()
  );

create index if not exists studio_ledger_entries_studio_created
  on public.studio_ledger_entries (studio_id, created_at desc);

create index if not exists studio_ledger_entries_studio_op
  on public.studio_ledger_entries (studio_id, op, created_at desc);

comment on table public.studio_ledger_entries is
  'Minimal SaaS finance accept log — Edge studio-mutate writes here; browser IDB is cache until full double-entry.';
