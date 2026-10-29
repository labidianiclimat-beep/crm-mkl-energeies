-- Aldes EasyHOME HYGRO COMPACT Classic — fiche produit 11033048.
-- Marque Aldes, dossier VMC / VMC simple flux, l’article, ses sous-articles, la pose, puis le groupe.
-- Pose à 350 € HT. Ensemble : 1 251,18 € HT, TVA 5,5 %, 1 320 € TTC.
-- Les accessoires sont à 0 € : la fiche Aldes ne donne aucun tarif, le prix est porté par le groupe.
-- À coller dans Supabase → SQL Editor.

do $$
declare
  v_org uuid;
  v_brand_id uuid;
  v_brand text;
  v_cat_id uuid;
  v_sub_id uuid;
  v_cat_name text;
  v_sub_name text;
  v_bundle_name constant text := 'Aldes — Groupe EasyHOME HYGRO COMPACT Classic';
  v_row record;
  v_article_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_bundle_id uuid;
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

  -- Marque Aldes
  select b.id, b.name
    into v_brand_id, v_brand
  from public.article_brands b
  where b.organization_id = v_org
    and lower(translate(b.name, 'àâäéèêëïîôöùûüç', 'aaaeeeeiioouuuc')) = 'aldes'
  limit 1;

  if v_brand_id is null then
    insert into public.article_brands (organization_id, name, actif)
    values (v_org, 'Aldes', true)
    returning id, name into v_brand_id, v_brand;
  else
    update public.article_brands
    set actif = true, updated_at = now()
    where id = v_brand_id;
  end if;

  -- Dossier VMC, à côté de Chauffage, Climatisation, Photovoltaïque, Isolation
  select c.id, c.name
    into v_cat_id, v_cat_name
  from public.article_categories c
  where c.organization_id = v_org
    and lower(translate(c.name, 'àâäéèêëïîôöùûüç', 'aaaeeeeiioouuuc')) = 'vmc'
  limit 1;

  if v_cat_id is null then
    insert into public.article_categories (organization_id, name, slug, description, icon, sort_order, actif)
    values (v_org, 'VMC', 'vmc', 'Ventilation mécanique contrôlée', 'Wind', 50, true)
    returning id, name into v_cat_id, v_cat_name;
  else
    update public.article_categories
    set slug = coalesce(nullif(slug, ''), 'vmc'),
        description = coalesce(nullif(description, ''), 'Ventilation mécanique contrôlée'),
        icon = coalesce(nullif(icon, ''), 'Wind'),
        sort_order = 50,
        actif = true,
        updated_at = now()
    where id = v_cat_id;
  end if;

  insert into public.article_subcategories (organization_id, category_id, name, sort_order)
  select v_org, v_cat_id, v.name, v.sort_order
  from (values ('VMC simple flux', 10), ('VMC double flux', 20)) as v(name, sort_order)
  where not exists (
    select 1 from public.article_subcategories s
    where s.organization_id = v_org
      and s.category_id = v_cat_id
      and lower(translate(s.name, 'àâäéèêëïîôöùûüç', 'aaaeeeeiioouuuc')) = lower(translate(v.name, 'àâäéèêëïîôöùûüç', 'aaaeeeeiioouuuc'))
  );

  select s.id, s.name
    into v_sub_id, v_sub_name
  from public.article_subcategories s
  where s.organization_id = v_org
    and s.category_id = v_cat_id
    and lower(translate(s.name, 'àâäéèêëïîôöùûüç', 'aaaeeeeiioouuuc')) = 'vmc simple flux'
  limit 1;

  v_cat_name := coalesce(nullif(v_cat_name, ''), 'VMC');
  v_sub_name := coalesce(nullif(v_sub_name, ''), 'VMC simple flux');

  -- Article principal, sous-articles de la fiche, puis la pose. L’ordre du groupe suit cet ordre.
  for v_row in
    select *
    from (values
      (
        10, '11033048', 'Groupe EasyHOME HYGRO COMPACT Classic', 901.18::numeric, 1::numeric,
        'Unité', 28, 'principal', 'catalogue:aldes-easyhome-hygro-compact',
        'Groupe de ventilation simple flux individuelle hygroréglable Aldes, code 11033048.' || E'\n'
        || 'Mode HYGRO en continu et mode BOOST CUISINE pendant 30 min. Bouches hygro BDH.' || E'\n'
        || 'Caisson en matière plastique recyclée, caoutchoucs anti-vibratiles intégrés, extra plat.' || E'\n\n'
        || 'Marque : Aldes' || E'\n'
        || 'Raccordements : 1 piquage Ø 125 mm cuisine, 4 piquages Ø 80 mm pièces humides, 1 rejet Ø 160 mm' || E'\n'
        || 'Sanitaires maximum : 4' || E'\n'
        || 'Moteur : AC, 1 vitesse' || E'\n'
        || 'Débit max ErP : 221 m³/h' || E'\n'
        || 'Alimentation : 230 V — 50 Hz' || E'\n'
        || 'Puissance max : 28 W' || E'\n'
        || 'Intensité max : 0,2 A — protection 2 A' || E'\n'
        || 'Pression acoustique à 2 m de la bouche cuisine : 20 dB(A)' || E'\n'
        || 'Puissance acoustique ErP : 46 dB(A)' || E'\n'
        || 'Consommation moyenne journalière F4 (1 bain + 1 WC) : 20,7 W' || E'\n'
        || 'Classe énergétique, climat moyen : C' || E'\n'
        || 'Dimensions : H 187 mm, L 459 mm, P 460 mm' || E'\n'
        || 'Poids : 3,6 kg' || E'\n'
        || 'Fixation : 2 vis, entraxe 406 mm, gabarit de perçage fourni' || E'\n'
        || 'Avis technique : 14.5/17-2266 — QB37 : 70/01-CHY5-2266' || E'\n'
        || 'Livré avec : 2 bouchons Ø 80 mm et EasyCLIP Algaine (raccords + colliers)' || E'\n\n'
        || 'Garantie :' || E'\n'
        || '- 8 ans caisson et bouches hygro BDH'
      ),
      (
        20, '11033010', 'EasyCLIP Algaine collier + raccord Ø 125 mm', 0, 1,
        'Unité', null, 'supply', 'catalogue:aldes-easyhome-hygro-compact',
        'Raccord EasyCLIP Algaine avec collier, Ø 125 mm.' || E'\n'
        || 'Piquage cuisine du groupe EasyHOME HYGRO COMPACT Classic.'
      ),
      (
        30, '11033011', 'EasyCLIP Algaine collier + raccord Ø 80 mm', 0, 4,
        'Unité', null, 'supply', 'catalogue:aldes-easyhome-hygro-compact',
        'Raccord EasyCLIP Algaine avec collier, Ø 80 mm.' || E'\n'
        || 'Piquages pièces humides du groupe EasyHOME HYGRO COMPACT Classic.'
      ),
      (
        40, '11033016', 'EasyCLIP Algaine collier + raccord Ø 160 mm', 0, 1,
        'Unité', null, 'supply', 'catalogue:aldes-easyhome-hygro-compact',
        'Raccord EasyCLIP Algaine avec collier, Ø 160 mm.' || E'\n'
        || 'Rejet du groupe EasyHOME HYGRO COMPACT Classic.'
      ),
      (
        50, '11033007', 'Manchette trident Ø 125 mm', 0, 1,
        'Unité', null, 'supply', 'catalogue:aldes-easyhome-hygro-compact',
        'Manchette trident Ø 125 mm pour réseau aéraulique Aldes.'
      ),
      (
        60, '11022074', 'Manchette trident Ø 80 mm', 0, 1,
        'Unité', null, 'supply', 'catalogue:aldes-easyhome-hygro-compact',
        'Manchette trident Ø 80 mm pour réseau aéraulique Aldes.'
      ),
      (
        70, '11026011', 'Bouton poussoir VMC bouche Bahia Curve PUSH / EasyHOME', 0, 1,
        'Unité', null, 'supply', 'catalogue:aldes-easyhome-hygro-compact',
        'Bouton poussoir VMC pour bouche Bahia Curve PUSH et pour EasyHOME AutoSENS et PureAIR.' || E'\n'
        || 'Déclenche le mode BOOST CUISINE.'
      ),
      (
        80, 'INST-VMC-SF', 'Installation VMC simple flux', 350, 1,
        'Forfait', null, 'labor', 'catalogue:installation-vmc-simple-flux',
        'Installation VMC simple flux.' || E'\n'
        || 'Pose et fixation du groupe de ventilation, raccordement du réseau aéraulique et des bouches,' || E'\n'
        || 'raccordement électrique, mise en service et contrôle des débits.'
      )
    ) as m(ord, reference, designation, sell, qty, unit, power_w, role, source_reference, description)
    order by 1
  loop
    if exists (
      select 1 from public.articles a
      where a.organization_id = v_org
        and lower(a.reference) = lower(v_row.reference)
        and coalesce(a.source_reference, '') not in ('', v_row.source_reference)
    ) then
      raise exception 'La référence % existe déjà pour un autre article. Rien n''a été enregistré.', v_row.reference;
    end if;

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
        v_org, v_row.reference, v_row.designation, v_row.description,
        v_cat_name, v_sub_name, v_cat_id, v_sub_id,
        v_brand, v_brand_id, 0, v_row.sell, 5.5,
        v_row.unit, true, v_row.power_w, v_row.source_reference, now()
      )
      returning id into v_article_id;
    else
      update public.articles
      set designation = v_row.designation,
          description = v_row.description,
          categorie = v_cat_name,
          sous_categorie = v_sub_name,
          category_id = v_cat_id,
          subcategory_id = v_sub_id,
          marque = v_brand,
          brand_id = v_brand_id,
          prix_vente_ht = v_row.sell,
          taux_tva = 5.5,
          unite = v_row.unit,
          power_w = v_row.power_w,
          source_reference = v_row.source_reference,
          actif = true,
          updated_at = now()
      where id = v_article_id;
    end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'articleId', v_article_id,
      'code', v_row.reference,
      'name', v_row.designation,
      'description', v_row.description,
      'category', v_cat_name,
      'subcategory', v_sub_name,
      'brand', v_brand,
      'brandId', v_brand_id,
      'sourceReference', v_row.source_reference,
      'qty', v_row.qty,
      'price', v_row.sell,
      'buy', 0,
      'tax', 5.5,
      'unit', v_row.unit,
      'role', v_row.role
    ));
  end loop;

  -- Groupe : même chemin catalogue que le devis, ordre des lignes = ordre du tableau items
  select b.id into v_bundle_id
  from public.article_bundles b
  where b.organization_id = v_org
    and (
      lower(b.name) = lower(v_bundle_name)
      or exists (
        select 1
        from jsonb_array_elements(coalesce(b.items, '[]'::jsonb)) elem
        where lower(coalesce(elem->>'code', '')) = '11033048'
          and coalesce(elem->>'role', 'principal') = 'principal'
      )
    )
  order by b.updated_at desc nulls last
  limit 1;

  if v_bundle_id is null then
    insert into public.article_bundles (
      organization_id, name, category, subcategory, brand, family, items, actif, updated_at
    ) values (
      v_org, v_bundle_name, v_cat_name, v_sub_name, v_brand, v_sub_name, v_items, true, now()
    );
  else
    update public.article_bundles
    set name = v_bundle_name,
        category = v_cat_name,
        subcategory = v_sub_name,
        brand = v_brand,
        family = v_sub_name,
        items = v_items,
        actif = true,
        updated_at = now()
    where id = v_bundle_id;
  end if;
end $$;
