-- Unified contacts and auditable identity merge.
-- OAuth provider tokens are deliberately not stored in these tables.

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  normalized_phone text,
  normalized_email text,
  role_title text,
  source text not null default 'manual' check (source in ('manual','contract','google','apple','import')),
  contract_id uuid references public.contracts(id) on delete set null,
  is_customer boolean not null default false,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint contacts_phone_format check (normalized_phone is null or normalized_phone ~ '^09[0-9]{9}$'),
  constraint contacts_email_format check (normalized_email is null or normalized_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint contacts_has_reachable_identity check (normalized_phone is not null or normalized_email is not null)
);

create unique index if not exists contacts_studio_phone_unique
  on public.contacts (studio_id, normalized_phone)
  where normalized_phone is not null and deleted_at is null;
create unique index if not exists contacts_studio_email_unique
  on public.contacts (studio_id, lower(normalized_email))
  where normalized_email is not null and deleted_at is null;
create index if not exists contacts_studio_customer_idx
  on public.contacts (studio_id, is_customer, updated_at desc)
  where deleted_at is null;
create index if not exists contacts_contract_idx on public.contacts (contract_id)
  where contract_id is not null and deleted_at is null;

create table if not exists public.contact_identities (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  provider text not null check (provider in ('email','phone','google','apple','vcard')),
  provider_subject text not null,
  verified_email text,
  verified_phone text,
  provider_metadata jsonb not null default '{}'::jsonb,
  linked_at timestamptz not null default now(),
  linked_by uuid references auth.users(id) on delete set null,
  unique (studio_id, provider, provider_subject)
);
create index if not exists contact_identities_contact_idx on public.contact_identities (contact_id);

create table if not exists public.contact_merge_audit (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  kept_contact_id uuid not null references public.contacts(id),
  merged_contact_id uuid not null,
  match_basis text not null check (match_basis in ('verified_phone','verified_email','manual_review')),
  snapshot jsonb not null default '{}'::jsonb,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (kept_contact_id <> merged_contact_id)
);
create index if not exists contact_merge_audit_studio_time_idx
  on public.contact_merge_audit (studio_id, created_at desc);

alter table public.contacts enable row level security;
alter table public.contact_identities enable row level security;
alter table public.contact_merge_audit enable row level security;

drop policy if exists contacts_member_read on public.contacts;
create policy contacts_member_read on public.contacts for select to authenticated
  using (studio_id in (select public.user_studio_ids()));
drop policy if exists contacts_manager_write on public.contacts;
create policy contacts_manager_write on public.contacts for all to authenticated
  using (studio_id in (
    select studio_id from public.studio_members
    where user_id = (select auth.uid()) and status = 'active'
      and ('studio_manager' = any(roles) or 'coordinator' = any(roles))
  ))
  with check (studio_id in (
    select studio_id from public.studio_members
    where user_id = (select auth.uid()) and status = 'active'
      and ('studio_manager' = any(roles) or 'coordinator' = any(roles))
  ));

drop policy if exists contact_identities_member_read on public.contact_identities;
create policy contact_identities_member_read on public.contact_identities for select to authenticated
  using (studio_id in (select public.user_studio_ids()));
drop policy if exists contact_identities_manager_write on public.contact_identities;
create policy contact_identities_manager_write on public.contact_identities for all to authenticated
  using (studio_id in (
    select studio_id from public.studio_members
    where user_id = (select auth.uid()) and status = 'active'
      and ('studio_manager' = any(roles) or 'coordinator' = any(roles))
  ))
  with check (studio_id in (
    select studio_id from public.studio_members
    where user_id = (select auth.uid()) and status = 'active'
      and ('studio_manager' = any(roles) or 'coordinator' = any(roles))
  ));

drop policy if exists contact_merge_audit_member_read on public.contact_merge_audit;
create policy contact_merge_audit_member_read on public.contact_merge_audit for select to authenticated
  using (studio_id in (select public.user_studio_ids()));
drop policy if exists contact_merge_audit_manager_insert on public.contact_merge_audit;
create policy contact_merge_audit_manager_insert on public.contact_merge_audit for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and studio_id in (
      select studio_id from public.studio_members
      where user_id = (select auth.uid()) and status = 'active'
        and ('studio_manager' = any(roles) or 'coordinator' = any(roles))
    )
  );

revoke all on public.contacts, public.contact_identities, public.contact_merge_audit from anon;
grant select, insert, update, delete on public.contacts, public.contact_identities to authenticated;
grant select, insert on public.contact_merge_audit to authenticated;


