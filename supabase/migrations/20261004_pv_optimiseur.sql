-- Photovoltaïque : sous-catégorie Optimiseur, juste avant la main-d’œuvre (installation).

insert into public.article_subcategories (organization_id, category_id, name, sort_order)
select c.organization_id, c.id, 'Optimiseur', 35
from public.article_categories c
where lower(c.name) = 'photovoltaïque'
  and not exists (
    select 1 from public.article_subcategories s
    where s.category_id = c.id
      and lower(s.name) in ('optimiseur', 'optimiseurs')
  );
