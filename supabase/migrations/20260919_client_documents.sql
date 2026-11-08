-- Justificatifs client (photos téléphone → PDF privé)
-- Safe to re-run

create extension if not exists pgcrypto;

create table if not exists public.client_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null,
  title text not null,
  page_count integer not null default 1,
  file_size integer not null default 0,
  mime_type text not null default 'application/pdf',
  storage_path text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists client_documents_client_idx
  on public.client_documents (client_id, created_at desc);

create index if not exists client_documents_org_idx
  on public.client_documents (organization_id);

alter table public.client_documents enable row level security;

drop policy if exists client_documents_select on public.client_documents;
create policy client_documents_select on public.client_documents
  for select to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_documents.client_id
        and public.can_access_client_row(c)
    )
  );

drop policy if exists client_documents_insert on public.client_documents;
create policy client_documents_insert on public.client_documents
  for insert to authenticated
  with check (
    exists (
      select 1 from public.clients c
      where c.id = client_documents.client_id
        and public.can_access_client_row(c)
    )
  );

drop policy if exists client_documents_delete on public.client_documents;
create policy client_documents_delete on public.client_documents
  for delete to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_documents.client_id
        and public.can_access_client_row(c)
    )
  );

grant all on table public.client_documents to service_role;
grant select, insert, delete on table public.client_documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-documents',
  'client-documents',
  false,
  26214400,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
