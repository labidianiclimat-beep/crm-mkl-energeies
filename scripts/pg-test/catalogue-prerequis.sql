-- Préparation du catalogue lu par trois migrations historiques.
--
-- 20261015_aquarea_m.sql et 20261015_zubadan_23.sql ne créent pas les lignes
-- qu'elles réutilisent : une fourniture et une installation déjà posées dans
-- un groupe « pompe à chaleur », et, pour Zubadan, une marque Mitsubishi.
-- Aucune migration antérieure ne les crée. Ce fichier les ajoute sans
-- modifier ces migrations, et sans créer de modèle Panasonic ni Mitsubishi.
--
-- Références déjà utilisées par le CRM :
--   FRN-PAC-RO  Fournitures pour pompe à chaleur RO
--   INST-PAC-RO Installations pour pompe à chaleur RO
--   Mitsubishi Electric, nom écrit dans 20261015_zubadan_23.sql
--
-- Prix à 0 : aucun tarif n'est versionné pour ces deux lignes.
-- Le fichier est idempotent et ne réécrit pas une ligne déjà présente.

do $$
declare
  v_org uuid;
  v_cat_id uuid;
  v_sub_id uuid;
  v_supply_id uuid;
  v_labor_id uuid;
begin
  select a.organization_id
    into v_org
  from public.articles a
  group by a.organization_id
  order by count(*) desc
  limit 1;

  if v_org is null then
    select o.id
      into v_org
    from public.organizations o
    where o.id = '00000000-0000-0000-0000-000000000001';
  end if;

  if v_org is null then
    raise exception 'Organisation introuvable pour la préparation du catalogue.';
  end if;

  select c.id, s.id
    into v_cat_id, v_sub_id
  from public.article_categories c
  join public.article_subcategories s
    on s.category_id = c.id
   and s.organization_id = c.organization_id
  where c.organization_id = v_org
    and lower(c.name) = 'chauffage'
    and lower(translate(s.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) = 'pompe a chaleur'
  limit 1;

  if v_sub_id is null then
    raise exception 'Dossier Chauffage / Pompe à chaleur introuvable.';
  end if;

  if not exists (
    select 1
    from public.article_brands b
    where b.organization_id = v_org
      and b.actif is not false
      and lower(b.name) like '%mitsubishi%'
  ) then
    insert into public.article_brands (organization_id, name, actif)
    values (v_org, 'Mitsubishi Electric', true);
  end if;

  insert into public.articles (
    organization_id, reference, designation, description,
    categorie, sous_categorie, category_id, subcategory_id,
    prix_achat_ht, prix_vente_ht, taux_tva, unite, actif, source_reference, updated_at
  )
  select
    v_org, v.reference, v.designation, v.designation,
    'Chauffage', 'Pompe à chaleur', v_cat_id, v_sub_id,
    0, 0, 5.5, 'Forfait', true, v.source_reference, now()
  from (
    values
      ('FRN-PAC-RO', 'Fournitures pour pompe à chaleur RO', 'catalogue:fourniture-pac-ro'),
      ('INST-PAC-RO', 'Installations pour pompe à chaleur RO', 'catalogue:installation-pac-ro')
  ) as v(reference, designation, source_reference)
  where not exists (
    select 1
    from public.articles a
    where a.organization_id = v_org
      and lower(a.reference) = lower(v.reference)
  );

  select a.id into v_supply_id
  from public.articles a
  where a.organization_id = v_org and lower(a.reference) = 'frn-pac-ro'
  limit 1;

  select a.id into v_labor_id
  from public.articles a
  where a.organization_id = v_org and lower(a.reference) = 'inst-pac-ro'
  limit 1;

  if v_supply_id is null or v_labor_id is null or v_supply_id = v_labor_id then
    raise exception 'Les lignes FRN-PAC-RO et INST-PAC-RO n''ont pas pu être préparées.';
  end if;

  if not exists (
    select 1
    from public.article_bundles b
    where b.organization_id = v_org
      and b.actif is not false
      and lower(translate(coalesce(b.category, '') || ' ' || coalesce(b.subcategory, '') || ' ' || coalesce(b.family, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%pompe%chaleur%'
      and exists (
        select 1
        from jsonb_array_elements(coalesce(b.items, '[]'::jsonb)) i
        where i->>'articleId' = v_supply_id::text and i->>'role' = 'supply'
      )
      and exists (
        select 1
        from jsonb_array_elements(coalesce(b.items, '[]'::jsonb)) i
        where i->>'articleId' = v_labor_id::text and i->>'role' = 'labor'
      )
  ) then
    insert into public.article_bundles (
      organization_id, name, category, subcategory, family, items, actif, updated_at
    ) values (
      v_org,
      'Fourniture et installation pompe à chaleur',
      'Chauffage',
      'Pompe à chaleur',
      'Pompe à chaleur',
      jsonb_build_array(
        jsonb_build_object(
          'articleId', v_supply_id,
          'code', 'FRN-PAC-RO',
          'name', 'Fournitures pour pompe à chaleur RO',
          'category', 'Chauffage',
          'subcategory', 'Pompe à chaleur',
          'qty', 1,
          'price', 0,
          'buy', 0,
          'tax', 5.5,
          'unit', 'Forfait',
          'role', 'supply'
        ),
        jsonb_build_object(
          'articleId', v_labor_id,
          'code', 'INST-PAC-RO',
          'name', 'Installations pour pompe à chaleur RO',
          'category', 'Chauffage',
          'subcategory', 'Pompe à chaleur',
          'qty', 1,
          'price', 0,
          'buy', 0,
          'tax', 5.5,
          'unit', 'Forfait',
          'role', 'labor'
        )
      ),
      true,
      now()
    );
  end if;
end $$;
