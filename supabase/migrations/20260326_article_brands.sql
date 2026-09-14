-- Marques catalogue (logo + liste déroulante à la création d’article)
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS)

create extension if not exists pgcrypto;

create table if not exists public.article_brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  name text not null,
  logo_url text,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create unique index if not exists article_brands_org_name_uidx
  on public.article_brands (organization_id, lower(name));

create index if not exists article_brands_org_idx on public.article_brands (organization_id);
create index if not exists article_brands_actif_idx on public.article_brands (organization_id, actif);

alter table public.articles
  add column if not exists brand_id uuid references public.article_brands (id) on delete set null;

create index if not exists articles_brand_id_idx on public.articles (brand_id);

-- Seed from existing article marques (no logo yet)
insert into public.article_brands (organization_id, name, actif)
select distinct a.organization_id, trim(a.marque), true
from public.articles a
where a.marque is not null
  and trim(a.marque) <> ''
  and not exists (
    select 1
    from public.article_brands b
    where b.organization_id = a.organization_id
      and lower(b.name) = lower(trim(a.marque))
  );

-- Link articles to seeded brands when names match
update public.articles a
set brand_id = b.id
from public.article_brands b
where a.brand_id is null
  and a.organization_id = b.organization_id
  and a.marque is not null
  and lower(trim(a.marque)) = lower(b.name);

alter table public.article_brands enable row level security;

drop policy if exists article_brands_select on public.article_brands;
create policy article_brands_select on public.article_brands
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = article_brands.organization_id
        and public.can_read_articles(p.role, p.modules)
    )
  );

drop policy if exists article_brands_insert on public.article_brands;
create policy article_brands_insert on public.article_brands
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = article_brands.organization_id
        and public.can_manage_articles(p.role, p.modules)
    )
  );

drop policy if exists article_brands_update on public.article_brands;
create policy article_brands_update on public.article_brands
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = article_brands.organization_id
        and public.can_manage_articles(p.role, p.modules)
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = article_brands.organization_id
        and public.can_manage_articles(p.role, p.modules)
    )
  );

drop policy if exists article_brands_delete on public.article_brands;
create policy article_brands_delete on public.article_brands
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = article_brands.organization_id
        and public.is_admin_role(p.role)
    )
  );

grant all on table public.article_brands to service_role;
grant select, insert, update, delete on table public.article_brands to authenticated;
