-- Zubadan 23 kW tri — Mitsubishi, pompe à chaleur.
-- Brochure DC331 (février 2021) : chauffage seul, R410A, triphasé.
-- À coller dans Supabase → SQL Editor.
-- Le prix de vente reste à 0 : la brochure ne donne pas de tarif.

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
  v_supply jsonb;
  v_labor jsonb;
  v_desc text := $fiche$Zubadan 23 kW Tri
Groupe extérieur PUHZ-SHW230YKA2 · Module hydraulique ERSE-YM9ED
Chauffage seul, réversible, split à liaisons frigorifiques. Pas de ballon ECS intégré.

Marque : Mitsubishi Electric
Réfrigérant : R410A
Efficacité énergétique saisonnière - chauffage (35°C/55°C) : 165 % / 128 %
SCOP 35°C / 55°C : 4,21 / 3,28
Température de départ maximum : 60 °C
Puissance calorifique +7°C / +35°C : 11,40 – 23,00 – 28,00 kW
COP +7°C / 35°C nominal : 3,65
Puissance calorifique : -7°C / +35°C : 23,00 kW
Puissance calorifique -15°C / +35°C : 22,90 kW
Puissance calorifique -15°C / +45°C : 22,50 kW
Puissance froid +35°C / +18°C : 20,00 kW
EER +35°C / +18°C : 3,55
Niveau sonore : 72,5 dB(A) / 54,9 dB(A) à 1 m (groupe) · 45 / 30 dB(A) (module)
Ballon ECS intégré : Non
Vase d'expansion : Non fourni
Poids de fonctionnement : 149 kg (groupe extérieur) · 64 kg (module)
Plage de fonctionnement conseillée mini./maxi. mode chaud : -25 °C / +35 °C
Alimentation : 400 V triphasé
Appoint électrique : puissance / calibre disjoncteur / câble d'alimentation : 9 kW (3 + 6)
Dimensions groupe : 1338 × 1050 × 360 mm
Dimensions module : 950 × 600 × 360 mm

Garantie :
- 2 ans pièces
- +1 an pièces et main d'œuvre sous conditions Mitsubishi Electric
- 5 ans corps de chauffe, compresseur, échangeur et ballon ECS$fiche$;
begin
  select b.organization_id, b.id, b.name
    into v_org, v_brand_id, v_brand
  from public.article_brands b
  where b.actif is not false
    and lower(b.name) like '%mitsubishi%'
  order by (
    select count(*)
    from public.articles a
    where a.organization_id = b.organization_id
      and a.brand_id = b.id
      and lower(coalesce(a.sous_categorie, '')) like '%pompe%'
  ) desc,
  case when lower(b.name) like '%electric%' then 0 else 1 end,
  b.name
  limit 1;

  if v_brand_id is null then
    raise exception 'Marque Mitsubishi introuvable dans le catalogue.';
  end if;

  select a.category_id, a.subcategory_id, nullif(a.categorie, ''), nullif(a.sous_categorie, '')
    into v_cat_id, v_sub_id, v_cat_name, v_sub_name
  from public.articles a
  where a.organization_id = v_org
    and a.brand_id = v_brand_id
    and a.actif is not false
    and lower(translate(coalesce(a.categorie, '') || ' ' || coalesce(a.sous_categorie, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%pompe%chaleur%'
    and lower(translate(coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%fourniture%'
    and lower(translate(coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%installation%'
    and lower(translate(coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%main d%'
  order by case when a.subcategory_id is not null then 0 else 1 end, a.updated_at desc nulls last
  limit 1;

  if v_sub_id is null then
    select c.id, s.id, c.name, s.name
      into v_cat_id, v_sub_id, v_cat_name, v_sub_name
    from public.article_categories c
    join public.article_subcategories s
      on s.category_id = c.id
     and s.organization_id = c.organization_id
    where c.organization_id = v_org
      and (
        lower(translate(s.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%pompe%chaleur%'
        or lower(translate(c.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%pompe%chaleur%'
      )
    order by
      case
        when lower(translate(s.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) in ('pompe a chaleur', 'pompe a chaleur air/eau', 'pompe a chaleur air eau') then 0
        else 1
      end,
      case when lower(translate(c.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) = 'chauffage' then 0 else 1 end,
      s.sort_order
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
      insert into public.article_categories (organization_id, name, slug, description, icon, sort_order)
      values (v_org, 'Chauffage', 'chauffage', 'PAC, radiateurs et chauffage électrique', 'Flame', 10)
      returning id, name into v_cat_id, v_cat_name;
    end if;

    insert into public.article_subcategories (organization_id, category_id, name, sort_order)
    select v_org, v_cat_id, 'Pompe à chaleur', 10
    where not exists (
      select 1
      from public.article_subcategories s
      where s.organization_id = v_org
        and s.category_id = v_cat_id
        and lower(translate(s.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) = 'pompe a chaleur'
    );

    select s.id, s.name
      into v_sub_id, v_sub_name
    from public.article_subcategories s
    where s.organization_id = v_org
      and s.category_id = v_cat_id
      and lower(translate(s.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) = 'pompe a chaleur'
    limit 1;
  end if;

  if v_sub_id is null then
    raise exception 'Impossible de ranger l''article dans Pompe à chaleur.';
  end if;

  v_cat_name := coalesce(nullif(v_cat_name, ''), 'Chauffage');
  v_sub_name := coalesce(nullif(v_sub_name, ''), 'Pompe à chaleur');

  select a.id
    into v_article_id
  from public.articles a
  where a.organization_id = v_org
    and lower(a.reference) = 'puhz-shw230yka2'
  limit 1;

  if v_article_id is null then
    insert into public.articles (
      organization_id, reference, designation, description,
      categorie, sous_categorie, category_id, subcategory_id,
      marque, brand_id, prix_achat_ht, prix_vente_ht, taux_tva,
      unite, actif, power_w, updated_at
    ) values (
      v_org, 'PUHZ-SHW230YKA2', 'Zubadan 23 kW Tri', v_desc,
      v_cat_name, v_sub_name, v_cat_id, v_sub_id,
      v_brand, v_brand_id, 0, 0, 5.5,
      'Unité', true, 23000, now()
    )
    returning id into v_article_id;
  else
    update public.articles
    set designation = 'Zubadan 23 kW Tri',
        description = v_desc,
        categorie = v_cat_name,
        sous_categorie = v_sub_name,
        category_id = v_cat_id,
        subcategory_id = v_sub_id,
        marque = v_brand,
        brand_id = v_brand_id,
        taux_tva = 5.5,
        power_w = 23000,
        actif = true,
        updated_at = now()
    where id = v_article_id;
  end if;

  select jsonb_build_object(
    'articleId', a.id,
    'code', a.reference,
    'name', a.designation,
    'description', coalesce(a.description, ''),
    'category', a.categorie,
    'subcategory', coalesce(a.sous_categorie, ''),
    'brand', coalesce(a.marque, ''),
    'brandId', coalesce(a.brand_id::text, ''),
    'sourceReference', coalesce(a.source_reference, ''),
    'qty', 1,
    'price', a.prix_vente_ht,
    'buy', a.prix_achat_ht,
    'tax', a.taux_tva,
    'unit', coalesce(a.unite, 'Unité'),
    'role', 'supply'
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
    group by i->>'articleId'
  ) used on used.article_id = a.id::text
  where a.organization_id = v_org
    and a.actif is not false
    and lower(translate(coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%fourniture%'
  order by used.uses desc, a.designation
  limit 1;

  select jsonb_build_object(
    'articleId', a.id,
    'code', a.reference,
    'name', a.designation,
    'description', coalesce(a.description, ''),
    'category', a.categorie,
    'subcategory', coalesce(a.sous_categorie, ''),
    'brand', coalesce(a.marque, ''),
    'brandId', coalesce(a.brand_id::text, ''),
    'sourceReference', coalesce(a.source_reference, ''),
    'qty', 1,
    'price', a.prix_vente_ht,
    'buy', a.prix_achat_ht,
    'tax', a.taux_tva,
    'unit', coalesce(a.unite, 'Unité'),
    'role', 'labor'
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
    group by i->>'articleId'
  ) used on used.article_id = a.id::text
  where a.organization_id = v_org
    and a.actif is not false
    and lower(translate(coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) not like '%fourniture%'
    and (
      lower(translate(coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%installation%'
      or lower(translate(coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like '%main d%'
      or lower(translate(coalesce(a.designation, '') || ' ' || coalesce(a.reference, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) ~ '(^|[^a-z])pose([^a-z]|$)'
    )
  order by used.uses desc, a.designation
  limit 1;

  if v_supply is null or v_labor is null then
    raise exception 'Fourniture ou main-d''œuvre des groupes PAC introuvable. Rien n''a été enregistré.';
  end if;

  if exists (
    select 1
    from public.article_bundles b
    where b.organization_id = v_org
      and lower(b.name) = 'zubadan 23 kw tri'
  ) then
    update public.article_bundles
    set category = v_cat_name,
        subcategory = v_sub_name,
        brand = v_brand,
        family = v_sub_name,
        items = jsonb_build_array(
          jsonb_build_object(
            'articleId', v_article_id,
            'code', 'PUHZ-SHW230YKA2',
            'name', 'Zubadan 23 kW Tri',
            'description', v_desc,
            'category', v_cat_name,
            'subcategory', v_sub_name,
            'brand', v_brand,
            'brandId', v_brand_id,
            'sourceReference', '',
            'qty', 1,
            'price', 0,
            'buy', 0,
            'tax', 5.5,
            'unit', 'Unité',
            'role', 'principal'
          ),
          v_supply,
          v_labor
        ),
        actif = true,
        updated_at = now()
    where organization_id = v_org
      and lower(name) = 'zubadan 23 kw tri';
  else
    insert into public.article_bundles (
      organization_id, name, category, subcategory, brand, family, items, actif, updated_at
    ) values (
      v_org,
      'Zubadan 23 kW Tri',
      v_cat_name,
      v_sub_name,
      v_brand,
      v_sub_name,
      jsonb_build_array(
        jsonb_build_object(
          'articleId', v_article_id,
          'code', 'PUHZ-SHW230YKA2',
          'name', 'Zubadan 23 kW Tri',
          'description', v_desc,
          'category', v_cat_name,
          'subcategory', v_sub_name,
          'brand', v_brand,
          'brandId', v_brand_id,
          'sourceReference', '',
          'qty', 1,
          'price', 0,
          'buy', 0,
          'tax', 5.5,
          'unit', 'Unité',
          'role', 'principal'
        ),
        v_supply,
        v_labor
      ),
      true,
      now()
    );
  end if;
end $$;
