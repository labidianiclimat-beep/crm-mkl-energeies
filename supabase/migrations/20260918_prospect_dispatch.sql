-- Responsable prospection : profils dispatch, historique d’attribution, RLS.
-- Non destructif. À coller dans Supabase → SQL Editor → Run.

alter table public.profiles add column if not exists zone text;
alter table public.profiles add column if not exists specialties text[] not null default '{}'::text[];
alter table public.profiles add column if not exists postal_code text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists geo_lat numeric;
alter table public.profiles add column if not exists geo_lon numeric;
alter table public.profiles add column if not exists dispatch_available boolean not null default true;

create table if not exists public.prospect_assignment_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  prospect_id uuid not null references public.commercial_opportunities (id) on delete cascade,
  appointment_id uuid references public.commercial_appointments (id) on delete set null,
  previous_commercial_id uuid references auth.users (id) on delete set null,
  next_commercial_id uuid references auth.users (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text,
  appointment_at timestamptz,
  reason text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists prospect_assignment_history_prospect_idx
  on public.prospect_assignment_history (prospect_id, created_at desc);

alter table public.prospect_assignment_history enable row level security;

create or replace function public.is_prospect_dispatcher(role_name text)
returns boolean
language sql
immutable
as $$
  select role_name = 'Responsable prospection';
$$;

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
        or public.is_prospect_dispatcher(p.role)
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
        or public.is_prospect_dispatcher(p.role)
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
          or public.is_prospect_dispatcher(p.role)
          or 'Prospects' = any (p.modules)
        )
        and (
          commercial_opportunities.commercial_id is null
          or commercial_opportunities.commercial_id = auth.uid()
          or commercial_opportunities.commercial_id = any (public.team_member_ids())
          or (
            public.is_prospect_dispatcher(p.role)
            and exists (
              select 1 from public.profiles x
              where x.id = commercial_opportunities.commercial_id
                and x.organization_id = p.organization_id
            )
          )
        )
    )
  );

drop policy if exists prospect_assignment_history_select on public.prospect_assignment_history;
create policy prospect_assignment_history_select on public.prospect_assignment_history
  for select to authenticated
  using (
    exists (
      select 1 from public.commercial_opportunities o
      where o.id = prospect_assignment_history.prospect_id
        and public.can_access_opportunity_row(o)
    )
  );

drop policy if exists prospect_assignment_history_insert on public.prospect_assignment_history;
create policy prospect_assignment_history_insert on public.prospect_assignment_history
  for insert to authenticated
  with check (false);

grant all on table public.prospect_assignment_history to service_role;
grant select on table public.prospect_assignment_history to authenticated;
grant execute on function public.is_prospect_dispatcher(text) to authenticated;
grant execute on function public.is_prospect_dispatcher(text) to service_role;

insert into public.roles (code, label, description, is_admin, sort_order) values
  ('responsable_prospection', 'Responsable prospection', 'Crée et répartit les prospects, agendas professionnels, sans devis ni factures', false, 45)
on conflict (code) do update set
  label = excluded.label,
  description = excluded.description,
  is_admin = excluded.is_admin,
  sort_order = excluded.sort_order;

insert into public.permissions (code, label, category) values
  ('action:dispatch_prospects', 'Attribuer des prospects', 'action')
on conflict (code) do update set
  label = excluded.label,
  category = excluded.category;

do $$
begin
  if to_regclass('public.role_permissions') is null then
    return;
  end if;
  perform public.rbac_grant('responsable_prospection', array[
    'module:Tableau de bord',
    'module:Prospects',
    'module:Agenda commercial',
    'action:send_mail',
    'action:dispatch_prospects'
  ]);
end $$;
