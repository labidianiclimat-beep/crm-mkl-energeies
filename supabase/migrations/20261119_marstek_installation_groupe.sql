-- Batterie MARSTEK VENUS-E : installation à 550,00 € TTC, TVA 20 % sur la batterie et sur la pose.
-- Total du groupe : 5 000,00 € TTC. La batterie porte le centime d’arrondi (4 450,01 € TTC).

do $$
declare
  v_org uuid := '00000000-0000-0000-0000-000000000001';
  v_battery_id uuid;
  v_labor_id uuid;
  v_bundle_id uuid;
  v_battery record;
  v_labor_desc text;
  v_battery_ht numeric(12,2);
  v_labor_ht numeric(12,2) := 458.33;
  v_principal jsonb;
  v_labor_item jsonb;
begin
  v_labor_desc := 'Installation de batterie Marstek.' || E'\n'
    || 'Pose et fixation de la batterie Marstek VENUS-E 5 kW, raccordement électrique, paramétrage, mise en service et contrôle du fonctionnement.';

  select a.*
    into v_battery
  from public.articles a
  where a.organization_id = v_org
    and lower(a.reference) = 'marstek-venus-e';

  if v_battery.id is null then
    raise exception 'Article MARSTEK-VENUS-E introuvable. Rien n''a été enregistré.';
  end if;

  if v_battery.prix_vente_ht in (4739.34, 4281.01, 3708.34) then
    v_battery_ht := 3708.34;
  else
    raise exception 'Prix batterie inattendu (%). Rien n''a été enregistré.', v_battery.prix_vente_ht;
  end if;

  if exists (
    select 1 from public.articles a
    where a.organization_id = v_org
      and lower(a.reference) = 'inst-bat-marstek'
      and a.id is distinct from v_battery.id
      and coalesce(a.source_reference, '') not in ('', 'catalogue:installation-batterie-marstek')
      and lower(translate(coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like 'installation de batterie marstek%'
  ) then
    raise exception 'La référence INST-BAT-MARSTEK existe déjà pour un autre article. Rien n''a été enregistré.';
  end if;

  update public.articles
  set prix_vente_ht = v_battery_ht,
      taux_tva = 20,
      updated_at = now()
  where id = v_battery.id;

  v_battery_id := v_battery.id;

  select a.id into v_labor_id
  from public.articles a
  where a.organization_id = v_org
    and (
      lower(a.reference) = 'inst-bat-marstek'
      or a.source_reference = 'catalogue:installation-batterie-marstek'
    )
  order by case when lower(a.reference) = 'inst-bat-marstek' then 0 else 1 end
  limit 1;

  if v_labor_id is null then
    insert into public.articles (
      organization_id, reference, designation, description,
      categorie, sous_categorie, category_id, subcategory_id,
      marque, brand_id, prix_achat_ht, prix_vente_ht, taux_tva,
      unite, actif, source_reference, updated_at
    ) values (
      v_org, 'INST-BAT-MARSTEK', 'Installation de batterie Marstek', v_labor_desc,
      v_battery.categorie, v_battery.sous_categorie, v_battery.category_id, v_battery.subcategory_id,
      v_battery.marque, v_battery.brand_id, 0, v_labor_ht, 20,
      'Forfait', true, 'catalogue:installation-batterie-marstek', now()
    )
    returning id into v_labor_id;
  else
    update public.articles
    set reference = 'INST-BAT-MARSTEK',
        designation = 'Installation de batterie Marstek',
        description = v_labor_desc,
        categorie = v_battery.categorie,
        sous_categorie = v_battery.sous_categorie,
        category_id = v_battery.category_id,
        subcategory_id = v_battery.subcategory_id,
        marque = v_battery.marque,
        brand_id = v_battery.brand_id,
        prix_achat_ht = 0,
        prix_vente_ht = v_labor_ht,
        taux_tva = 20,
        unite = 'Forfait',
        source_reference = 'catalogue:installation-batterie-marstek',
        actif = true,
        updated_at = now()
    where id = v_labor_id;
  end if;

  v_principal := jsonb_build_object(
    'articleId', v_battery_id,
    'code', v_battery.reference,
    'name', v_battery.designation,
    'description', coalesce(v_battery.description, ''),
    'category', coalesce(v_battery.categorie, ''),
    'subcategory', coalesce(v_battery.sous_categorie, ''),
    'brand', coalesce(v_battery.marque, ''),
    'brandId', v_battery.brand_id,
    'sourceReference', coalesce(v_battery.source_reference, ''),
    'qty', 1,
    'price', v_battery_ht,
    'buy', coalesce(v_battery.prix_achat_ht, 0),
    'tax', 20,
    'unit', coalesce(nullif(v_battery.unite, ''), 'Unité'),
    'role', 'principal'
  );

  v_labor_item := jsonb_build_object(
    'articleId', v_labor_id,
    'code', 'INST-BAT-MARSTEK',
    'name', 'Installation de batterie Marstek',
    'description', v_labor_desc,
    'category', coalesce(v_battery.categorie, ''),
    'subcategory', coalesce(v_battery.sous_categorie, ''),
    'brand', coalesce(v_battery.marque, ''),
    'brandId', v_battery.brand_id,
    'sourceReference', 'catalogue:installation-batterie-marstek',
    'qty', 1,
    'price', v_labor_ht,
    'buy', 0,
    'tax', 20,
    'unit', 'Forfait',
    'role', 'labor'
  );

  select b.id
    into v_bundle_id
  from public.article_bundles b
  where b.organization_id = v_org
    and (
      exists (
        select 1
        from jsonb_array_elements(coalesce(b.items, '[]'::jsonb)) elem
        where elem->>'articleId' = v_battery_id::text
          and coalesce(elem->>'role', 'principal') = 'principal'
      )
      or lower(b.name) = lower(v_battery.designation)
    )
  order by b.updated_at desc nulls last
  limit 1;

  if v_bundle_id is null then
    insert into public.article_bundles (
      organization_id, name, category, subcategory, brand, family, items, actif, updated_at
    ) values (
      v_org,
      v_battery.designation,
      coalesce(v_battery.categorie, ''),
      coalesce(v_battery.sous_categorie, ''),
      coalesce(v_battery.marque, ''),
      coalesce(v_battery.sous_categorie, ''),
      jsonb_build_array(v_principal, v_labor_item),
      true,
      now()
    );
  else
    update public.article_bundles
    set name = v_battery.designation,
        category = coalesce(v_battery.categorie, ''),
        subcategory = coalesce(v_battery.sous_categorie, ''),
        brand = coalesce(v_battery.marque, ''),
        family = coalesce(v_battery.sous_categorie, ''),
        items = jsonb_build_array(v_principal, v_labor_item),
        actif = true,
        updated_at = now()
    where id = v_bundle_id;
  end if;
end $$;
