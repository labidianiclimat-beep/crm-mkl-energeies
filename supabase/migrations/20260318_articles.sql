-- Articles CRM — catalogue unique pour devis
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS)

create extension if not exists pgcrypto;

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  reference text not null,
  designation text not null,
  description text,
  description_technique text,
  categorie text not null default 'Autre',
  sous_categorie text,
  marque text,
  prix_achat_ht numeric(12,2) not null default 0,
  prix_vente_ht numeric(12,2) not null default 0,
  taux_tva numeric(5,2) not null default 20,
  unite text not null default 'Unité',
  actif boolean not null default true,
  power_w numeric(12,2),
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create unique index if not exists articles_org_reference_uidx
  on public.articles (organization_id, lower(reference));

create index if not exists articles_org_idx on public.articles (organization_id);
create index if not exists articles_categorie_idx on public.articles (organization_id, categorie);
create index if not exists articles_actif_idx on public.articles (organization_id, actif);
create index if not exists articles_marque_idx on public.articles (organization_id, lower(marque));

create or replace function public.can_manage_articles(role_name text, modules text[])
returns boolean
language sql
immutable
as $$
  select role_name in ('Admin VIP', 'Admin second', 'Responsable commercial', 'Responsable technique', 'Direction')
    or 'Gestion des articles' = any (coalesce(modules, '{}'::text[]));
$$;

create or replace function public.can_read_articles(role_name text, modules text[])
returns boolean
language sql
immutable
as $$
  select public.can_manage_articles(role_name, modules)
    or 'Devis' = any (coalesce(modules, '{}'::text[]))
    or 'Factures' = any (coalesce(modules, '{}'::text[]))
    or 'Factures pro forma' = any (coalesce(modules, '{}'::text[]))
    or 'Demandes de chiffrage' = any (coalesce(modules, '{}'::text[]));
$$;

alter table public.articles enable row level security;

drop policy if exists articles_select on public.articles;
create policy articles_select on public.articles
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = articles.organization_id
        and public.can_read_articles(p.role, p.modules)
    )
  );

drop policy if exists articles_insert on public.articles;
create policy articles_insert on public.articles
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = articles.organization_id
        and public.can_manage_articles(p.role, p.modules)
    )
  );

drop policy if exists articles_update on public.articles;
create policy articles_update on public.articles
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = articles.organization_id
        and public.can_manage_articles(p.role, p.modules)
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = articles.organization_id
        and public.can_manage_articles(p.role, p.modules)
    )
  );

drop policy if exists articles_delete on public.articles;
create policy articles_delete on public.articles
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = articles.organization_id
        and public.is_admin_role(p.role)
    )
  );

grant all on table public.articles to service_role;
grant select, insert, update, delete on table public.articles to authenticated;
