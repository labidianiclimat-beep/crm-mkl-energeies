-- Simulations de production photovoltaïque, même accès que les études thermiques.
-- À coller dans Supabase. Tant que la table n’existe pas, le CRM enregistre dans crm_state.

create table if not exists public.pv_simulations (
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

create index if not exists pv_simulations_org_updated_idx
  on public.pv_simulations (organization_id, updated_at desc);
create index if not exists pv_simulations_client_idx
  on public.pv_simulations (organization_id, client_id);

alter table public.pv_simulations enable row level security;

drop policy if exists pv_simulations_org on public.pv_simulations;
create policy pv_simulations_org on public.pv_simulations
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = pv_simulations.organization_id
        and p.active = true
        and p.onboarding_completed_at is not null
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = pv_simulations.organization_id
        and p.active = true
        and p.onboarding_completed_at is not null
    )
  );

grant all on table public.pv_simulations to service_role;
grant select, insert, update, delete on table public.pv_simulations to authenticated;
