-- Cover contact audit foreign keys and avoid duplicate permissive SELECT
-- policies created by FOR ALL write policies.

create index if not exists contacts_created_by_idx
  on public.contacts (created_by)
  where created_by is not null;
create index if not exists contact_identities_linked_by_idx
  on public.contact_identities (linked_by)
  where linked_by is not null;
create index if not exists contact_merge_audit_actor_idx
  on public.contact_merge_audit (actor_id);
create index if not exists contact_merge_audit_kept_contact_idx
  on public.contact_merge_audit (kept_contact_id);

-- Repeated explicitly so the policy remains self-contained and does not rely
-- on extending the unrelated SMS/finance permission function.

drop policy if exists contacts_manager_write on public.contacts;
create policy contacts_manager_insert on public.contacts for insert to authenticated
  with check (exists (
    select 1 from public.studio_members m where m.studio_id = contacts.studio_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and m.roles && array['owner', 'system_admin', 'studio_manager', 'coordinator']::text[]
  ));
create policy contacts_manager_update on public.contacts for update to authenticated
  using (exists (
    select 1 from public.studio_members m where m.studio_id = contacts.studio_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and m.roles && array['owner', 'system_admin', 'studio_manager', 'coordinator']::text[]
  ))
  with check (exists (
    select 1 from public.studio_members m where m.studio_id = contacts.studio_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and m.roles && array['owner', 'system_admin', 'studio_manager', 'coordinator']::text[]
  ));
create policy contacts_manager_delete on public.contacts for delete to authenticated
  using (exists (
    select 1 from public.studio_members m where m.studio_id = contacts.studio_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and m.roles && array['owner', 'system_admin', 'studio_manager', 'coordinator']::text[]
  ));

drop policy if exists contact_identities_manager_write on public.contact_identities;
create policy contact_identities_manager_insert on public.contact_identities for insert to authenticated
  with check (exists (
    select 1 from public.studio_members m where m.studio_id = contact_identities.studio_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and m.roles && array['owner', 'system_admin', 'studio_manager', 'coordinator']::text[]
  ));
create policy contact_identities_manager_update on public.contact_identities for update to authenticated
  using (exists (
    select 1 from public.studio_members m where m.studio_id = contact_identities.studio_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and m.roles && array['owner', 'system_admin', 'studio_manager', 'coordinator']::text[]
  ))
  with check (exists (
    select 1 from public.studio_members m where m.studio_id = contact_identities.studio_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and m.roles && array['owner', 'system_admin', 'studio_manager', 'coordinator']::text[]
  ));
create policy contact_identities_manager_delete on public.contact_identities for delete to authenticated
  using (exists (
    select 1 from public.studio_members m where m.studio_id = contact_identities.studio_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and m.roles && array['owner', 'system_admin', 'studio_manager', 'coordinator']::text[]
  ));


