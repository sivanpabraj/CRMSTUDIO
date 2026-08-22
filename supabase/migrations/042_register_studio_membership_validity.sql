-- Fail-closed tenant onboarding. Existing membership history must never be
-- bypassed by creating another studio after revocation or expiry.

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
  v_active_count integer;
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

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select count(*)
    into v_active_count
  from public.studio_members as member
  where member.user_id = v_user_id
    and member.status = 'active'
    and member.revoked_at is null
    and member.valid_from <= now()
    and (member.valid_until is null or member.valid_until > now());

  if v_active_count > 1 then raise exception 'tenant_selection_required'; end if;
  if v_active_count = 1 then
    select member.studio_id into v_studio_id
    from public.studio_members as member
    where member.user_id = v_user_id
      and member.status = 'active'
      and member.revoked_at is null
      and member.valid_from <= now()
      and (member.valid_until is null or member.valid_until > now());
    return v_studio_id;
  end if;

  -- A user with membership history must use the review/reactivation workflow.
  -- Silently creating a new tenant would bypass an explicit revocation/expiry.
  if exists (
    select 1 from public.studio_members as member where member.user_id = v_user_id
  ) then
    raise exception 'membership_not_active';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.studios (name, join_code, slug)
  values (
    v_name,
    v_code,
    lower(regexp_replace(v_name, '\s+', '-', 'g')) || '-' || substr(v_code, 1, 6)
  )
  returning id into v_studio_id;

  insert into public.studio_members
    (studio_id, user_id, phone, display_name, roles, status, valid_from, valid_until, revoked_at)
  values
    (v_studio_id, v_user_id, v_phone, v_display_name, array['studio_manager'], 'active', now(), null, null);

  insert into public.studio_snapshots (studio_id, data, updated_by)
  values (v_studio_id, '{}'::jsonb, v_user_id)
  on conflict (studio_id) do nothing;

  return v_studio_id;
end;
$$;

revoke all on function public.register_studio(text, text, text, text) from public, anon;
grant execute on function public.register_studio(text, text, text, text) to authenticated;
