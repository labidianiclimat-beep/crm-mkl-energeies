-- Climatisation : Unités intérieures + Console → Console basse.

update public.article_subcategories s
set name = 'Console basse', updated_at = now()
from public.article_categories c
where s.category_id = c.id
  and lower(c.name) = 'climatisation'
  and lower(s.name) = 'console';

update public.articles a
set sous_categorie = 'Console basse', updated_at = now()
from public.article_categories c
where a.category_id = c.id
  and lower(c.name) = 'climatisation'
  and lower(coalesce(a.sous_categorie, '')) = 'console';

insert into public.article_subcategories (organization_id, category_id, name, sort_order)
select c.organization_id, c.id, 'Unités intérieures', 55
from public.article_categories c
where lower(c.name) = 'climatisation'
  and not exists (
    select 1 from public.article_subcategories s
    where s.category_id = c.id
      and lower(s.name) in ('unités intérieures', 'unites interieures', 'unité intérieure')
  );
