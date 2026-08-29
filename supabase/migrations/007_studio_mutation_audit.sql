-- Optional audit table for studio-mutate Edge Function
-- Run in Supabase SQL editor after deploying the function.

create table if not exists public.studio_mutation_audit (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  op text not null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  unique (studio_id, idempotency_key)
);

alter table public.studio_mutation_audit enable row level security;

create policy studio_mutation_audit_member_read on public.studio_mutation_audit
  for select using (
    studio_id in (select public.user_studio_ids())
  );

create policy studio_mutation_audit_member_insert on public.studio_mutation_audit
  for insert with check (
    studio_id in (select public.user_studio_ids())
    and user_id = auth.uid()
  );

create index if not exists studio_mutation_audit_studio_created
  on public.studio_mutation_audit (studio_id, created_at desc);
