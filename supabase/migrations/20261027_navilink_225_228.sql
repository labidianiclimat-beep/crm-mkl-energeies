-- Navilink 228 — thermostat modulant connecté Atlantic, radio, piles.
-- Un article, 260,00 € HT, TVA 10 % (286,00 € TTC). Réf. fabricant 074 903.
-- Remplace l’article Navilink 225/228 s’il a déjà été collé.
-- Ajouté à chaque groupe Alfea, juste avant la fourniture.
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
  v_article_id uuid;
  v_desc text;
  v_item jsonb;
  v_reference text := '074903';
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

  select a.category_id, a.subcategory_id, nullif(a.categorie, ''), nullif(a.sous_categorie, '')
    into v_cat_id, v_sub_id, v_cat_name, v_sub_name
  from public.articles a
  where a.organization_id = v_org
    and a.actif is not false
    and a.subcategory_id is not null
    and lower(translate(coalesce(a.designation, '') || ' ' || coalesce(a.marque, '') || ' ' || coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%alfea%'
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%climatis%'
  order by a.updated_at desc nulls last
  limit 1;

  if v_sub_id is null then
    select c.id, s.id, c.name, s.name
      into v_cat_id, v_sub_id, v_cat_name, v_sub_name
    from public.article_bundles b
    join public.article_categories c
      on c.organization_id = b.organization_id
     and lower(translate(c.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc'))
       = lower(translate(b.category, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc'))
    join public.article_subcategories s
      on s.organization_id = b.organization_id
     and s.category_id = c.id
     and lower(translate(s.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc'))
       = lower(translate(b.subcategory, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc'))
    where b.organization_id = v_org
      and nullif(b.subcategory, '') is not null
      and lower(translate(
        coalesce(b.name, '') || ' ' || coalesce(b.family, '') || ' ' || coalesce(b.brand, '')
        || ' ' || coalesce(b.subcategory, '') || ' ' || coalesce(b.items::text, ''),
        'àâäéèêëïîôùûüç',
        'aaaeeeeiioouuuc'
      )) like '%alfea%'
    limit 1;
  end if;

  if v_sub_id is null then
    select c.id, s.id, c.name, s.name
      into v_cat_id, v_sub_id, v_cat_name, v_sub_name
    from public.article_subcategories s
    join public.article_categories c
      on c.id = s.category_id and c.organization_id = s.organization_id
    where s.organization_id = v_org
      and lower(translate(s.name, 'àâäéèêëïîôùûüç/-’''', 'aaaeeeeiioouuuc     ')) like '%pompe%chaleur%'
      and lower(translate(c.name || ' ' || s.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%climatis%'
      and lower(translate(s.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%air air%'
    order by
      case when lower(translate(s.name, 'àâäéèêëïîôùûüç/-’''', 'aaaeeeeiioouuuc     ')) like '%air%eau%' then 0 else 1 end,
      case when lower(translate(s.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%duo%' then 1 else 0 end,
      s.name
    limit 1;
  end if;

  if v_sub_id is null then
    select c.id, c.name
      into v_cat_id, v_cat_name
    from public.article_categories c
    where c.organization_id = v_org
      and lower(translate(c.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) in ('chauffage', 'pompe a chaleur')
    order by case when lower(translate(c.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) = 'chauffage' then 0 else 1 end
    limit 1;

    if v_cat_id is null then
      raise exception 'Dossier Chauffage introuvable. Rien n''a été enregistré.';
    end if;

    insert into public.article_subcategories (organization_id, category_id, name, sort_order)
    values (v_org, v_cat_id, 'Pompe à chaleur', 10)
    returning id, name into v_sub_id, v_sub_name;
  end if;

  v_cat_name := coalesce(nullif(v_cat_name, ''), 'Chauffage');
  v_sub_name := coalesce(nullif(v_sub_name, ''), 'Pompe à chaleur');

  v_desc := 'Navilink 228' || E'\n'
    || 'Thermostat modulant connecté Atlantic pour pompes à chaleur Alfea.' || E'\n\n'
    || 'Navilink 228 Radio-Connect, réf. 074 903 : piles fournies, thermostat sans fil, communication radio.' || E'\n\n'
    || 'Compatible avec les pompes à chaleur air/eau Alfea Excellia M, Alfea Extensa M et Alfea Excellia S.' || E'\n'
    || 'Programmation horaire, mode absence au-delà de 48 h, eau chaude sanitaire en marche, arrêt ou boost.' || E'\n'
    || 'Application Atlantic Cozytouch, sans interface et sans bridge. Protocole Zigbee.' || E'\n\n'
    || 'Marque : ' || v_brand || E'\n'
    || 'Alimentation : piles' || E'\n'
    || 'Communication : radio';

  select a.id into v_article_id
  from public.articles a
  where a.organization_id = v_org
    and (
      lower(a.reference) in ('074903', '074902-074903')
      or a.source_reference in ('catalogue:navilink-228', 'catalogue:navilink-225-228')
      or lower(translate(coalesce(a.designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%navilink 225%'
    )
  order by case
    when a.source_reference in ('catalogue:navilink-228', 'catalogue:navilink-225-228') then 0
    when lower(a.reference) in ('074903', '074902-074903') then 1
    else 2
  end
  limit 1;

  if v_article_id is null then
    insert into public.articles (
      organization_id, reference, designation, description,
      categorie, sous_categorie, category_id, subcategory_id,
      marque, brand_id, prix_achat_ht, prix_vente_ht, taux_tva,
      unite, actif, source_reference, updated_at
    ) values (
      v_org, v_reference, 'Navilink 228', v_desc,
      v_cat_name, v_sub_name, v_cat_id, v_sub_id,
      v_brand, v_brand_id, 0, 260, 10,
      'Unité', true, 'catalogue:navilink-228', now()
    )
    returning id into v_article_id;
  else
    update public.articles
    set reference = v_reference,
        designation = 'Navilink 228',
        description = v_desc,
        categorie = v_cat_name,
        sous_categorie = v_sub_name,
        category_id = v_cat_id,
        subcategory_id = v_sub_id,
        marque = v_brand,
        brand_id = v_brand_id,
        prix_vente_ht = 260,
        taux_tva = 10,
        source_reference = 'catalogue:navilink-228',
        actif = true,
        updated_at = now()
    where id = v_article_id;
  end if;

  update public.articles
  set actif = false,
      updated_at = now()
  where organization_id = v_org
    and id <> v_article_id
    and (
      lower(reference) in ('074902', '074902-074903')
      or source_reference = 'catalogue:navilink-225-228'
      or lower(translate(coalesce(designation, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%navilink 225%'
    );

  v_item := jsonb_build_object(
    'articleId', v_article_id,
    'code', v_reference,
    'name', 'Navilink 228',
    'description', v_desc,
    'category', v_cat_name,
    'subcategory', v_sub_name,
    'brand', v_brand,
    'brandId', v_brand_id,
    'sourceReference', 'catalogue:navilink-228',
    'qty', 1,
    'price', 260,
    'buy', 0,
    'tax', 10,
    'unit', 'Unité',
    'role', 'option'
  );

  update public.article_bundles b
  set items = (
      with kept as (
        select elem, ordinality
        from jsonb_array_elements(coalesce(b.items, '[]'::jsonb)) with ordinality as listed(elem, ordinality)
        where lower(coalesce(elem->>'code', '')) not in ('074903', '074902', '074902-074903')
          and coalesce(elem->>'sourceReference', '') not in ('catalogue:navilink-228', 'catalogue:navilink-225-228')
          and lower(translate(coalesce(elem->>'name', ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%navilink 225%'
          and lower(translate(coalesce(elem->>'name', ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%navilink 228%'
      ),
      spot as (
        select min(ordinality) as pos
        from kept
        where lower(coalesce(elem->>'role', '')) = 'supply'
          or lower(translate(
            coalesce(elem->>'name', '') || ' ' || coalesce(elem->>'code', '') || ' ' || coalesce(elem->>'subcategory', ''),
            'àâäéèêëïîôùûüç',
            'aaaeeeeiioouuuc'
          )) like '%fourniture%'
      )
      select coalesce(jsonb_agg(elem order by sort_key), '[]'::jsonb)
      from (
        select elem, ordinality::numeric as sort_key from kept
        union all
        select v_item, coalesce((select pos from spot), 1000000)::numeric - 0.5
      ) ordered
    ),
      updated_at = now()
  where b.organization_id = v_org
    and lower(translate(
      coalesce(b.name, '') || ' ' || coalesce(b.family, '') || ' ' || coalesce(b.brand, '')
      || ' ' || coalesce(b.subcategory, '') || ' ' || coalesce(b.items::text, ''),
      'àâäéèêëïîôùûüç',
      'aaaeeeeiioouuuc'
    )) like '%alfea%';
end $$;
