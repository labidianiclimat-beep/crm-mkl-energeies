-- Climatisation : Fourniture et Installation à côté des splits.

insert into public.article_subcategories (organization_id, category_id, name, sort_order)
select c.organization_id, c.id, 'Fourniture', 80
from public.article_categories c
where lower(c.name) = 'climatisation'
  and not exists (
    select 1 from public.article_subcategories s
    where s.category_id = c.id
      and lower(s.name) in ('fourniture', 'fournitures')
  );

insert into public.article_subcategories (organization_id, category_id, name, sort_order)
select c.organization_id, c.id, 'Installation', 81
from public.article_categories c
where lower(c.name) = 'climatisation'
  and not exists (
    select 1 from public.article_subcategories s
    where s.category_id = c.id
      and lower(s.name) in ('installation', 'pose')
  );
