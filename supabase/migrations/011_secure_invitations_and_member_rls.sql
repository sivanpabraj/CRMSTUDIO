-- Secure, expiring invitations and manager-approved membership.

create table if not exists public.studio_invitations (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  token_hash text not null unique,
  roles text[] not null default '{office_secretary}',
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  max_uses integer not null default 1 check (max_uses between 1 and 20),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.studio_join_requests (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  invitation_id uuid not null references public.studio_invitations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  phone text,
  requested_roles text[] not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (studio_id, user_id)
);

create index if not exists studio_invitations_studio_expires
  on public.studio_invitations (studio_id, expires_at);
create index if not exists studio_join_requests_studio_status
  on public.studio_join_requests (studio_id, status, created_at);

alter table public.studio_invitations enable row level security;
alter table public.studio_join_requests enable row level security;

create policy studio_invitations_manager_read on public.studio_invitations for select
  using (public.has_studio_permission(studio_id, 'members.manage'));
create policy studio_join_requests_manager_read on public.studio_join_requests for select
  using (
    user_id = auth.uid()
    or public.has_studio_permission(studio_id, 'members.manage')
  );

revoke all on public.studio_invitations from authenticated;
revoke all on public.studio_join_requests from authenticated;
grant select on public.studio_invitations to authenticated;
grant select on public.studio_join_requests to authenticated;

drop policy if exists "members_select_same_studio" on public.studio_members;
drop policy if exists "members_insert_manager" on public.studio_members;
drop policy if exists "members_update_manager" on public.studio_members;

create policy members_select_self_or_manager on public.studio_members for select
  using (
    user_id = auth.uid()
    or public.has_studio_permission(studio_id, 'members.manage')
  );

revoke insert, update, delete on public.studio_members from authenticated;

create or replace function public.create_studio_invitation(
  p_studio_id uuid,
  p_roles text[] default array['office_secretary'],
  p_expires_in_minutes integer default 1440,
  p_max_uses integer default 1
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_roles text[] := coalesce(p_roles, array['office_secretary']);
begin
  if not public.has_studio_permission(p_studio_id, 'members.manage') then
    raise exception 'members_manage_permission_denied' using errcode = '42501';
  end if;
  if p_expires_in_minutes not between 5 and 10080 then
    raise exception 'invalid_invitation_expiry';
  end if;
  if p_max_uses not between 1 and 20 then raise exception 'invalid_invitation_uses'; end if;
  if v_roles && array['owner', 'system_admin', 'studio_manager']::text[] then
    raise exception 'privileged_role_invitation_forbidden';
  end if;

  insert into public.studio_invitations (
    studio_id, token_hash, roles, created_by, expires_at, max_uses
  ) values (
    p_studio_id,
    encode(digest(v_token, 'sha256'), 'hex'),
    v_roles,
    auth.uid(),
    now() + make_interval(mins => p_expires_in_minutes),
    p_max_uses
  );
  return v_token;
end;
$$;

create or replace function public.request_studio_join(
  p_token text,
  p_display_name text,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.studio_invitations;
  v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if length(coalesce(trim(p_display_name), '')) < 2 then raise exception 'display_name_required'; end if;

  select * into v_invitation
  from public.studio_invitations
  where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and revoked_at is null
    and expires_at > now()
    and use_count < max_uses
  for update;
  if not found then raise exception 'invalid_or_expired_invitation'; end if;

  insert into public.studio_join_requests (
    studio_id, invitation_id, user_id, display_name, phone, requested_roles
  ) values (
    v_invitation.studio_id,
    v_invitation.id,
    auth.uid(),
    trim(p_display_name),
    nullif(trim(coalesce(p_phone, '')), ''),
    v_invitation.roles
  )
  on conflict (studio_id, user_id) do update
    set invitation_id = excluded.invitation_id,
        display_name = excluded.display_name,
        phone = excluded.phone,
        requested_roles = excluded.requested_roles,
        status = 'pending',
        reviewed_by = null,
        reviewed_at = null
  returning id into v_request_id;
  return v_request_id;
end;
$$;

create or replace function public.review_studio_join(
  p_request_id uuid,
  p_approve boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.studio_join_requests;
  v_invitation public.studio_invitations;
begin
  select * into v_request
  from public.studio_join_requests
  where id = p_request_id and status = 'pending'
  for update;
  if not found then raise exception 'join_request_not_found'; end if;
  if not public.has_studio_permission(v_request.studio_id, 'members.manage') then
    raise exception 'members_manage_permission_denied' using errcode = '42501';
  end if;

  if p_approve then
    select * into v_invitation
    from public.studio_invitations
    where id = v_request.invitation_id
    for update;
    if not found
      or v_invitation.revoked_at is not null
      or v_invitation.expires_at <= now()
      or v_invitation.use_count >= v_invitation.max_uses then
      raise exception 'invitation_no_longer_available';
    end if;

    insert into public.studio_members (
      studio_id, user_id, phone, display_name, roles, status
    ) values (
      v_request.studio_id, v_request.user_id, v_request.phone,
      v_request.display_name, v_request.requested_roles, 'active'
    )
    on conflict (studio_id, user_id) do update
      set phone = excluded.phone,
          display_name = excluded.display_name,
          roles = excluded.roles,
          status = 'active';
    update public.studio_invitations
    set use_count = use_count + 1
    where id = v_request.invitation_id;
  end if;

  update public.studio_join_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_request_id;
  return v_request.studio_id;
end;
$$;

grant execute on function public.create_studio_invitation(uuid, text[], integer, integer) to authenticated;
grant execute on function public.request_studio_join(text, text, text) to authenticated;
grant execute on function public.review_studio_join(uuid, boolean) to authenticated;
revoke all on function public.create_studio_invitation(uuid, text[], integer, integer) from public;
revoke all on function public.request_studio_join(text, text, text) from public;
revoke all on function public.review_studio_join(uuid, boolean) from public;

-- Existing signature remains compatible, but public join_code enrollment is retired.
create or replace function public.register_studio(
  p_studio_name text,
  p_phone text,
  p_display_name text default '',
  p_join_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio_id uuid;
  v_code text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if nullif(trim(coalesce(p_join_code, '')), '') is not null then
    raise exception 'use_request_studio_join';
  end if;

  select studio_id into v_studio_id
  from public.studio_members
  where user_id = auth.uid() and status = 'active'
  order by created_at asc limit 1;
  if v_studio_id is not null then return v_studio_id; end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.studios (name, join_code, slug)
  values (
    coalesce(nullif(trim(p_studio_name), ''), 'Studio M'),
    v_code,
    lower(regexp_replace(coalesce(nullif(trim(p_studio_name), ''), 'studio'), '\s+', '-', 'g'))
  ) returning id into v_studio_id;

  insert into public.studio_members (
    studio_id, user_id, phone, display_name, roles, status
  ) values (
    v_studio_id, auth.uid(), p_phone,
    coalesce(nullif(trim(p_display_name), ''), 'مدیر'),
    array['studio_manager'], 'active'
  );
  insert into public.studio_snapshots (studio_id, data, updated_by)
  values (v_studio_id, '{}'::jsonb, auth.uid());
  return v_studio_id;
end;
$$;

revoke all on function public.register_studio(text, text, text, text) from public;
grant execute on function public.register_studio(text, text, text, text) to authenticated;
