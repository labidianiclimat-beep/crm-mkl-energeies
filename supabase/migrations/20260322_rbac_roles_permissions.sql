-- Étape 8 — structure RBAC évolutive (roles / permissions / role_permissions / user_roles)
-- Safe to re-run

create extension if not exists pgcrypto;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null unique,
  description text,
  is_admin boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  category text not null check (category in ('module', 'action')),
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index if not exists user_roles_org_idx on public.user_roles (organization_id);
create index if not exists user_roles_role_idx on public.user_roles (role_id);

-- Seed roles
insert into public.roles (code, label, description, is_admin, sort_order) values
  ('admin_vip', 'Admin VIP', 'Accès total, sécurité, utilisateurs, finances et paramètres', true, 10),
  ('admin_second', 'Admin second', 'Administration courante sans gestion de l’Admin VIP', true, 20),
  ('direction', 'Direction', 'Pilotage commercial et vision globale', false, 30),
  ('responsable_commercial', 'Responsable commercial', 'Équipe commerciale, prospects, clients, devis et reporting', false, 40),
  ('commercial', 'Commercial', 'Ses prospects, clients, rendez-vous, devis et documents', false, 50),
  ('responsable_technique', 'Responsable technique', 'Chantiers, techniciens, planning, articles et maintenance', false, 60),
  ('technicien', 'Technicien', 'Interventions assignées, documents terrain et comptes rendus', false, 70),
  ('secretariat', 'Secrétariat', 'Suivi administratif clients, devis et facturation', false, 80)
on conflict (code) do update set
  label = excluded.label,
  description = excluded.description,
  is_admin = excluded.is_admin,
  sort_order = excluded.sort_order;

-- Seed module permissions
insert into public.permissions (code, label, category) values
  ('module:Tableau de bord', 'Tableau de bord', 'module'),
  ('module:Prospects', 'Prospects', 'module'),
  ('module:Agenda commercial', 'Agenda commercial', 'module'),
  ('module:Clients', 'Clients', 'module'),
  ('module:Devis', 'Devis', 'module'),
  ('module:Factures', 'Factures', 'module'),
  ('module:Factures pro forma', 'Factures pro forma', 'module'),
  ('module:Demandes de chiffrage', 'Demandes de chiffrage', 'module'),
  ('module:Fournisseurs', 'Fournisseurs', 'module'),
  ('module:Planning', 'Planning', 'module'),
  ('module:Chantiers', 'Chantiers', 'module'),
  ('module:Équipes d’installation', 'Équipes d’installation', 'module'),
  ('module:Maintenance', 'Maintenance', 'module'),
  ('module:Photovoltaïque administratif', 'Photovoltaïque administratif', 'module'),
  ('module:Visites techniques', 'Visites techniques', 'module'),
  ('module:Gestion des articles', 'Gestion des articles', 'module'),
  ('module:Utilisateurs', 'Utilisateurs', 'module'),
  ('action:backup', 'Sauvegarde complète', 'action'),
  ('action:export_clients', 'Exporter les clients', 'action'),
  ('action:delete_appointment', 'Supprimer un rendez-vous', 'action'),
  ('action:manage_users', 'Gérer les utilisateurs', 'action'),
  ('action:invite_users', 'Inviter des utilisateurs', 'action'),
  ('action:delete_clients', 'Supprimer des clients', 'action'),
  ('action:view_all_clients', 'Voir tous les clients', 'action'),
  ('action:send_mail', 'Envoyer des emails', 'action')
on conflict (code) do update set
  label = excluded.label,
  category = excluded.category;

-- Helper: grant all permissions of category or list to a role
create or replace function public.rbac_grant(role_code text, permission_codes text[])
returns void
language plpgsql
as $$
begin
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.code = role_code
    and p.code = any (permission_codes)
  on conflict do nothing;
end;
$$;

-- Clear then reseed role_permissions for known roles (idempotent rebuild)
delete from public.role_permissions
where role_id in (select id from public.roles where code in (
  'admin_vip','admin_second','direction','responsable_commercial','commercial',
  'responsable_technique','technicien','secretariat'
));

-- Admin VIP: all permissions
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'admin_vip'
on conflict do nothing;

do $$
begin
  perform public.rbac_grant('admin_second', array[
    'module:Tableau de bord','module:Prospects','module:Agenda commercial','module:Clients','module:Devis','module:Factures',
    'module:Demandes de chiffrage','module:Fournisseurs','module:Planning','module:Chantiers','module:Équipes d’installation',
    'module:Maintenance','module:Photovoltaïque administratif','module:Visites techniques','module:Gestion des articles','module:Utilisateurs',
    'action:backup','action:export_clients','action:delete_appointment','action:manage_users','action:invite_users',
    'action:delete_clients','action:view_all_clients','action:send_mail'
  ]);

  perform public.rbac_grant('direction', array[
    'module:Tableau de bord','module:Prospects','module:Agenda commercial','module:Clients','module:Devis','module:Factures',
    'module:Planning','module:Gestion des articles',
    'action:view_all_clients','action:export_clients','action:send_mail'
  ]);

  perform public.rbac_grant('responsable_commercial', array[
    'module:Tableau de bord','module:Prospects','module:Agenda commercial','module:Clients','module:Devis','module:Planning',
    'module:Gestion des articles',
    'action:send_mail'
  ]);

  perform public.rbac_grant('commercial', array[
    'module:Tableau de bord','module:Prospects','module:Agenda commercial','module:Clients','module:Devis','module:Planning'
  ]);

  perform public.rbac_grant('responsable_technique', array[
    'module:Tableau de bord','module:Clients','module:Demandes de chiffrage','module:Fournisseurs','module:Planning',
    'module:Chantiers','module:Équipes d’installation','module:Maintenance','module:Gestion des articles',
    'action:send_mail'
  ]);

  perform public.rbac_grant('technicien', array[
    'module:Tableau de bord','module:Planning','module:Chantiers','module:Maintenance'
  ]);

  perform public.rbac_grant('secretariat', array[
    'module:Tableau de bord','module:Agenda commercial','module:Clients','module:Devis','module:Factures','module:Factures pro forma',
    'action:export_clients','action:view_all_clients'
  ]);
end $$;

-- Sync profiles.role → user_roles
create or replace function public.sync_user_role_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
begin
  select id into v_role_id from public.roles where label = new.role limit 1;
  if v_role_id is null then
    return new;
  end if;

  delete from public.user_roles where user_id = new.id;
  insert into public.user_roles (user_id, role_id, organization_id)
  values (new.id, v_role_id, coalesce(new.organization_id, '00000000-0000-0000-0000-000000000001'::uuid))
  on conflict (user_id, role_id) do update
    set organization_id = excluded.organization_id;

  return new;
end;
$$;

drop trigger if exists trg_sync_user_role_from_profile on public.profiles;
create trigger trg_sync_user_role_from_profile
  after insert or update of role, organization_id on public.profiles
  for each row execute function public.sync_user_role_from_profile();

-- Backfill existing profiles
insert into public.user_roles (user_id, role_id, organization_id)
select p.id, r.id, coalesce(p.organization_id, '00000000-0000-0000-0000-000000000001'::uuid)
from public.profiles p
join public.roles r on r.label = p.role
on conflict do nothing;

create or replace function public.user_has_permission(p_user_id uuid, p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions perm on perm.id = rp.permission_id
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = p_user_id
      and perm.code = p_permission_code
      and p.active = true
      and p.onboarding_completed_at is not null
  )
  or exists (
    select 1
    from public.profiles p
    join public.roles r on r.label = p.role
    where p.id = p_user_id
      and r.is_admin = true
      and p.active = true
      and p.onboarding_completed_at is not null
      and p_permission_code like 'module:%'
  );
$$;

create or replace function public.is_admin_role(role_name text)
returns boolean
language sql
immutable
as $$
  select role_name in ('Admin VIP', 'Admin second');
$$;

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;

drop policy if exists roles_select_authenticated on public.roles;
create policy roles_select_authenticated on public.roles
  for select to authenticated using (true);

drop policy if exists permissions_select_authenticated on public.permissions;
create policy permissions_select_authenticated on public.permissions
  for select to authenticated using (true);

drop policy if exists role_permissions_select_authenticated on public.role_permissions;
create policy role_permissions_select_authenticated on public.role_permissions
  for select to authenticated using (true);

drop policy if exists user_roles_select_own_or_admin on public.user_roles;
create policy user_roles_select_own_or_admin on public.user_roles
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles admin
      where admin.id = auth.uid()
        and public.is_admin_role(admin.role)
        and admin.organization_id = user_roles.organization_id
        and admin.active = true
        and admin.onboarding_completed_at is not null
    )
  );

grant all on table public.roles to service_role;
grant all on table public.permissions to service_role;
grant all on table public.role_permissions to service_role;
grant all on table public.user_roles to service_role;
grant select on table public.roles to authenticated;
grant select on table public.permissions to authenticated;
grant select on table public.role_permissions to authenticated;
grant select on table public.user_roles to authenticated;
grant execute on function public.user_has_permission(uuid, text) to authenticated;
grant execute on function public.user_has_permission(uuid, text) to service_role;
grant execute on function public.rbac_grant(text, text[]) to service_role;
