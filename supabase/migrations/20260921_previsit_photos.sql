-- Photos annotées de prévisite technique + rapport PDF
-- Safe to re-run

create extension if not exists pgcrypto;

create table if not exists public.previsit_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  visit_key text not null,
  client_id uuid references public.clients (id) on delete set null,
  caption text not null default '',
  comment text not null default '',
  sort_order integer not null default 0,
  taken_at timestamptz not null default now(),
  original_path text not null,
  annotated_path text not null,
  width integer not null default 0,
  height integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists previsit_photos_visit_idx
  on public.previsit_photos (organization_id, visit_key, sort_order);

create index if not exists previsit_photos_client_idx
  on public.previsit_photos (client_id, created_at desc);

create table if not exists public.previsit_photo_marks (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.previsit_photos (id) on delete cascade,
  equipment_type text not null,
  x numeric not null,
  y numeric not null,
  scale numeric not null default 0.18,
  rotation numeric not null default 0,
  sort_order integer not null default 0
);

create index if not exists previsit_photo_marks_photo_idx
  on public.previsit_photo_marks (photo_id, sort_order);

create table if not exists public.previsit_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  visit_key text not null,
  client_id uuid references public.clients (id) on delete cascade,
  document_id uuid references public.client_documents (id) on delete set null,
  generated_by uuid references auth.users (id) on delete set null,
  generated_at timestamptz not null default now(),
  unique (organization_id, visit_key)
);

create index if not exists previsit_reports_client_idx
  on public.previsit_reports (client_id, generated_at desc);

alter table public.previsit_photos enable row level security;
alter table public.previsit_photo_marks enable row level security;
alter table public.previsit_reports enable row level security;

drop policy if exists previsit_photos_select on public.previsit_photos;
create policy previsit_photos_select on public.previsit_photos
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.organization_id = previsit_photos.organization_id
    )
    and (
      client_id is null
      or exists (
        select 1 from public.clients c
        where c.id = previsit_photos.client_id
          and public.can_access_client_row(c)
      )
    )
  );

drop policy if exists previsit_photos_write on public.previsit_photos;
create policy previsit_photos_write on public.previsit_photos
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.organization_id = previsit_photos.organization_id
    )
    and (
      client_id is null
      or exists (
        select 1 from public.clients c
        where c.id = previsit_photos.client_id
          and public.can_access_client_row(c)
      )
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.organization_id = previsit_photos.organization_id
    )
    and (
      client_id is null
      or exists (
        select 1 from public.clients c
        where c.id = previsit_photos.client_id
          and public.can_access_client_row(c)
      )
    )
  );

drop policy if exists previsit_photo_marks_all on public.previsit_photo_marks;
create policy previsit_photo_marks_all on public.previsit_photo_marks
  for all to authenticated
  using (
    exists (
      select 1 from public.previsit_photos p
      where p.id = previsit_photo_marks.photo_id
    )
  )
  with check (
    exists (
      select 1 from public.previsit_photos p
      where p.id = previsit_photo_marks.photo_id
    )
  );

drop policy if exists previsit_reports_all on public.previsit_reports;
create policy previsit_reports_all on public.previsit_reports
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.organization_id = previsit_reports.organization_id
    )
    and (
      client_id is null
      or exists (
        select 1 from public.clients c
        where c.id = previsit_reports.client_id
          and public.can_access_client_row(c)
      )
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.organization_id = previsit_reports.organization_id
    )
    and (
      client_id is null
      or exists (
        select 1 from public.clients c
        where c.id = previsit_reports.client_id
          and public.can_access_client_row(c)
      )
    )
  );

grant all on table public.previsit_photos to service_role;
grant all on table public.previsit_photo_marks to service_role;
grant all on table public.previsit_reports to service_role;
grant select, insert, update, delete on table public.previsit_photos to authenticated;
grant select, insert, update, delete on table public.previsit_photo_marks to authenticated;
grant select, insert, update, delete on table public.previsit_reports to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'previsit-photos',
  'previsit-photos',
  false,
  26214400,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
