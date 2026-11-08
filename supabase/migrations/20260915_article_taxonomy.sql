-- Catalogue devis : catégories et sous-catégories en base.
-- Réutilise articles + article_brands. N’écrase aucune donnée.

create table if not exists public.article_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  name text not null,
  slug text,
  description text,
  icon text,
  sort_order integer not null default 100,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create unique index if not exists article_categories_org_name_uidx
  on public.article_categories (organization_id, lower(name));

create table if not exists public.article_subcategories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  category_id uuid not null references public.article_categories (id) on delete cascade,
  name text not null,
  slug text,
  description text,
  sort_order integer not null default 100,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create unique index if not exists article_subcategories_org_name_uidx
  on public.article_subcategories (organization_id, category_id, lower(name));

alter table public.articles
  add column if not exists category_id uuid references public.article_categories (id) on delete set null;
alter table public.articles
  add column if not exists subcategory_id uuid references public.article_subcategories (id) on delete set null;

create index if not exists articles_category_id_idx on public.articles (category_id);
create index if not exists articles_subcategory_id_idx on public.articles (subcategory_id);

alter table public.article_categories enable row level security;
alter table public.article_subcategories enable row level security;

drop policy if exists article_categories_select on public.article_categories;
create policy article_categories_select on public.article_categories
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.organization_id = article_categories.organization_id
        and public.can_read_articles(p.role, p.modules)
    )
  );

drop policy if exists article_categories_write on public.article_categories;
create policy article_categories_write on public.article_categories
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.organization_id = article_categories.organization_id
        and public.can_manage_articles(p.role, p.modules)
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.organization_id = article_categories.organization_id
        and public.can_manage_articles(p.role, p.modules)
    )
  );

drop policy if exists article_subcategories_select on public.article_subcategories;
create policy article_subcategories_select on public.article_subcategories
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.organization_id = article_subcategories.organization_id
        and public.can_read_articles(p.role, p.modules)
    )
  );

drop policy if exists article_subcategories_write on public.article_subcategories;
create policy article_subcategories_write on public.article_subcategories
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.organization_id = article_subcategories.organization_id
        and public.can_manage_articles(p.role, p.modules)
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.organization_id = article_subcategories.organization_id
        and public.can_manage_articles(p.role, p.modules)
    )
  );

grant all on table public.article_categories to service_role;
grant all on table public.article_subcategories to service_role;
grant select, insert, update, delete on table public.article_categories to authenticated;
grant select, insert, update, delete on table public.article_subcategories to authenticated;

-- Seed familles commerciales (idempotent)
insert into public.article_categories (organization_id, name, slug, description, icon, sort_order)
select org.id, v.name, v.slug, v.description, v.icon, v.sort_order
from public.organizations org
cross join (values
  ('Chauffage', 'chauffage', 'PAC, radiateurs et chauffage électrique', 'Flame', 10),
  ('Climatisation', 'climatisation', 'Splits, multi-splits, unités intérieures et consoles basses', 'Snowflake', 20),
  ('Ballon d’eau chaude', 'ballon-eau-chaude', 'Ballons thermodynamiques et électriques', 'Droplets', 30),
  ('Photovoltaïque', 'photovoltaique', 'Panneaux, onduleurs et pose PV', 'Sun', 40),
  ('VMC', 'vmc', 'Ventilation mécanique contrôlée', 'Wind', 50),
  ('Isolation', 'isolation', 'Isolation intérieure et extérieure', 'Home', 60),
  ('Autre', 'autre', 'Autres familles de produits', 'Package', 70)
) as v(name, slug, description, icon, sort_order)
where not exists (
  select 1 from public.article_categories c
  where c.organization_id = org.id and lower(c.name) = lower(v.name)
);

insert into public.article_subcategories (organization_id, category_id, name, sort_order)
select c.organization_id, c.id, v.name, v.sort_order
from public.article_categories c
join (values
  ('Climatisation', 'Mono-split', 10),
  ('Climatisation', 'Bi-split', 20),
  ('Climatisation', 'Tri-split', 30),
  ('Climatisation', 'Quadri-split', 40),
  ('Climatisation', '5 unités', 50),
  ('Climatisation', 'Unités intérieures', 55),
  ('Climatisation', 'Console basse', 60),
  ('Climatisation', 'Gainable', 70),
  ('Chauffage', 'Pompe à chaleur', 10),
  ('Chauffage', 'Radiateur électrique', 20),
  ('Chauffage', 'Chaudière gaz', 30),
  ('Chauffage', 'Autre', 40),
  ('Isolation', 'Isolation des combles', 10),
  ('Isolation', 'Isolation des rampants', 20),
  ('Isolation', 'Isolation extérieure', 30),
  ('Isolation', 'Isolation intérieure', 40),
  ('Ballon d’eau chaude', 'Ballon thermodynamique', 10),
  ('Ballon d’eau chaude', 'Ballon électrique', 20),
  ('Photovoltaïque', 'Panneaux', 10),
  ('Photovoltaïque', 'Onduleurs', 20),
  ('Photovoltaïque', 'Batteries', 30),
  ('Photovoltaïque', 'Main-d’œuvre', 40),
  ('VMC', 'VMC simple flux', 10),
  ('VMC', 'VMC double flux', 20)
) as v(category, name, sort_order) on lower(c.name) = lower(v.category)
where not exists (
  select 1 from public.article_subcategories s
  where s.organization_id = c.organization_id
    and s.category_id = c.id
    and lower(s.name) = lower(v.name)
);

-- Reprendre les catégories déjà utilisées sur les articles
insert into public.article_categories (organization_id, name, slug, sort_order)
select distinct a.organization_id, trim(a.categorie), null, 80
from public.articles a
where a.categorie is not null and trim(a.categorie) <> ''
  and not exists (
    select 1 from public.article_categories c
    where c.organization_id = a.organization_id
      and lower(c.name) = lower(trim(a.categorie))
  );

insert into public.article_subcategories (organization_id, category_id, name, sort_order)
select distinct a.organization_id, c.id, trim(a.sous_categorie), 80
from public.articles a
join public.article_categories c
  on c.organization_id = a.organization_id
 and lower(c.name) = lower(trim(a.categorie))
where a.sous_categorie is not null and trim(a.sous_categorie) <> ''
  and not exists (
    select 1 from public.article_subcategories s
    where s.organization_id = a.organization_id
      and s.category_id = c.id
      and lower(s.name) = lower(trim(a.sous_categorie))
  );

update public.articles a
set category_id = c.id
from public.article_categories c
where a.category_id is null
  and a.organization_id = c.organization_id
  and a.categorie is not null
  and lower(trim(a.categorie)) = lower(c.name);

update public.articles a
set subcategory_id = s.id
from public.article_subcategories s
where a.subcategory_id is null
  and a.organization_id = s.organization_id
  and a.category_id = s.category_id
  and a.sous_categorie is not null
  and lower(trim(a.sous_categorie)) = lower(s.name);
