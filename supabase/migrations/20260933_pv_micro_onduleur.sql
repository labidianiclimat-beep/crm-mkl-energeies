-- Photovoltaïque : sous-catégorie Micro-onduleur, distincte des onduleurs.

insert into public.article_subcategories (organization_id, category_id, name, sort_order)
select c.organization_id, c.id, 'Micro-onduleur', 25
from public.article_categories c
where lower(c.name) = 'photovoltaïque'
  and not exists (
    select 1 from public.article_subcategories s
    where s.category_id = c.id
      and lower(s.name) in ('micro-onduleur', 'micro-onduleurs', 'micro onduleur')
  );
