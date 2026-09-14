-- RBAC + activation onboarding for MKL Énergies CRM
-- Non-destructive: only adds columns/tables/policies. Safe to re-run sections with IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  full_name text,
  email text,
  role text not null default 'Commercial',
  modules text[] not null default array['Tableau de bord']::text[],
  manager text,
  active boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add column if not exists manager text;
alter table public.profiles add column if not exists organization_id uuid;
alter table public.profiles add column if not exists modules text[];
alter table public.profiles add column if not exists active boolean;
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists created_at timestamptz;
alter table public.profiles add column if not exists updated_at timestamptz;

update public.profiles
set organization_id = coalesce(organization_id, '00000000-0000-0000-0000-000000000001'::uuid),
    modules = coalesce(modules, array['Tableau de bord']::text[]),
    active = coalesce(active, false),
    role = coalesce(role, 'Commercial')
where organization_id is null or modules is null or active is null or role is null;

-- Existing administrators: mark onboarding complete (no lock-out)
update public.profiles
set onboarding_completed_at = coalesce(onboarding_completed_at, now()),
    active = true
where role in ('Admin VIP', 'Admin second')
  and onboarding_completed_at is null;

-- ---------------------------------------------------------------------------
-- CRM state (org-scoped JSON blobs)
-- ---------------------------------------------------------------------------
create table if not exists public.crm_state (
  id bigserial primary key,
  organization_id uuid not null,
  state_key text not null,
  state_value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  unique (organization_id, state_key)
);

-- ---------------------------------------------------------------------------
-- Activation PINs (hashed, server-managed via service role)
-- ---------------------------------------------------------------------------
create table if not exists public.activation_pins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pin_hash text not null,
  pin_salt text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  invalidated_at timestamptz,
  attempts int not null default 0,
  locked_until timestamptz,
  created_by uuid references auth.users (id)
);

create index if not exists activation_pins_user_active_idx
  on public.activation_pins (user_id, created_at desc)
  where used_at is null and invalidated_at is null;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin_role(role_name text)
returns boolean
language sql
immutable
as $$
  select role_name in ('Admin VIP', 'Admin second');
$$;

create or replace function public.state_key_to_module(state_key text)
returns text
language sql
immutable
as $$
  select case state_key
    when 'mkl-prospects' then 'Prospects'
    when 'mkl-commercial-appointments' then 'Agenda commercial'
    when 'mkl-clients' then 'Clients'
    when 'mkl-billing' then 'Devis'
    when 'mkl-contracts' then 'Maintenance'
    when 'mkl-cost-requests' then 'Demandes de chiffrage'
    when 'mkl-suppliers' then 'Fournisseurs'
    when 'mkl-installations' then 'Planning'
    when 'mkl-installation-teams' then 'Équipes d''installation'
    when 'mkl-technical-visits' then 'Visites techniques'
    when 'mkl-pv-projects' then 'Photovoltaïque administratif'
    when 'mkl-articles' then 'Gestion des articles'
    when 'mkl-article-groups' then 'Gestion des articles'
    when 'mkl-article-bundles' then 'Gestion des articles'
    when 'mkl-users' then 'Utilisateurs'
    when 'mkl-purchase-orders' then 'Visites techniques'
    else null
  end;
$$;

create or replace function public.profile_can_access_state(p public.profiles, state_key text)
returns boolean
language sql
stable
as $$
  select
    p.active = true
    and p.onboarding_completed_at is not null
    and (
      public.is_admin_role(p.role)
      or public.state_key_to_module(state_key) = any (p.modules)
      or state_key = 'mkl-users' and public.is_admin_role(p.role)
    );
$$;

-- ---------------------------------------------------------------------------
-- RLS: profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_select_admin_org on public.profiles;
create policy profiles_select_admin_org on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles admin
      where admin.id = auth.uid()
        and public.is_admin_role(admin.role)
        and admin.organization_id = profiles.organization_id
        and admin.active = true
        and admin.onboarding_completed_at is not null
    )
  );

drop policy if exists profiles_update_self_safe on public.profiles;
create policy profiles_update_self_safe on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
    and modules = (select modules from public.profiles where id = auth.uid())
    and active = (select active from public.profiles where id = auth.uid())
    and organization_id = (select organization_id from public.profiles where id = auth.uid())
    and onboarding_completed_at = (select onboarding_completed_at from public.profiles where id = auth.uid())
  );

drop policy if exists profiles_admin_manage on public.profiles;
create policy profiles_admin_manage on public.profiles
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles admin
      where admin.id = auth.uid()
        and public.is_admin_role(admin.role)
        and admin.organization_id = profiles.organization_id
        and admin.active = true
        and admin.onboarding_completed_at is not null
    )
  )
  with check (
    exists (
      select 1 from public.profiles admin
      where admin.id = auth.uid()
        and public.is_admin_role(admin.role)
        and admin.organization_id = profiles.organization_id
        and admin.active = true
        and admin.onboarding_completed_at is not null
    )
    and (
      profiles.id <> auth.uid()
      or (
        profiles.role = (select role from public.profiles where id = auth.uid())
        and profiles.modules = (select modules from public.profiles where id = auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: crm_state
-- ---------------------------------------------------------------------------
alter table public.crm_state enable row level security;

drop policy if exists crm_state_select on public.crm_state;
create policy crm_state_select on public.crm_state
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = crm_state.organization_id
        and public.profile_can_access_state(p, crm_state.state_key)
    )
  );

drop policy if exists crm_state_write on public.crm_state;
create policy crm_state_write on public.crm_state
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = crm_state.organization_id
        and public.profile_can_access_state(p, crm_state.state_key)
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = crm_state.organization_id
        and public.profile_can_access_state(p, crm_state.state_key)
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: activation_pins — no client access (service role only)
-- ---------------------------------------------------------------------------
alter table public.activation_pins enable row level security;

-- No policies for authenticated/anon → denied by default
