-- Images d’étude PV hors du blob crm_state + rappels de durcissement.
-- À coller après 20260927_rename_admin_second_superadmin.sql

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pv-study-assets',
  'pv-study-assets',
  false,
  8388608,
  array['image/png', 'image/jpeg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
