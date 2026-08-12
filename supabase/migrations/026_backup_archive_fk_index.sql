-- Cover the backup creator foreign key for manager/audit queries and user deletion.
create index if not exists studio_backup_archives_created_by_idx
  on public.studio_backup_archives (created_by);
