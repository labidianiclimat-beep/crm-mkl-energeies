-- Justificatifs prospect (même module photo → PDF que les clients)
-- Safe to re-run

create table if not exists public.prospect_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  prospect_id uuid not null references public.commercial_opportunities (id) on delete cascade,
  kind text not null,
  title text not null,
  page_count integer not null default 1,
  file_size integer not null default 0,
  mime_type text not null default 'application/pdf',
  storage_path text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists prospect_documents_prospect_idx
  on public.prospect_documents (prospect_id, created_at desc);

create index if not exists prospect_documents_org_idx
  on public.prospect_documents (organization_id);

alter table public.prospect_documents enable row level security;

drop policy if exists prospect_documents_select on public.prospect_documents;
create policy prospect_documents_select on public.prospect_documents
  for select to authenticated
  using (
    exists (
      select 1 from public.commercial_opportunities o
      where o.id = prospect_documents.prospect_id
        and public.can_access_opportunity_row(o)
    )
  );

drop policy if exists prospect_documents_insert on public.prospect_documents;
create policy prospect_documents_insert on public.prospect_documents
  for insert to authenticated
  with check (
    exists (
      select 1 from public.commercial_opportunities o
      where o.id = prospect_documents.prospect_id
        and public.can_access_opportunity_row(o)
    )
  );

drop policy if exists prospect_documents_delete on public.prospect_documents;
create policy prospect_documents_delete on public.prospect_documents
  for delete to authenticated
  using (
    exists (
      select 1 from public.commercial_opportunities o
      where o.id = prospect_documents.prospect_id
        and public.can_access_opportunity_row(o)
    )
  );

grant all on table public.prospect_documents to service_role;
grant select, insert, delete on table public.prospect_documents to authenticated;
