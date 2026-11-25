-- Groupes d’articles partagés (catalogue devis)
-- Safe to re-run

create extension if not exists pgcrypto;

create table if not exists public.article_bundles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  name text not null,
  category text not null default '',
  subcategory text,
  brand text,
  family text,
  items jsonb not null default '[]'::jsonb,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists article_bundles_org_idx
  on public.article_bundles (organization_id);
create index if not exists article_bundles_actif_idx
  on public.article_bundles (organization_id, actif);
create index if not exists article_bundles_path_idx
  on public.article_bundles (organization_id, category, subcategory);

alter table public.article_bundles enable row level security;

drop policy if exists article_bundles_select on public.article_bundles;
create policy article_bundles_select on public.article_bundles
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = article_bundles.organization_id
        and public.can_read_articles(p.role, p.modules)
    )
  );

drop policy if exists article_bundles_insert on public.article_bundles;
create policy article_bundles_insert on public.article_bundles
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = article_bundles.organization_id
        and public.can_manage_articles(p.role, p.modules)
    )
  );

drop policy if exists article_bundles_update on public.article_bundles;
create policy article_bundles_update on public.article_bundles
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = article_bundles.organization_id
        and public.can_manage_articles(p.role, p.modules)
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = article_bundles.organization_id
        and public.can_manage_articles(p.role, p.modules)
    )
  );

drop policy if exists article_bundles_delete on public.article_bundles;
create policy article_bundles_delete on public.article_bundles
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = article_bundles.organization_id
        and public.can_manage_articles(p.role, p.modules)
    )
  );

grant all on table public.article_bundles to service_role;
grant select, insert, update, delete on table public.article_bundles to authenticated;
