-- Étape 9 — RLS scoping commercial (org / équipe / soi)
-- Safe to re-run

-- ---------------------------------------------------------------------------
-- Helpers de portée
-- ---------------------------------------------------------------------------

-- Vision organisation complète (admins + direction + secrétariat)
create or replace function public.can_view_all_org_clients(role_name text)
returns boolean
language sql
immutable
as $$
  select role_name in ('Admin VIP', 'Admin second', 'Direction', 'Secrétariat');
$$;

-- Compat : ancien nom — ne donne plus l’org entière au Responsable commercial
create or replace function public.can_manage_all_clients(role_name text)
returns boolean
language sql
immutable
as $$
  select public.can_view_all_org_clients(role_name);
$$;

create or replace function public.is_commercial_team_lead(role_name text)
returns boolean
language sql
immutable
as $$
  select role_name = 'Responsable commercial';
$$;

-- Membres visibles : soi, ou soi + équipe si responsable commercial
create or replace function public.team_member_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id, role, full_name, email, organization_id
    from public.profiles
    where id = auth.uid()
    limit 1
  )
  select coalesce(
    (
      select array_agg(distinct p.id)
      from public.profiles p
      cross join me
      where p.organization_id = me.organization_id
        and p.active = true
        and (
          p.id = me.id
          or (
            me.role = 'Responsable commercial'
            and (
              nullif(trim(p.manager), '') = nullif(trim(me.full_name), '')
              or nullif(trim(p.manager), '') = nullif(trim(me.email), '')
            )
          )
        )
    ),
    array[auth.uid()]
  );
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
        public.can_view_all_org_clients(p.role)
        or c.commercial_id = auth.uid()
        or c.created_by = auth.uid()
        or (
          public.is_commercial_team_lead(p.role)
          and (
            c.commercial_id = any (public.team_member_ids())
            or c.created_by = any (public.team_member_ids())
          )
        )
      )
  );
$$;

create or replace function public.can_access_devis_row(d public.devis)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.onboarding_completed_at is not null
      and p.organization_id = d.organization_id
      and (
        public.can_view_all_org_clients(p.role)
        or d.commercial_id = auth.uid()
        or d.created_by = auth.uid()
        or (
          public.is_commercial_team_lead(p.role)
          and (
            d.commercial_id = any (public.team_member_ids())
            or d.created_by = any (public.team_member_ids())
          )
        )
        or exists (
          select 1 from public.clients c
          where c.id = d.client_id
            and public.can_access_client_row(c)
        )
      )
  );
$$;

-- Insert clients : commercial force son id ; responsable peut affecter l’équipe
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
          public.can_view_all_org_clients(p.role)
          or (
            public.is_commercial_team_lead(p.role)
            and 'Clients' = any (p.modules)
            and (
              clients.commercial_id is null
              or clients.commercial_id = any (public.team_member_ids())
            )
          )
          or (
            'Clients' = any (p.modules)
            and (clients.commercial_id is null or clients.commercial_id = auth.uid())
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Pipeline commercial (opportunités / rendez-vous) — RLS dès la création
-- ---------------------------------------------------------------------------

create table if not exists public.commercial_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  name text not null,
  phone text,
  email text,
  city text,
  project_type text,
  estimated_value numeric(14,2) default 0,
  source text,
  stage text not null default 'Nouveau',
  commercial_id uuid references auth.users (id) on delete set null,
  notes text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists commercial_opportunities_org_idx
  on public.commercial_opportunities (organization_id);
create index if not exists commercial_opportunities_commercial_idx
  on public.commercial_opportunities (commercial_id);

create table if not exists public.commercial_appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  opportunity_id uuid references public.commercial_opportunities (id) on delete set null,
  prospect_name text,
  city text,
  project_type text,
  starts_at timestamptz not null,
  duration_minutes integer not null default 60,
  commercial_id uuid references auth.users (id) on delete set null,
  manager_id uuid references auth.users (id) on delete set null,
  status text not null default 'À dispatcher',
  notes text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists commercial_appointments_org_idx
  on public.commercial_appointments (organization_id);
create index if not exists commercial_appointments_commercial_idx
  on public.commercial_appointments (commercial_id);
create index if not exists commercial_appointments_starts_idx
  on public.commercial_appointments (organization_id, starts_at);

create or replace function public.can_access_opportunity_row(o public.commercial_opportunities)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.onboarding_completed_at is not null
      and p.organization_id = o.organization_id
      and (
        public.can_view_all_org_clients(p.role)
        or o.commercial_id = auth.uid()
        or o.created_by = auth.uid()
        or (
          public.is_commercial_team_lead(p.role)
          and (
            o.commercial_id = any (public.team_member_ids())
            or o.created_by = any (public.team_member_ids())
          )
        )
      )
  );
$$;

create or replace function public.can_access_appointment_row(a public.commercial_appointments)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.onboarding_completed_at is not null
      and p.organization_id = a.organization_id
      and (
        public.can_view_all_org_clients(p.role)
        or a.commercial_id = auth.uid()
        or a.manager_id = auth.uid()
        or a.created_by = auth.uid()
        or (
          public.is_commercial_team_lead(p.role)
          and (
            a.commercial_id = any (public.team_member_ids())
            or a.created_by = any (public.team_member_ids())
            or a.manager_id = auth.uid()
          )
        )
      )
  );
$$;

alter table public.commercial_opportunities enable row level security;
alter table public.commercial_appointments enable row level security;

drop policy if exists commercial_opportunities_select on public.commercial_opportunities;
create policy commercial_opportunities_select on public.commercial_opportunities
  for select to authenticated
  using (public.can_access_opportunity_row(commercial_opportunities));

drop policy if exists commercial_opportunities_insert on public.commercial_opportunities;
create policy commercial_opportunities_insert on public.commercial_opportunities
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = commercial_opportunities.organization_id
        and (
          public.can_view_all_org_clients(p.role)
          or public.is_commercial_team_lead(p.role)
          or 'Prospects' = any (p.modules)
        )
        and (
          commercial_opportunities.commercial_id is null
          or commercial_opportunities.commercial_id = auth.uid()
          or commercial_opportunities.commercial_id = any (public.team_member_ids())
        )
    )
  );

drop policy if exists commercial_opportunities_update on public.commercial_opportunities;
create policy commercial_opportunities_update on public.commercial_opportunities
  for update to authenticated
  using (public.can_access_opportunity_row(commercial_opportunities))
  with check (public.can_access_opportunity_row(commercial_opportunities));

drop policy if exists commercial_opportunities_delete on public.commercial_opportunities;
create policy commercial_opportunities_delete on public.commercial_opportunities
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and public.is_admin_role(p.role)
        and p.organization_id = commercial_opportunities.organization_id
    )
  );

drop policy if exists commercial_appointments_select on public.commercial_appointments;
create policy commercial_appointments_select on public.commercial_appointments
  for select to authenticated
  using (public.can_access_appointment_row(commercial_appointments));

drop policy if exists commercial_appointments_insert on public.commercial_appointments;
create policy commercial_appointments_insert on public.commercial_appointments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = commercial_appointments.organization_id
        and (
          public.can_view_all_org_clients(p.role)
          or public.is_commercial_team_lead(p.role)
          or 'Agenda commercial' = any (p.modules)
        )
    )
  );

drop policy if exists commercial_appointments_update on public.commercial_appointments;
create policy commercial_appointments_update on public.commercial_appointments
  for update to authenticated
  using (public.can_access_appointment_row(commercial_appointments))
  with check (public.can_access_appointment_row(commercial_appointments));

drop policy if exists commercial_appointments_delete on public.commercial_appointments;
create policy commercial_appointments_delete on public.commercial_appointments
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and (
          public.is_admin_role(p.role)
          or public.is_commercial_team_lead(p.role)
        )
        and p.organization_id = commercial_appointments.organization_id
    )
  );

grant all on table public.commercial_opportunities to service_role;
grant all on table public.commercial_appointments to service_role;
grant select, insert, update, delete on table public.commercial_opportunities to authenticated;
grant select, insert, update, delete on table public.commercial_appointments to authenticated;
grant execute on function public.team_member_ids() to authenticated;
grant execute on function public.team_member_ids() to service_role;
grant execute on function public.can_view_all_org_clients(text) to authenticated;
grant execute on function public.can_view_all_org_clients(text) to service_role;

-- Aligner permissions catalogue si ÉTAPE 8 déjà appliquée
do $$
begin
  if to_regclass('public.role_permissions') is null
     or to_regclass('public.roles') is null
     or to_regclass('public.permissions') is null then
    raise notice 'Tables RBAC absentes — sautez l’alignement role_permissions (exécutez d’abord 20260322_rbac_roles_permissions.sql).';
    return;
  end if;

  delete from public.role_permissions rp
  using public.roles r, public.permissions p
  where rp.role_id = r.id
    and rp.permission_id = p.id
    and r.code = 'responsable_commercial'
    and p.code = 'action:view_all_clients';

  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.code = 'secretariat'
    and p.code = 'action:view_all_clients'
  on conflict do nothing;
end $$;
