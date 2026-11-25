-- Ordre commercial du picker devis / facture :
-- Chauffage, Climatisation, Ballon d’eau chaude, Photovoltaïque, VMC, Isolation, Autre.

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

-- Renommer « Chauffage électrique » vers « Chauffage » s’il n’existe pas déjà.
update public.article_categories c
set
  name = 'Chauffage',
  slug = 'chauffage',
  icon = coalesce(nullif(c.icon, ''), 'Flame'),
  description = coalesce(c.description, 'PAC, radiateurs et chauffage électrique'),
  sort_order = 10,
  updated_at = now()
where lower(c.name) in ('chauffage électrique', 'chauffage electrique')
  and not exists (
    select 1 from public.article_categories o
    where o.organization_id = c.organization_id
      and lower(o.name) = 'chauffage'
  );

-- Si les deux existent, rattacher les articles et sous-catégories puis retirer l’ancien nom.
update public.article_subcategories s
set category_id = c_new.id, updated_at = now()
from public.article_categories c_old
join public.article_categories c_new
  on c_new.organization_id = c_old.organization_id
 and lower(c_new.name) = 'chauffage'
where s.category_id = c_old.id
  and lower(c_old.name) in ('chauffage électrique', 'chauffage electrique');

update public.articles a
set
  category_id = c_new.id,
  categorie = 'Chauffage',
  updated_at = now()
from public.article_categories c_old
join public.article_categories c_new
  on c_new.organization_id = c_old.organization_id
 and lower(c_new.name) = 'chauffage'
where a.category_id = c_old.id
  and lower(c_old.name) in ('chauffage électrique', 'chauffage electrique');

delete from public.article_categories c
where lower(c.name) in ('chauffage électrique', 'chauffage electrique')
  and not exists (select 1 from public.article_subcategories s where s.category_id = c.id)
  and not exists (select 1 from public.articles a where a.category_id = c.id);

-- Rattacher la famille PAC au chauffage (sous-catégories + articles).
update public.article_subcategories s
set
  name = case
    when lower(s.name) in ('air/eau', 'air / eau') then 'Pompe à chaleur air/eau'
    when lower(s.name) in ('air/air', 'air / air') then 'Pompe à chaleur air/air'
    else s.name
  end,
  updated_at = now()
from public.article_categories c_pac
where s.category_id = c_pac.id
  and lower(c_pac.name) = 'pompe à chaleur';

update public.article_subcategories s
set category_id = c_heat.id, updated_at = now()
from public.article_categories c_pac
join public.article_categories c_heat
  on c_heat.organization_id = c_pac.organization_id
 and lower(c_heat.name) = 'chauffage'
where s.category_id = c_pac.id
  and lower(c_pac.name) = 'pompe à chaleur'
  and not exists (
    select 1 from public.article_subcategories other
    where other.organization_id = s.organization_id
      and other.category_id = c_heat.id
      and lower(other.name) = lower(s.name)
  );

insert into public.article_subcategories (organization_id, category_id, name, sort_order)
select c.organization_id, c.id, v.name, v.sort_order
from public.article_categories c
join (values
  ('Pompe à chaleur', 10),
  ('Radiateur électrique', 20),
  ('Chaudière gaz', 30),
  ('Autre', 40)
) as v(name, sort_order) on lower(c.name) = 'chauffage'
where not exists (
  select 1 from public.article_subcategories s
  where s.organization_id = c.organization_id
    and s.category_id = c.id
    and lower(s.name) = lower(v.name)
);

insert into public.article_subcategories (organization_id, category_id, name, sort_order)
select c.organization_id, c.id, v.name, v.sort_order
from public.article_categories c
join (values
  ('VMC', 'VMC simple flux', 10),
  ('VMC', 'VMC double flux', 20),
  ('Isolation', 'Isolation des combles', 10),
  ('Isolation', 'Isolation des rampants', 20),
  ('Isolation', 'Isolation extérieure', 30),
  ('Isolation', 'Isolation intérieure', 40),
  ('Ballon d’eau chaude', 'Ballon thermodynamique', 10),
  ('Ballon d’eau chaude', 'Ballon électrique', 20)
) as v(category, name, sort_order) on lower(c.name) = lower(v.category)
where not exists (
  select 1 from public.article_subcategories s
  where s.organization_id = c.organization_id
    and s.category_id = c.id
    and lower(s.name) = lower(v.name)
);

update public.articles a
set
  category_id = c_heat.id,
  categorie = 'Chauffage',
  updated_at = now()
from public.article_categories c_pac
join public.article_categories c_heat
  on c_heat.organization_id = c_pac.organization_id
 and lower(c_heat.name) = 'chauffage'
where a.organization_id = c_pac.organization_id
  and lower(c_pac.name) = 'pompe à chaleur'
  and (
    a.category_id = c_pac.id
    or lower(trim(coalesce(a.categorie, ''))) = 'pompe à chaleur'
  );

delete from public.article_categories c
where lower(c.name) = 'pompe à chaleur'
  and not exists (select 1 from public.article_subcategories s where s.category_id = c.id)
  and not exists (select 1 from public.articles a where a.category_id = c.id);

update public.article_categories
set sort_order = case lower(name)
  when 'chauffage' then 10
  when 'climatisation' then 20
  when 'ballon d’eau chaude' then 30
  when 'ballon d''eau chaude' then 30
  when 'photovoltaïque' then 40
  when 'photovoltaique' then 40
  when 'vmc' then 50
  when 'isolation' then 60
  when 'autre' then 70
  else greatest(sort_order, 80)
end,
    updated_at = now()
where lower(name) in (
  'chauffage',
  'climatisation',
  'ballon d’eau chaude',
  'ballon d''eau chaude',
  'photovoltaïque',
  'photovoltaique',
  'vmc',
  'isolation',
  'autre'
);
