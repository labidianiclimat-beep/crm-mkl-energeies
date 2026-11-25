-- Aquarea T-CAP Série M — Panasonic, pompes à chaleur air/eau, R290.
-- Brochure A2W-Aquarea-M, édition 04/2024. Prix de vente à 0 : pas de tarif dans la brochure.
-- À coller dans Supabase → SQL Editor.
-- Les groupes reprennent la fourniture et l’installation air/eau déjà utilisées
-- sur les autres pompes à chaleur. Les lignes climatisation air/air
-- (FRN-R.R, INST-R.R, catégorie Climatisation) sont refusées.

do $$
declare
  v_org uuid;
  v_brand_id uuid;
  v_brand text;
  v_cat_id uuid;
  v_sub_id uuid;
  v_cat_name text;
  v_sub_name text;
  v_supply jsonb;
  v_labor jsonb;
  v_article_id uuid;
  v_row record;
  v_desc text;
  v_bundle_name text;
begin
  select a.organization_id
    into v_org
  from public.articles a
  group by a.organization_id
  order by count(*) desc
  limit 1;

  if v_org is null then
    raise exception 'Aucun catalogue article trouvé.';
  end if;

  select b.id, b.name
    into v_brand_id, v_brand
  from public.article_brands b
  where b.organization_id = v_org
    and b.actif is not false
    and lower(b.name) like '%panasonic%'
  order by (
    select count(*) from public.articles a
    where a.organization_id = v_org and a.brand_id = b.id
  ) desc, b.name
  limit 1;

  if v_brand_id is null then
    insert into public.article_brands (organization_id, name, actif)
    values (v_org, 'Panasonic', true)
    returning id, name into v_brand_id, v_brand;
  end if;

  select a.category_id, a.subcategory_id, nullif(a.categorie, ''), nullif(a.sous_categorie, '')
    into v_cat_id, v_sub_id, v_cat_name, v_sub_name
  from public.articles a
  where a.organization_id = v_org
    and a.actif is not false
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%pompe%chaleur%'
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%climatis%'
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%air air%'
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%air/air%'
    and lower(translate(coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%fourniture%'
    and lower(translate(coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%installation%'
  order by case when a.subcategory_id is not null then 0 else 1 end, a.updated_at desc nulls last
  limit 1;

  if v_sub_id is null then
    select c.id, s.id, c.name, s.name
      into v_cat_id, v_sub_id, v_cat_name, v_sub_name
    from public.article_categories c
    join public.article_subcategories s
      on s.category_id = c.id and s.organization_id = c.organization_id
    where c.organization_id = v_org
      and lower(translate(s.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%pompe%chaleur%'
      and lower(translate(c.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%climatis%'
    order by
      case when lower(translate(s.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) in ('pompe a chaleur', 'pompe a chaleur air/eau', 'pompe a chaleur air eau') then 0 else 1 end,
      case when lower(translate(c.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) = 'chauffage' then 0 else 1 end
    limit 1;
  end if;

  if v_sub_id is null then
    raise exception 'Dossier pompe à chaleur air/eau introuvable. Rien n''a été enregistré.';
  end if;

  v_cat_name := coalesce(nullif(v_cat_name, ''), 'Chauffage');
  v_sub_name := coalesce(nullif(v_sub_name, ''), 'Pompe à chaleur');

  select jsonb_build_object(
    'articleId', a.id, 'code', a.reference, 'name', a.designation,
    'description', coalesce(a.description, ''), 'category', a.categorie,
    'subcategory', coalesce(a.sous_categorie, ''), 'brand', coalesce(a.marque, ''),
    'brandId', coalesce(a.brand_id::text, ''), 'sourceReference', coalesce(a.source_reference, ''),
    'qty', 1, 'price', a.prix_vente_ht, 'buy', a.prix_achat_ht, 'tax', a.taux_tva,
    'unit', coalesce(a.unite, 'Unité'), 'role', 'supply'
  )
    into v_supply
  from public.articles a
  join (
    select i->>'articleId' as article_id, count(*) as uses
    from public.article_bundles b
    cross join lateral jsonb_array_elements(b.items) i
    where b.organization_id = v_org
      and b.actif is not false
      and i->>'role' = 'supply'
      and nullif(i->>'articleId', '') is not null
      and lower(translate(coalesce(b.category, '') || ' ' || coalesce(b.subcategory, '') || ' ' || coalesce(b.family, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%pompe%chaleur%'
      and lower(translate(coalesce(b.category, '') || ' ' || coalesce(b.subcategory, '') || ' ' || coalesce(b.family, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%climatis%'
      and lower(translate(coalesce(b.category, '') || ' ' || coalesce(b.subcategory, '') || ' ' || coalesce(b.family, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%air air%'
    group by i->>'articleId'
  ) used on used.article_id = a.id::text
  where a.organization_id = v_org
    and a.actif is not false
    and lower(a.reference) not in ('frn-r.r', 'inst-r.r')
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%climatis%'
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%air air%'
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%air/air%'
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%monosplit%'
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%multi-split%'
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%fourniture%'
    and (
      lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%pompe%chaleur%'
      or lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%air%eau%'
      or lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) ~ '(^|[^a-z0-9])pac([^a-z0-9]|$)'
      or lower(coalesce(a.categorie, '')) = 'chauffage'
    )
  order by used.uses desc, a.designation
  limit 1;

  select jsonb_build_object(
    'articleId', a.id, 'code', a.reference, 'name', a.designation,
    'description', coalesce(a.description, ''), 'category', a.categorie,
    'subcategory', coalesce(a.sous_categorie, ''), 'brand', coalesce(a.marque, ''),
    'brandId', coalesce(a.brand_id::text, ''), 'sourceReference', coalesce(a.source_reference, ''),
    'qty', 1, 'price', a.prix_vente_ht, 'buy', a.prix_achat_ht, 'tax', a.taux_tva,
    'unit', coalesce(a.unite, 'Unité'), 'role', 'labor'
  )
    into v_labor
  from public.articles a
  join (
    select i->>'articleId' as article_id, count(*) as uses
    from public.article_bundles b
    cross join lateral jsonb_array_elements(b.items) i
    where b.organization_id = v_org
      and b.actif is not false
      and i->>'role' = 'labor'
      and nullif(i->>'articleId', '') is not null
      and lower(translate(coalesce(b.category, '') || ' ' || coalesce(b.subcategory, '') || ' ' || coalesce(b.family, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%pompe%chaleur%'
      and lower(translate(coalesce(b.category, '') || ' ' || coalesce(b.subcategory, '') || ' ' || coalesce(b.family, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%climatis%'
      and lower(translate(coalesce(b.category, '') || ' ' || coalesce(b.subcategory, '') || ' ' || coalesce(b.family, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%air air%'
    group by i->>'articleId'
  ) used on used.article_id = a.id::text
  where a.organization_id = v_org
    and a.actif is not false
    and lower(a.reference) not in ('frn-r.r', 'inst-r.r')
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%climatis%'
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%air air%'
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%air/air%'
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%monosplit%'
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%multi-split%'
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%fourniture%'
    and (
      lower(translate(coalesce(a.designation, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%installation%'
      or lower(translate(coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%main d%'
      or lower(translate(coalesce(a.designation, '') || ' ' || coalesce(a.sous_categorie, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) ~ '(^|[^a-z])pose([^a-z]|$)'
    )
    and (
      lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%pompe%chaleur%'
      or lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%air%eau%'
      or lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, '') || ' ' || coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) ~ '(^|[^a-z0-9])pac([^a-z0-9]|$)'
      or lower(coalesce(a.categorie, '')) = 'chauffage'
    )
  order by used.uses desc, a.designation
  limit 1;

  if v_supply is null or v_labor is null or (v_supply->>'articleId') = (v_labor->>'articleId') then
    raise exception 'Fourniture ou installation air/eau introuvable. Les lignes climatisation air/air ne sont pas utilisées. Rien n''a été enregistré.';
  end if;

  for v_row in
    select *
    from (values
      ('WH-WXG09ME5', 'Aquarea T-CAP M 9 kW mono', 9000::numeric, '230 V monophasé', '9,00 kW', '5,23', '9,00 kW', '3,24', '9,00 kW', '3,45', '9,00 kW', '2,35', '4,96 / 3,57', '195 % / 140 %', 'A+++ / A++', '52 dB(A)', '161 kg', '1 520 × 1 200 × 430 mm', '-28 °C / +35 °C', '1,78 kg', 'WH-ADC0316M3E52, WH-ADC0316M6E52, WH-ADC0316M9E82 ou modules WH-CME5 et WH-CME8'),
      ('WH-WXG12ME5', 'Aquarea T-CAP M 12 kW mono', 12000, '230 V monophasé', '12,00 kW', '5,06', '12,00 kW', '3,23', '12,00 kW', '3,00', '12,00 kW', '2,17', '5,00 / 3,46', '197 % / 135 %', 'A+++ / A++', '53 dB(A)', '161 kg', '1 520 × 1 200 × 430 mm', '-28 °C / +35 °C', '1,78 kg', 'WH-ADC0316M3E52, WH-ADC0316M6E52, WH-ADC0316M9E82 ou modules WH-CME5 et WH-CME8'),
      ('WH-WXG09ME8', 'Aquarea T-CAP M 9 kW tri', 9000, '400 V triphasé', '9,00 kW', '5,23', '9,00 kW', '3,24', '9,00 kW', '3,45', '9,00 kW', '2,35', '4,96 / 3,57', '195 % / 140 %', 'A+++ / A++', '52 dB(A)', '161 kg', '1 520 × 1 200 × 430 mm', '-28 °C / +35 °C', '1,78 kg', 'WH-ADC0316M9E82 ou module WH-CME8'),
      ('WH-WXG12ME8', 'Aquarea T-CAP M 12 kW tri', 12000, '400 V triphasé', '12,00 kW', '5,06', '12,00 kW', '3,23', '12,00 kW', '3,00', '12,00 kW', '2,17', '5,00 / 3,46', '197 % / 135 %', 'A+++ / A++', '53 dB(A)', '161 kg', '1 520 × 1 200 × 430 mm', '-28 °C / +35 °C', '1,78 kg', 'WH-ADC0316M9E82 ou module WH-CME8'),
      ('WH-WXG16ME8', 'Aquarea T-CAP M 16 kW tri', 16000, '400 V triphasé', '16,00 kW', '4,89', '16,00 kW', '3,20', '16,00 kW', '2,53', '16,00 kW', '1,97', '4,20 / 3,31', '168 % / 129 %', 'A+++ / A++', '57 dB(A)', '165 kg', '1 520 × 1 200 × 430 mm', '-28 °C / +35 °C', '1,77 kg', 'WH-ADC0316M9E82 ou module WH-CME8'),
      ('WH-WXG20ME8', 'Big Aquarea T-CAP M 20 kW tri', 20000, '400 V triphasé', '20,00 kW', '4,66', '20,00 kW', '2,49', '20,00 kW', '2,48', '20,00 kW', '1,60', '4,01 / 3,50', '', 'A++ / A++', '68 dB(A)', '260 kg', '1 645 × 1 500 × 460 mm', '-25 °C / +35 °C', '2,6 kg', 'Module WH-CME8L'),
      ('WH-WXG25ME8', 'Big Aquarea T-CAP M 25 kW tri', 25000, '400 V triphasé', '25,00 kW', '4,40', '25,00 kW', '2,35', '25,00 kW', '2,35', '25,00 kW', '1,51', '3,78 / 3,30', '', 'A++ / A++', '69 dB(A)', '260 kg', '1 645 × 1 500 × 460 mm', '-25 °C / +35 °C', '2,6 kg', 'Module WH-CME8L'),
      ('WH-WXG30ME8', 'Big Aquarea T-CAP M 30 kW tri', 30000, '400 V triphasé', '30,00 kW', '4,36', '30,00 kW', '2,18', '30,00 kW', '2,32', '30,00 kW', '1,49', '3,55 / 3,10', '', 'A+ / A+', '69 dB(A)', '260 kg', '1 645 × 1 500 × 460 mm', '-25 °C / +35 °C', '2,6 kg', 'Module WH-CME8L')
    ) as m(reference, designation, power_w, supply, p7_35, cop7_35, p7_55, cop7_55, pm7_35, copm7_35, pm7_55, copm7_55, scop, eta, classe, sound, weight, dims, range_txt, charge, indoors)
  loop
    v_desc := v_row.designation || E'\n'
      || 'Groupe extérieur ' || v_row.reference || E'. Pompe à chaleur air/eau Aquarea T-CAP Série M, R290.\n'
      || 'Raccordement hydraulique. Compatible : ' || v_row.indoors || E'. Télécommande Wi-Fi CZ-RTW2TAW1C.\n\n'
      || 'Marque : ' || v_brand || E'\n'
      || 'Réfrigérant : R290' || E'\n'
      || 'Classe énergétique - chauffage (35°C/55°C) : ' || v_row.classe || E'\n'
      || case when v_row.eta <> '' then 'Efficacité énergétique saisonnière - chauffage (35°C/55°C) : ' || v_row.eta || E'\n' else '' end
      || 'SCOP 35°C / 55°C : ' || v_row.scop || E'\n'
      || 'Température de départ maximum : 75 °C' || E'\n'
      || 'Puissance calorifique : -7°C / +35°C : ' || v_row.pm7_35 || E'\n'
      || 'COP -7°C / 35°C nominal : ' || v_row.copm7_35 || E'\n'
      || 'Puissance calorifique -7°C / +55°C : ' || v_row.pm7_55 || E'\n'
      || 'COP -7°C / 55°C nominal : ' || v_row.copm7_55 || E'\n'
      || 'Puissance calorifique +7°C / +35°C : ' || v_row.p7_35 || E'\n'
      || 'COP +7°C / 35°C nominal : ' || v_row.cop7_35 || E'\n'
      || 'COP +7°C / 55°C : ' || v_row.cop7_55 || E'\n'
      || 'Niveau sonore : puissance acoustique ' || v_row.sound || E'\n'
      || 'Ballon ECS intégré : Non' || E'\n'
      || 'Poids de fonctionnement : ' || v_row.weight || E'\n'
      || 'Plage de fonctionnement conseillée mini./maxi. mode chaud : ' || v_row.range_txt || E'\n'
      || 'Alimentation : ' || v_row.supply || E'\n'
      || 'Charge R290 : ' || v_row.charge || E'\n'
      || 'Dimensions : ' || v_row.dims || E'\n\n'
      || 'Garantie :' || E'\n'
      || '- 5 ans compresseur' || E'\n'
      || '- 2 ans pièces';

    select a.id into v_article_id
    from public.articles a
    where a.organization_id = v_org and lower(a.reference) = lower(v_row.reference)
    limit 1;

    if v_article_id is null then
      insert into public.articles (
        organization_id, reference, designation, description,
        categorie, sous_categorie, category_id, subcategory_id,
        marque, brand_id, prix_achat_ht, prix_vente_ht, taux_tva,
        unite, actif, power_w, source_reference, updated_at
      ) values (
        v_org, v_row.reference, v_row.designation, v_desc,
        v_cat_name, v_sub_name, v_cat_id, v_sub_id,
        v_brand, v_brand_id, 0, 0, 5.5,
        'Unité', true, v_row.power_w, 'catalogue:aquarea-m-2024', now()
      )
      returning id into v_article_id;
    else
      update public.articles
      set designation = v_row.designation,
          description = v_desc,
          categorie = v_cat_name,
          sous_categorie = v_sub_name,
          category_id = v_cat_id,
          subcategory_id = v_sub_id,
          marque = v_brand,
          brand_id = v_brand_id,
          taux_tva = 5.5,
          power_w = v_row.power_w,
          source_reference = 'catalogue:aquarea-m-2024',
          actif = true,
          updated_at = now()
      where id = v_article_id;
    end if;

    v_bundle_name := v_row.designation || ' R290';

    if exists (
      select 1 from public.article_bundles b
      where b.organization_id = v_org and lower(b.name) = lower(v_bundle_name)
    ) then
      update public.article_bundles
      set category = v_cat_name,
          subcategory = v_sub_name,
          brand = v_brand,
          family = v_sub_name,
          actif = true,
          updated_at = now(),
          items = jsonb_build_array(
            jsonb_build_object(
              'articleId', v_article_id, 'code', v_row.reference, 'name', v_row.designation,
              'description', v_desc, 'category', v_cat_name, 'subcategory', v_sub_name,
              'brand', v_brand, 'brandId', v_brand_id, 'sourceReference', 'catalogue:aquarea-m-2024',
              'qty', 1, 'price', 0, 'buy', 0, 'tax', 5.5, 'unit', 'Unité', 'role', 'principal'
            ),
            v_supply,
            v_labor
          )
      where organization_id = v_org and lower(name) = lower(v_bundle_name);
    elsif exists (
      select 1 from public.article_bundles b
      where b.organization_id = v_org and lower(b.name) = lower(v_row.designation)
    ) then
      update public.article_bundles
      set name = v_bundle_name,
          category = v_cat_name,
          subcategory = v_sub_name,
          brand = v_brand,
          family = v_sub_name,
          actif = true,
          updated_at = now(),
          items = jsonb_build_array(
            jsonb_build_object(
              'articleId', v_article_id, 'code', v_row.reference, 'name', v_row.designation,
              'description', v_desc, 'category', v_cat_name, 'subcategory', v_sub_name,
              'brand', v_brand, 'brandId', v_brand_id, 'sourceReference', 'catalogue:aquarea-m-2024',
              'qty', 1, 'price', 0, 'buy', 0, 'tax', 5.5, 'unit', 'Unité', 'role', 'principal'
            ),
            v_supply,
            v_labor
          )
      where organization_id = v_org and lower(name) = lower(v_row.designation);
    else
      insert into public.article_bundles (
        organization_id, name, category, subcategory, brand, family, items, actif, updated_at
      ) values (
        v_org, v_bundle_name, v_cat_name, v_sub_name, v_brand, v_sub_name,
        jsonb_build_array(
          jsonb_build_object(
            'articleId', v_article_id, 'code', v_row.reference, 'name', v_row.designation,
            'description', v_desc, 'category', v_cat_name, 'subcategory', v_sub_name,
            'brand', v_brand, 'brandId', v_brand_id, 'sourceReference', 'catalogue:aquarea-m-2024',
            'qty', 1, 'price', 0, 'buy', 0, 'tax', 5.5, 'unit', 'Unité', 'role', 'principal'
          ),
          v_supply,
          v_labor
        ),
        true, now()
      );
    end if;
  end loop;

  for v_row in
    select *
    from (values
      ('WH-ADC0316M3E52', 'Aquarea All in One M 185 L mono 3 kW', 'Unité intérieure All in One, ballon ECS 185 L acier inoxydable, appoint 3 kW monophasé, vase 10 L. Dimensions 1 642 × 599 × 602 mm, 89 kg. Eau chaude jusqu''à 65 °C. Compatible WH-WXG09ME5 et WH-WXG12ME5. Accessoire CZ-NS6P.', 5.5::numeric),
      ('WH-ADC0316M6E52', 'Aquarea All in One M 185 L mono 6 kW', 'Unité intérieure All in One, ballon ECS 185 L acier inoxydable, appoint 6 kW monophasé, vase 10 L. Dimensions 1 642 × 599 × 602 mm, 89 kg. Eau chaude jusqu''à 65 °C. Compatible WH-WXG09ME5 et WH-WXG12ME5. Accessoire CZ-NS6P.', 5.5),
      ('WH-ADC0316M9E82', 'Aquarea All in One M 185 L tri 9 kW', 'Unité intérieure All in One, ballon ECS 185 L acier inoxydable, appoint 9 kW triphasé, vase 10 L. Dimensions 1 642 × 599 × 602 mm, 89 kg. Eau chaude jusqu''à 65 °C. Compatible WH-WXG09ME5, WH-WXG12ME5, WH-WXG09ME8, WH-WXG12ME8 et WH-WXG16ME8. Accessoire CZ-NS6P.', 5.5),
      ('WH-CME5', 'Module de contrôle Aquarea M mono', 'Module de contrôle monophasé. Dimensions 450 × 450 × 117 mm, 7 kg. Appoint électrique non fourni, jusqu''à 3 kW. Compatible WH-WXG09ME5 et WH-WXG12ME5. Accessoire CZ-NS7P.', 5.5),
      ('WH-CME8', 'Module de contrôle Aquarea M tri', 'Module de contrôle triphasé. Dimensions 450 × 450 × 117 mm, 7 kg. Appoint électrique non fourni, jusqu''à 9 kW. Compatible WH-WXG09ME5, WH-WXG12ME5, WH-WXG09ME8, WH-WXG12ME8 et WH-WXG16ME8. Accessoire CZ-NS7P.', 5.5),
      ('WH-CME8L', 'Module de contrôle Big Aquarea M', 'Module de contrôle triphasé pour Big Aquarea. Dimensions 450 × 450 × 117 mm, 7 kg. Compatible WH-WXG20ME8, WH-WXG25ME8 et WH-WXG30ME8.', 5.5),
      ('CZ-RTW2TAW1C', 'Télécommande Aquarea Wi-Fi', 'Télécommande avec adaptateur Wi-Fi, compatible avec tous les groupes extérieurs Aquarea T-CAP Série M.', 20)
    ) as extra(reference, designation, description, tax)
  loop
    select a.id into v_article_id
    from public.articles a
    where a.organization_id = v_org and lower(a.reference) = lower(v_row.reference)
    limit 1;

    if v_article_id is null then
      insert into public.articles (
        organization_id, reference, designation, description,
        categorie, sous_categorie, category_id, subcategory_id,
        marque, brand_id, prix_achat_ht, prix_vente_ht, taux_tva,
        unite, actif, source_reference, updated_at
      ) values (
        v_org, v_row.reference, v_row.designation,
        v_row.designation || E'\n' || v_row.description || E'\n\nMarque : ' || v_brand,
        v_cat_name, v_sub_name, v_cat_id, v_sub_id,
        v_brand, v_brand_id, 0, 0, v_row.tax,
        'Unité', true, 'catalogue:aquarea-m-2024', now()
      );
    else
      update public.articles
      set designation = v_row.designation,
          description = v_row.designation || E'\n' || v_row.description || E'\n\nMarque : ' || v_brand,
          categorie = v_cat_name,
          sous_categorie = v_sub_name,
          category_id = v_cat_id,
          subcategory_id = v_sub_id,
          marque = v_brand,
          brand_id = v_brand_id,
          taux_tva = v_row.tax,
          source_reference = 'catalogue:aquarea-m-2024',
          actif = true,
          updated_at = now()
      where id = v_article_id;
    end if;
  end loop;
end $$;
