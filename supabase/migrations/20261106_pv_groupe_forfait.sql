-- Groupe photovoltaïque : tarif unique saisi, sans prix ligne par ligne.

alter table public.article_bundles
  add column if not exists pricing_mode text not null default 'detail',
  add column if not exists forfait_ht numeric,
  add column if not exists forfait_tva numeric;

alter table public.article_bundles
  drop constraint if exists article_bundles_pricing_mode_chk;

alter table public.article_bundles
  add constraint article_bundles_pricing_mode_chk
  check (pricing_mode in ('detail', 'forfait'));

alter table public.devis_lignes
  add column if not exists forfait boolean not null default false,
  add column if not exists forfait_montant_ht numeric;
