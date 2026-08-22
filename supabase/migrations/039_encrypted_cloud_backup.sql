-- Authenticated encryption for cloud backup archives. Encryption/decryption is
-- performed only inside the Edge Function with a versioned server secret.

alter table public.studio_backup_archives
  add column if not exists encrypted_payload text,
  add column if not exists encryption_nonce text,
  add column if not exists manifest jsonb;

alter table public.studio_backup_archives
  alter column payload drop not null;

alter table public.studio_backup_archives
  drop constraint if exists studio_backup_archive_payload_mode;
alter table public.studio_backup_archives
  add constraint studio_backup_archive_payload_mode check (
    (payload is not null and encrypted_payload is null and encryption_nonce is null)
    or
    (payload is null and encrypted_payload is not null and encryption_nonce is not null
      and manifest is not null)
  );

create or replace function public.store_encrypted_studio_backup(
  p_studio_id uuid,
  p_actor_id uuid,
  p_ciphertext text,
  p_nonce text,
  p_checksum text,
  p_plaintext_size bigint,
  p_manifest jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.studio_members as m
    where m.studio_id = p_studio_id and m.user_id = p_actor_id
      and m.status = 'active' and m.revoked_at is null
      and m.valid_from <= now() and (m.valid_until is null or m.valid_until > now())
      and m.roles && array['owner','system_admin','studio_manager']::text[]
  ) then raise exception 'backup_permission_denied' using errcode = '42501'; end if;
  if p_ciphertext is null or length(p_ciphertext) < 24
    or p_nonce !~ '^[A-Za-z0-9+/]{16}={0,2}$'
    or p_checksum !~ '^[0-9a-f]{64}$'
    or p_plaintext_size not between 2 and 20971520
    or p_manifest->>'format' <> 'crmstudio-aes-gcm-v1'
    or p_manifest->>'algorithm' <> 'AES-256-GCM'
    or coalesce((p_manifest->>'schemaVersion')::integer, 0) < 1
    or coalesce((p_manifest->>'keyVersion')::integer, 0) < 1 then
    raise exception 'invalid_encrypted_backup' using errcode = '22023';
  end if;
  insert into public.studio_backup_archives (
    studio_id, payload, encrypted_payload, encryption_nonce, manifest,
    checksum, source, size_bytes, db_version, app_version, created_by
  ) values (
    p_studio_id, null, p_ciphertext, p_nonce, p_manifest,
    p_checksum, 'edge-aead', p_plaintext_size,
    (p_manifest->>'schemaVersion')::integer,
    left(p_manifest->>'appVersion', 64), p_actor_id
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.read_encrypted_studio_backup(
  p_backup_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archive public.studio_backup_archives;
begin
  select * into v_archive from public.studio_backup_archives
  where id = p_backup_id and encrypted_payload is not null;
  if not found then raise exception 'backup_not_found' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.studio_members as m
    where m.studio_id = v_archive.studio_id and m.user_id = p_actor_id
      and m.status = 'active' and m.revoked_at is null
      and m.valid_from <= now() and (m.valid_until is null or m.valid_until > now())
      and m.roles && array['owner','system_admin','studio_manager']::text[]
  ) then raise exception 'backup_permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'ciphertext', v_archive.encrypted_payload,
    'nonce', v_archive.encryption_nonce,
    'checksum', v_archive.checksum,
    'manifest', v_archive.manifest
  );
end;
$$;

-- Plaintext backup creation is retired. Historical plaintext archives remain
-- readable only to their tenant manager for an explicit migration window.
revoke execute on function public.create_studio_backup(uuid, jsonb, text, text, int, text)
  from public, anon, authenticated;
revoke execute on function public.store_encrypted_studio_backup(uuid, uuid, text, text, text, bigint, jsonb)
  from public, anon, authenticated;
revoke execute on function public.read_encrypted_studio_backup(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.store_encrypted_studio_backup(uuid, uuid, text, text, text, bigint, jsonb)
  to service_role;
grant execute on function public.read_encrypted_studio_backup(uuid, uuid)
  to service_role;

comment on function public.store_encrypted_studio_backup(uuid, uuid, text, text, text, bigint, jsonb) is
  'Service-only storage boundary for AES-256-GCM encrypted backup envelopes';
