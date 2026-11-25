-- Fiche technique liée à un article (PAC) : nom + fichier encodé
alter table public.articles add column if not exists fiche_nom text;
alter table public.articles add column if not exists fiche_data text;
