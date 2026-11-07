-- Photovoltaïque : sous-catégorie Petites fournitures, juste avant la main-d’œuvre.

insert into public.article_subcategories (organization_id, category_id, name, description, sort_order)
select c.organization_id, c.id, 'Petites fournitures', 'Câbles, connecteurs et accessoires', 38
from public.article_categories c
where lower(c.name) = 'photovoltaïque'
  and not exists (
    select 1 from public.article_subcategories s
    where s.category_id = c.id
      and lower(s.name) in ('petites fournitures', 'petite fourniture')
  );
