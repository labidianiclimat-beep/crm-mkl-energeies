-- Chauffeo Plus — Atlantic, chauffe-eau électriques.
-- Fiche technique ED 999 537, édition août 2015. Prix de vente à 0 : pas de tarif dans la fiche.
-- À coller dans Supabase → SQL Editor.
-- Dossier : Ballon d’eau chaude / Ballon électrique. Pas de groupe : un article par capacité.

do $$
declare
  v_org uuid;
  v_brand_id uuid;
  v_brand text;
  v_cat_id uuid;
  v_sub_id uuid;
  v_cat_name text;
  v_sub_name text;
  v_article_id uuid;
  v_row record;
  v_desc text;
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
    and lower(translate(b.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%atlantic%'
  order by (
    select count(*) from public.articles a
    where a.organization_id = v_org and a.brand_id = b.id
  ) desc, b.name
  limit 1;

  if v_brand_id is null then
    insert into public.article_brands (organization_id, name, actif)
    values (v_org, 'Atlantic', true)
    returning id, name into v_brand_id, v_brand;
  end if;

  select c.id, c.name
    into v_cat_id, v_cat_name
  from public.article_categories c
  where c.organization_id = v_org
    and lower(translate(c.name, 'àâäéèêëïîôùûüç''’', 'aaaeeeeiioouuuc')) like 'ballon%eau%chaude'
  order by c.name
  limit 1;

  if v_cat_id is null then
    raise exception 'Dossier Ballon d’eau chaude introuvable. Rien n''a été enregistré.';
  end if;

  select s.id, s.name
    into v_sub_id, v_sub_name
  from public.article_subcategories s
  where s.organization_id = v_org
    and s.category_id = v_cat_id
    and lower(translate(s.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) = 'ballon electrique'
  limit 1;

  if v_sub_id is null then
    insert into public.article_subcategories (organization_id, category_id, name, sort_order)
    values (v_org, v_cat_id, 'Ballon électrique', 20)
    returning id, name into v_sub_id, v_sub_name;
  end if;

  v_cat_name := coalesce(nullif(v_cat_name, ''), 'Ballon d’eau chaude');
  v_sub_name := coalesce(nullif(v_sub_name, ''), 'Ballon électrique');

  for v_row in
    select *
    from (values
      ('053005', 'Chauffeo Plus vertical mural 50 L', 1200::numeric, 'Verticale murale', '50 L', '1 200 W', '2 h 46', 'Non indiquée', '0,33', '0,79 kWh/24 h', 'Ø 505 mm, H 575 mm, A 370 mm, Z 172 mm, C 530 mm', '23 kg', 'IP 25'),
      ('053007', 'Chauffeo Plus vertical mural 75 L', 1200, 'Verticale murale', '75 L', '1 200 W', '4 h 10', '141 L', '0,28', '1,00 kWh/24 h', 'Ø 510 mm, H 700 mm, A 575 mm, Z 120 mm, C 530 mm', '26 kg', 'IP 25'),
      ('051010', 'Chauffeo Plus vertical mural 100 L', 1200, 'Verticale murale', '100 L', '1 200 W', '5 h 46', '192 L', '0,28', '1,33 kWh/24 h', 'Ø 510 mm, H 865 mm, A 750 mm, Z 115 mm, C 530 mm', '30 kg', 'IP 25'),
      ('051015', 'Chauffeo Plus vertical mural 150 L', 1800, 'Verticale murale', '150 L', '1 800 W', '5 h 33', '279 L', '0,21', '1,48 kWh/24 h', 'Ø 530 mm, H 1 165 mm, A 1 050 mm, B 800 mm, Z 115 mm, C 550 mm', '38 kg', 'IP 25'),
      ('051020', 'Chauffeo Plus vertical mural 200 L', 2200, 'Verticale murale', '200 L', '2 200 W', '5 h 17', '382 L', '0,18', '1,73 kWh/24 h', 'Ø 530 mm, H 1 480 mm, A 1 050 mm, B 800 mm, Z 430 mm, C 550 mm', '46 kg', 'IP 25'),
      ('053020', 'Chauffeo Plus vertical sur socle 200 L', 2200, 'Verticale sur socle', '200 L', '2 200 W', '4 h 41', '358 L', '0,15', '1,45 kWh/24 h', 'Ø 530 mm, H 1 485 mm, A 300 mm, C 600 mm', '43 kg', 'IP 24'),
      ('052125', 'Chauffeo Plus vertical sur socle 250 L', 3000, 'Verticale sur socle', '250 L', '3 000 W', '5 h 02', '477 L', '0,18', '2,15 kWh/24 h', 'Ø 530 mm, H 1 805 mm, A 300 mm, C 600 mm', '58 kg', 'IP 24'),
      ('052130', 'Chauffeo Plus vertical sur socle 300 L', 3000, 'Verticale sur socle', '300 L', '3 000 W', '5 h 53', '569 L', '0,18', '2,58 kWh/24 h', 'Ø 570 mm, H 1 765 mm, A 300 mm, C 640 mm', '68 kg', 'IP 24')
    ) as m(reference, designation, power_w, pose, capacity, power_label, heat_time, hot40, cooling, standby, dims, weight, ingress)
  loop
    if exists (
      select 1 from public.articles a
      where a.organization_id = v_org
        and lower(a.reference) = lower(v_row.reference)
        and coalesce(a.source_reference, '') <> 'catalogue:chauffeo-plus-2015'
        and lower(translate(coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%chauffeo%'
    ) then
      raise exception 'La référence % existe déjà pour un autre article. Rien n''a été enregistré.', v_row.reference;
    end if;

    v_desc := v_row.designation || E'\n'
      || 'Chauffe-eau électrique Atlantic Chauffeo Plus, code ' || v_row.reference || E'.\n'
      || 'Résistance stéatite protégée dans un fourreau. Anode magnésium, à entretenir.\n'
      || 'Pose ' || lower(v_row.pose) || E'. Raccordement hydraulique 3/4'''' (20/27).\n\n'
      || 'Marque : ' || v_brand || E'\n'
      || 'Capacité : ' || v_row.capacity || E'\n'
      || 'Alimentation : 230 V monophasé' || E'\n'
      || 'Puissance : ' || v_row.power_label || E'\n'
      || 'Temps de chauffe de 15 à 65 °C : ' || v_row.heat_time || E'\n'
      || 'Eau chaude mitigée à 40 °C : ' || v_row.hot40 || E'\n'
      || 'Constante de refroidissement : ' || v_row.cooling || E'\n'
      || 'Consommation d''entretien : ' || v_row.standby || E'\n'
      || 'Classe énergétique : C' || E'\n'
      || 'Dimensions : ' || v_row.dims || E'\n'
      || 'Poids à vide : ' || v_row.weight || E'\n'
      || 'Indice de protection : ' || v_row.ingress || E'\n\n'
      || 'Garantie :' || E'\n'
      || '- 5 ans cuve' || E'\n'
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
        v_brand, v_brand_id, 0, 0, 10,
        'Unité', true, v_row.power_w, 'catalogue:chauffeo-plus-2015', now()
      );
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
          taux_tva = 10,
          power_w = v_row.power_w,
          source_reference = 'catalogue:chauffeo-plus-2015',
          actif = true,
          updated_at = now()
      where id = v_article_id;
    end if;
  end loop;
end $$;
