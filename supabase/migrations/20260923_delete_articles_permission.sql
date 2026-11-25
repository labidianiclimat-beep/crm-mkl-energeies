insert into public.permissions (code, label, category) values
  ('action:delete_articles', 'Supprimer des articles', 'action')
on conflict (code) do update set
  label = excluded.label,
  category = excluded.category;
