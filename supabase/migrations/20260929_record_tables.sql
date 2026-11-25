-- Dossiers PV, études thermiques et contrats : une ligne par dossier.
-- À coller après 20260928_crm_hardening.sql

create table if not exists public.pv_projects (
  organization_id uuid not null,
  record_id text not null,
  client_id uuid,
  client_name text,
  title text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (organization_id, record_id)
);

create table if not exists public.thermal_studies (
  organization_id uuid not null,
  record_id text not null,
  client_id uuid,
  client_name text,
  title text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (organization_id, record_id)
);

create table if not exists public.maintenance_contracts (
  organization_id uuid not null,
  record_id text not null,
  client_id uuid,
  client_name text,
  title text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (organization_id, record_id)
);

create index if not exists pv_projects_org_updated_idx
  on public.pv_projects (organization_id, updated_at desc);
create index if not exists pv_projects_client_idx
  on public.pv_projects (organization_id, client_id);

create index if not exists thermal_studies_org_updated_idx
  on public.thermal_studies (organization_id, updated_at desc);
create index if not exists thermal_studies_client_idx
  on public.thermal_studies (organization_id, client_id);

create index if not exists maintenance_contracts_org_updated_idx
  on public.maintenance_contracts (organization_id, updated_at desc);
create index if not exists maintenance_contracts_client_idx
  on public.maintenance_contracts (organization_id, client_id);

alter table public.pv_projects enable row level security;
alter table public.thermal_studies enable row level security;
alter table public.maintenance_contracts enable row level security;

drop policy if exists pv_projects_org on public.pv_projects;
create policy pv_projects_org on public.pv_projects
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = pv_projects.organization_id
        and p.active = true
        and p.onboarding_completed_at is not null
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = pv_projects.organization_id
        and p.active = true
        and p.onboarding_completed_at is not null
    )
  );

drop policy if exists thermal_studies_org on public.thermal_studies;
create policy thermal_studies_org on public.thermal_studies
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = thermal_studies.organization_id
        and p.active = true
        and p.onboarding_completed_at is not null
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = thermal_studies.organization_id
        and p.active = true
        and p.onboarding_completed_at is not null
    )
  );

drop policy if exists maintenance_contracts_org on public.maintenance_contracts;
create policy maintenance_contracts_org on public.maintenance_contracts
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = maintenance_contracts.organization_id
        and p.active = true
        and p.onboarding_completed_at is not null
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = maintenance_contracts.organization_id
        and p.active = true
        and p.onboarding_completed_at is not null
    )
  );

grant all on table public.pv_projects to service_role;
grant all on table public.thermal_studies to service_role;
grant all on table public.maintenance_contracts to service_role;
grant select, insert, update, delete on table public.pv_projects to authenticated;
grant select, insert, update, delete on table public.thermal_studies to authenticated;
grant select, insert, update, delete on table public.maintenance_contracts to authenticated;
