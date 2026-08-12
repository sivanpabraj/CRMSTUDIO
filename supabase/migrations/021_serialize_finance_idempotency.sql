-- Serialize equal finance commands before the authoritative function performs
-- its initial idempotency lookup. This turns concurrent duplicate submissions
-- into a deterministic deduplicated response instead of a unique violation.

alter function public.post_finance_command(uuid, text, text, jsonb)
  rename to post_finance_command_unlocked;

alter function public.post_finance_command_unlocked(uuid, text, text, jsonb)
  set search_path = '';

revoke execute on function public.post_finance_command_unlocked(uuid, text, text, jsonb)
  from public, anon, authenticated;

create function public.post_finance_command(
  p_studio_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_studio_id is null
    or length(coalesce(p_idempotency_key, '')) not between 8 and 128 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_studio_id::text || ':' || p_idempotency_key,
      0
    )
  );

  return public.post_finance_command_unlocked(
    p_studio_id,
    p_operation,
    p_idempotency_key,
    p_payload
  );
end;
$$;

revoke execute on function public.post_finance_command(uuid, text, text, jsonb)
  from public, anon;
grant execute on function public.post_finance_command(uuid, text, text, jsonb)
  to authenticated;

comment on function public.post_finance_command(uuid, text, text, jsonb) is
  'Serialized public finance command boundary; equal idempotency keys execute once per studio';
comment on function public.post_finance_command_unlocked(uuid, text, text, jsonb) is
  'Internal authoritative finance implementation; callable only through the serialized wrapper';


