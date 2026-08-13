-- Ensure sync event log is in realtime publication (multi-device live hints)
do $$
begin
  alter publication supabase_realtime add table public.studio_sync_events;
exception
  when duplicate_object then null;
  when undefined_object then null;
  when undefined_table then null;
end $$;
