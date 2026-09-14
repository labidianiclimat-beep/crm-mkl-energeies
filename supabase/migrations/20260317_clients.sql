-- Clients CRM — table relationnelle + RLS par commercial
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS)

create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  type_client text not null default 'Particulier',
  civilite text,
  nom text,
  prenom text,
  raison_sociale text,
  adresse text,
  complement_adresse text,
  code_postal text,
  ville text,
  telephone text,
  telephone_secondaire text,
  email text,
  origine_lead text,
  statut text not null default 'Prospect',
  commercial_id uuid references auth.users (id) on delete set null,
  notes text,
  project_type text,
  install text,
  consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists clients_org_idx on public.clients (organization_id);
create index if not exists clients_commercial_idx on public.clients (commercial_id);
create index if not exists clients_email_idx on public.clients (organization_id, lower(email));
create index if not exists clients_phone_idx on public.clients (organization_id, telephone);
create index if not exists clients_statut_idx on public.clients (organization_id, statut);

-- Helpers droits clients
create or replace function public.can_manage_all_clients(role_name text)
returns boolean
language sql
immutable
as $$
  select role_name in ('Admin VIP', 'Admin second', 'Responsable commercial', 'Direction');
$$;

create or replace function public.can_access_client_row(c public.clients)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.onboarding_completed_at is not null
      and p.organization_id = c.organization_id
      and (
        public.can_manage_all_clients(p.role)
        or c.commercial_id = auth.uid()
        or c.created_by = auth.uid()
      )
  );
$$;

alter table public.clients enable row level security;

drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select to authenticated
  using (public.can_access_client_row(clients));

drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = clients.organization_id
        and (
          public.can_manage_all_clients(p.role)
          or (
            'Clients' = any (p.modules)
            and (clients.commercial_id is null or clients.commercial_id = auth.uid())
          )
        )
    )
  );

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients
  for update to authenticated
  using (public.can_access_client_row(clients))
  with check (public.can_access_client_row(clients));

drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = clients.organization_id
        and public.is_admin_role(p.role)
    )
  );

grant all on table public.clients to service_role;
grant select, insert, update, delete on table public.clients to authenticated;
