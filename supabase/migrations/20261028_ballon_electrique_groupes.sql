-- Ballons électriques Atlantic : ligne « Installation ballons électriques » et un groupe par ballon.
-- Prix de l’installation à 0 : aucun tarif n’a été donné. TVA 10 % sur le ballon et sur la pose.
-- À coller dans Supabase → SQL Editor. Les articles Chauffeo Plus doivent déjà être en base.

do $$
declare
  v_org uuid;
  v_brand_id uuid;
  v_brand text;
  v_cat_id uuid;
  v_sub_id uuid;
  v_cat_name text;
  v_sub_name text;
  v_labor_id uuid;
  v_labor_desc text;
  v_labor_item jsonb;
  v_principal jsonb;
  v_article record;
  v_bundle_id uuid;
  v_kept jsonb;
  v_count int := 0;
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
  v_labor_desc := 'Installation ballons électriques.' || E'\n'
    || 'Pose d''un ballon électrique Atlantic.';

  select a.id into v_labor_id
  from public.articles a
  where a.organization_id = v_org
    and (
      lower(a.reference) = 'inst-ballon-elec'
      or a.source_reference = 'catalogue:installation-ballon-electrique'
    )
  order by case when lower(a.reference) = 'inst-ballon-elec' then 0 else 1 end
  limit 1;

  if exists (
    select 1 from public.articles a
    where a.organization_id = v_org
      and lower(a.reference) = 'inst-ballon-elec'
      and coalesce(a.source_reference, '') not in ('', 'catalogue:installation-ballon-electrique')
      and lower(translate(coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like 'installation ballon%'
  ) then
    raise exception 'La référence INST-BALLON-ELEC existe déjà pour un autre article. Rien n''a été enregistré.';
  end if;

  if v_labor_id is null then
    insert into public.articles (
      organization_id, reference, designation, description,
      categorie, sous_categorie, category_id, subcategory_id,
      marque, brand_id, prix_achat_ht, prix_vente_ht, taux_tva,
      unite, actif, source_reference, updated_at
    ) values (
      v_org, 'INST-BALLON-ELEC', 'Installation ballons électriques', v_labor_desc,
      v_cat_name, v_sub_name, v_cat_id, v_sub_id,
      v_brand, v_brand_id, 0, 0, 10,
      'Forfait', true, 'catalogue:installation-ballon-electrique', now()
    )
    returning id into v_labor_id;
  else
    update public.articles
    set reference = 'INST-BALLON-ELEC',
        designation = 'Installation ballons électriques',
        description = v_labor_desc,
        categorie = v_cat_name,
        sous_categorie = v_sub_name,
        category_id = v_cat_id,
        subcategory_id = v_sub_id,
        marque = v_brand,
        brand_id = v_brand_id,
        prix_achat_ht = 0,
        prix_vente_ht = 0,
        taux_tva = 10,
        unite = 'Forfait',
        source_reference = 'catalogue:installation-ballon-electrique',
        actif = true,
        updated_at = now()
    where id = v_labor_id;
  end if;

  v_labor_item := jsonb_build_object(
    'articleId', v_labor_id,
    'code', 'INST-BALLON-ELEC',
    'name', 'Installation ballons électriques',
    'description', v_labor_desc,
    'category', v_cat_name,
    'subcategory', v_sub_name,
    'brand', v_brand,
    'brandId', v_brand_id,
    'sourceReference', 'catalogue:installation-ballon-electrique',
    'qty', 1,
    'price', 0,
    'buy', 0,
    'tax', 10,
    'unit', 'Forfait',
    'role', 'labor'
  );

  for v_article in
    select a.*
    from public.articles a
    where a.organization_id = v_org
      and a.actif is not false
      and a.id <> v_labor_id
      and (
        lower(translate(coalesce(a.marque, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%atlantic%'
        or a.brand_id = v_brand_id
      )
      and (
        a.subcategory_id = v_sub_id
        or a.source_reference = 'catalogue:chauffeo-plus-2015'
        or lower(translate(coalesce(a.sous_categorie, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like 'ballon electrique%'
      )
      and lower(translate(coalesce(a.designation, '') || ' ' || coalesce(a.sous_categorie, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%thermodynam%'
      and lower(coalesce(a.reference, '')) <> 'inst-ballon-elec'
      and lower(translate(coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like 'installation ballon%'
    order by a.designation
  loop
    update public.articles
    set taux_tva = 10,
        updated_at = now()
    where id = v_article.id;

    v_principal := jsonb_build_object(
      'articleId', v_article.id,
      'code', v_article.reference,
      'name', v_article.designation,
      'description', coalesce(v_article.description, ''),
      'category', coalesce(nullif(v_article.categorie, ''), v_cat_name),
      'subcategory', coalesce(nullif(v_article.sous_categorie, ''), v_sub_name),
      'brand', coalesce(nullif(v_article.marque, ''), v_brand),
      'brandId', coalesce(v_article.brand_id, v_brand_id),
      'sourceReference', coalesce(v_article.source_reference, ''),
      'qty', 1,
      'price', coalesce(v_article.prix_vente_ht, 0),
      'buy', coalesce(v_article.prix_achat_ht, 0),
      'tax', 10,
      'unit', coalesce(nullif(v_article.unite, ''), 'Unité'),
      'role', 'principal'
    );

    select b.id
      into v_bundle_id
    from public.article_bundles b
    where b.organization_id = v_org
      and (
        exists (
          select 1
          from jsonb_array_elements(coalesce(b.items, '[]'::jsonb)) elem
          where elem->>'articleId' = v_article.id::text
            and coalesce(elem->>'role', 'principal') = 'principal'
        )
        or (
          lower(b.name) = lower(v_article.designation)
          and exists (
            select 1
            from jsonb_array_elements(coalesce(b.items, '[]'::jsonb)) elem
            where coalesce(elem->>'role', 'principal') = 'principal'
              and lower(coalesce(elem->>'code', '')) = lower(v_article.reference)
          )
        )
      )
    order by b.updated_at desc nulls last
    limit 1;

    if v_bundle_id is null then
      insert into public.article_bundles (
        organization_id, name, category, subcategory, brand, family, items, actif, updated_at
      ) values (
        v_org,
        v_article.designation,
        coalesce(nullif(v_article.categorie, ''), v_cat_name),
        coalesce(nullif(v_article.sous_categorie, ''), v_sub_name),
        coalesce(nullif(v_article.marque, ''), v_brand),
        coalesce(nullif(v_article.sous_categorie, ''), v_sub_name),
        jsonb_build_array(v_principal, v_labor_item),
        true,
        now()
      );
    else
      select coalesce(jsonb_agg(jsonb_set(elem, '{tax}', '10'::jsonb, true)), '[]'::jsonb)
        into v_kept
      from jsonb_array_elements(coalesce((
        select items from public.article_bundles where id = v_bundle_id
      ), '[]'::jsonb)) elem
      where coalesce(elem->>'articleId', '') <> v_article.id::text
        and lower(coalesce(elem->>'code', '')) <> 'inst-ballon-elec'
        and coalesce(elem->>'sourceReference', '') <> 'catalogue:installation-ballon-electrique'
        and lower(translate(coalesce(elem->>'name', ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) <> 'installation ballons electriques'
        and coalesce(elem->>'role', 'principal') <> 'principal';

      update public.article_bundles
      set name = v_article.designation,
          category = coalesce(nullif(v_article.categorie, ''), v_cat_name),
          subcategory = coalesce(nullif(v_article.sous_categorie, ''), v_sub_name),
          brand = coalesce(nullif(v_article.marque, ''), v_brand),
          family = coalesce(nullif(v_article.sous_categorie, ''), v_sub_name),
          items = jsonb_build_array(v_principal, v_labor_item) || coalesce(v_kept, '[]'::jsonb),
          actif = true,
          updated_at = now()
      where id = v_bundle_id;
    end if;

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Aucun ballon électrique Atlantic. Collez d''abord 20261027_chauffeo_plus.sql. Rien n''a été enregistré.';
  end if;
end $$;
