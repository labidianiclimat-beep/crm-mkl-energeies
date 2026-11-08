-- Renomme le profil Admin second en Superadmin.
-- Le code RBAC reste admin_second. L’ancien libellé reste accepté par les helpers RLS.

update public.roles
set
  label = 'Superadmin',
  description = 'Administration courante sans gestion de l’Admin VIP'
where code = 'admin_second' or label = 'Admin second';

update public.profiles
set role = 'Superadmin'
where role = 'Admin second';

create or replace function public.is_admin_role(role_name text)
returns boolean
language sql
immutable
as $$
  select role_name in ('Admin VIP', 'Admin second', 'Superadmin');
$$;

create or replace function public.can_view_all_org_clients(role_name text)
returns boolean
language sql
immutable
as $$
  select role_name in ('Admin VIP', 'Admin second', 'Superadmin', 'Direction', 'Secrétariat');
$$;

create or replace function public.can_manage_devis(role_name text, modules text[])
returns boolean
language sql
immutable
as $$
  select role_name in ('Admin VIP', 'Admin second', 'Superadmin', 'Responsable commercial', 'Direction')
    or 'Devis' = any (coalesce(modules, '{}'::text[]))
    or 'Factures' = any (coalesce(modules, '{}'::text[]))
    or 'Factures pro forma' = any (coalesce(modules, '{}'::text[]));
$$;

create or replace function public.can_manage_articles(role_name text, modules text[])
returns boolean
language sql
immutable
as $$
  select role_name in ('Admin VIP', 'Admin second', 'Superadmin', 'Responsable commercial', 'Responsable technique', 'Direction')
    or 'Gestion des articles' = any (coalesce(modules, '{}'::text[]));
$$;

drop policy if exists activity_logs_select_admin on public.activity_logs;
create policy activity_logs_select_admin on public.activity_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.organization_id = activity_logs.organization_id
        and p.role in ('Admin VIP', 'Admin second', 'Superadmin', 'Direction')
    )
  );
