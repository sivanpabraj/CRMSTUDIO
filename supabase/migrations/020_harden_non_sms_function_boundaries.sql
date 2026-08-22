-- Remove writable schemas from elevated function lookup paths.
-- All relations referenced by these routines are explicitly schema-qualified.

alter function public.user_studio_ids()
  set search_path = '';

alter function public.upsert_studio_snapshot(uuid, jsonb, integer, text)
  set search_path = '';

alter function public.upsert_studio_entities(uuid, text, jsonb)
  set search_path = '';

alter function public.log_studio_entity_change()
  set search_path = '';

alter function public.post_finance_command(uuid, text, text, jsonb)
  set search_path = '';

-- Invitation routines use pgcrypto functions installed in Supabase's trusted
-- extensions schema. Public tables and auth helpers are schema-qualified.
alter function public.create_studio_invitation(uuid, text[], integer, integer)
  set search_path = pg_catalog, extensions;

alter function public.request_studio_join(text, text, text)
  set search_path = pg_catalog, extensions;

alter function public.review_studio_join(uuid, boolean)
  set search_path = pg_catalog, extensions;

-- Trigger functions are invoked by PostgreSQL itself and do not need to be
-- directly callable through PostgREST.
revoke execute on function public.log_studio_entity_change()
  from public, anon, authenticated;

-- Preserve the explicit API allowlist and deny anonymous invocation.
revoke execute on function public.user_studio_ids()
  from public, anon;
revoke execute on function public.upsert_studio_snapshot(uuid, jsonb, integer, text)
  from public, anon;
revoke execute on function public.upsert_studio_entities(uuid, text, jsonb)
  from public, anon;
revoke execute on function public.post_finance_command(uuid, text, text, jsonb)
  from public, anon;
revoke execute on function public.create_studio_invitation(uuid, text[], integer, integer)
  from public, anon;
revoke execute on function public.request_studio_join(text, text, text)
  from public, anon;
revoke execute on function public.review_studio_join(uuid, boolean)
  from public, anon;

grant execute on function public.user_studio_ids()
  to authenticated;
grant execute on function public.upsert_studio_snapshot(uuid, jsonb, integer, text)
  to authenticated;
grant execute on function public.upsert_studio_entities(uuid, text, jsonb)
  to authenticated;
grant execute on function public.post_finance_command(uuid, text, text, jsonb)
  to authenticated;
grant execute on function public.create_studio_invitation(uuid, text[], integer, integer)
  to authenticated;
grant execute on function public.request_studio_join(text, text, text)
  to authenticated;
grant execute on function public.review_studio_join(uuid, boolean)
  to authenticated;


