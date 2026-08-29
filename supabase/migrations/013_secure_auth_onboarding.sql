-- Atomic, idempotent studio onboarding for authenticated Supabase users.
-- Auth user creation remains the responsibility of Supabase Auth; this RPC
-- creates the tenant and owner membership in one short transaction.

create index if not exists idx_studio_members_user_status_created
  on public.studio_members (user_id, status, created_at);

create or replace function public.register_studio(
  p_studio_name text,
  p_phone text,
  p_display_name text default '',
  p_join_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_studio_id uuid;
  v_name text := nullif(trim(coalesce(p_studio_name, '')), '');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_display_name text := nullif(trim(coalesce(p_display_name, '')), '');
  v_code text;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if nullif(trim(coalesce(p_join_code, '')), '') is not null then raise exception 'use_secure_invitation'; end if;
  if v_name is null or char_length(v_name) > 120 then raise exception 'invalid_studio_name'; end if;
  if v_display_name is null or char_length(v_display_name) > 120 then raise exception 'invalid_display_name'; end if;
  if v_phone !~ '^\+?[0-9]{10,15}$' then raise exception 'invalid_phone'; end if;

  -- Serialize concurrent onboarding attempts for the same authenticated user.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select member.studio_id into v_studio_id
  from public.studio_members as member
  where member.user_id = v_user_id and member.status = 'active'
  order by member.created_at asc
  limit 1;
  if v_studio_id is not null then return v_studio_id; end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.studios (name, join_code, slug)
  values (
    v_name,
    v_code,
    lower(regexp_replace(v_name, '\s+', '-', 'g')) || '-' || substr(v_code, 1, 6)
  )
  returning id into v_studio_id;

  insert into public.studio_members (studio_id, user_id, phone, display_name, roles, status)
  values (v_studio_id, v_user_id, v_phone, v_display_name, array['studio_manager'], 'active');

  insert into public.studio_snapshots (studio_id, data, updated_by)
  values (v_studio_id, '{}'::jsonb, v_user_id)
  on conflict (studio_id) do nothing;

  return v_studio_id;
end;
$$;

revoke all on function public.register_studio(text, text, text, text) from public, anon;
grant execute on function public.register_studio(text, text, text, text) to authenticated;


