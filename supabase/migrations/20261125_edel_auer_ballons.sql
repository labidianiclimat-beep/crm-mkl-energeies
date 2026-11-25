-- Edel 270D/2 et Edel 200D/2 (Auer, ballon thermodynamique sur air).
-- Le groupe vaut 4 300 € TTC et 3 800 € TTC, TVA 5,5 %.
-- La fourniture (300 € TTC) et la pose (600 € TTC) déjà au catalogue sont reprises.
-- La fiche PDF est servie par /fiches/fiche-technique-edel-auer.pdf.

do $do$
declare
  v_org uuid;
  v_brand_id uuid;
  v_cat_id uuid;
  v_sub_id uuid;
  v_cat_name text;
  v_sub_name text;
  v_supply record;
  v_labor record;
  v_270 uuid;
  v_200 uuid;
  v_bundle_id uuid;
  v_items jsonb;
  v_desc_270 text;
  v_desc_200 text;
  v_pdf text := '/fiches/fiche-technique-edel-auer.pdf';
  v_pdf_name text := 'fiche-technique-edel-auer.pdf';
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
    and lower(translate(s.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) = 'ballon thermodynamique'
  limit 1;

  if v_sub_id is null then
    raise exception 'Sous-catégorie Ballon thermodynamique introuvable. Rien n''a été enregistré.';
  end if;

  select a.*
    into v_supply
  from public.articles a
  where a.organization_id = v_org
    and lower(a.reference) = 'frn-bal-bthermo'
    and a.actif is not false
  limit 1;

  select a.*
    into v_labor
  from public.articles a
  where a.organization_id = v_org
    and lower(a.reference) = 'inst-bthermo'
    and a.actif is not false
  limit 1;

  if v_supply.id is null or v_labor.id is null then
    raise exception 'Fourniture ou installation du ballon thermodynamique introuvable. Rien n''a été enregistré.';
  end if;

  select b.id
    into v_brand_id
  from public.article_brands b
  where b.organization_id = v_org
    and lower(translate(b.name, 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) = 'auer'
  limit 1;

  if v_brand_id is null then
    insert into public.article_brands (organization_id, name, actif)
    values (v_org, 'Auer', true)
    returning id into v_brand_id;
  end if;

  v_desc_270 := $txt$Fourniture d’un chauffe-eau thermodynamique Auer Edel 270D/2 – 270 litres – sur socle, sur air ambiant.

Marque : Auer
Gamme : Edel AIR
Nom commercial : Edel 270D/2
Capacité : 270 litres
Référence Auer : 353430
Dimensions : Ø 630 × H 1 780 mm
Poids à vide : 63 kg
COP à +7 °C : 3,14$txt$;

  v_desc_200 := $txt$Fourniture d’un chauffe-eau thermodynamique Auer Edel 200D/2 – 200 litres – sur socle, sur air ambiant.

Marque : Auer
Gamme : Edel AIR
Nom commercial : Edel 200D/2
Capacité : 200 litres
Référence Auer : 353420
Dimensions : Ø 630 × H 1 460 mm
Poids à vide : 56,5 kg
Cuve : inox
COP à +7 °C : 3,19
Classe énergétique : A+
Fluide frigorigène : R290 – 0,15 kg
Plage d’air : −7 à +35 °C
Eau chaude sanitaire : 30 à 60 °C
Alimentation : 230 V – 8 A
Pression acoustique à 2 m : 37 / 40 dB(A)$txt$;

  select a.id into v_270
  from public.articles a
  where a.organization_id = v_org
    and (
      lower(a.reference) = 'edel-270d-2'
      or a.source_reference = 'catalogue:edel-270d-2'
    )
  limit 1;

  if v_270 is null then
    insert into public.articles (
      organization_id, reference, designation, description,
      categorie, sous_categorie, category_id, subcategory_id,
      marque, brand_id, prix_achat_ht, prix_vente_ht, taux_tva,
      unite, actif, source_reference, fiche_nom, fiche_data, updated_at
    ) values (
      v_org, 'EDEL-270D-2', 'Edel 270D/2', v_desc_270,
      v_cat_name, v_sub_name, v_cat_id, v_sub_id,
      'Auer', v_brand_id, 0, 3222.75, 5.5,
      'Unité', true, 'catalogue:edel-270d-2', v_pdf_name, v_pdf, now()
    )
    returning id into v_270;
  else
    update public.articles
    set reference = 'EDEL-270D-2',
        designation = 'Edel 270D/2',
        description = v_desc_270,
        categorie = v_cat_name,
        sous_categorie = v_sub_name,
        category_id = v_cat_id,
        subcategory_id = v_sub_id,
        marque = 'Auer',
        brand_id = v_brand_id,
        prix_achat_ht = 0,
        prix_vente_ht = 3222.75,
        taux_tva = 5.5,
        unite = 'Unité',
        actif = true,
        source_reference = 'catalogue:edel-270d-2',
        fiche_nom = v_pdf_name,
        fiche_data = v_pdf,
        updated_at = now()
    where id = v_270;
  end if;

  select a.id into v_200
  from public.articles a
  where a.organization_id = v_org
    and (
      lower(a.reference) = 'edel-200d-2'
      or a.source_reference = 'catalogue:edel-200d-2'
    )
  limit 1;

  if v_200 is null then
    insert into public.articles (
      organization_id, reference, designation, description,
      categorie, sous_categorie, category_id, subcategory_id,
      marque, brand_id, prix_achat_ht, prix_vente_ht, taux_tva,
      unite, actif, source_reference, fiche_nom, fiche_data, updated_at
    ) values (
      v_org, 'EDEL-200D-2', 'Edel 200D/2', v_desc_200,
      v_cat_name, v_sub_name, v_cat_id, v_sub_id,
      'Auer', v_brand_id, 0, 2748.82, 5.5,
      'Unité', true, 'catalogue:edel-200d-2', v_pdf_name, v_pdf, now()
    )
    returning id into v_200;
  else
    update public.articles
    set reference = 'EDEL-200D-2',
        designation = 'Edel 200D/2',
        description = v_desc_200,
        categorie = v_cat_name,
        sous_categorie = v_sub_name,
        category_id = v_cat_id,
        subcategory_id = v_sub_id,
        marque = 'Auer',
        brand_id = v_brand_id,
        prix_achat_ht = 0,
        prix_vente_ht = 2748.82,
        taux_tva = 5.5,
        unite = 'Unité',
        actif = true,
        source_reference = 'catalogue:edel-200d-2',
        fiche_nom = v_pdf_name,
        fiche_data = v_pdf,
        updated_at = now()
    where id = v_200;
  end if;

  v_items := jsonb_build_array(
    jsonb_build_object(
      'articleId', v_270,
      'code', 'EDEL-270D-2',
      'name', 'Edel 270D/2',
      'description', v_desc_270,
      'category', v_cat_name,
      'subcategory', v_sub_name,
      'brand', 'Auer',
      'brandId', v_brand_id,
      'sourceReference', 'catalogue:edel-270d-2',
      'qty', 1,
      'price', 3222.75,
      'buy', 0,
      'tax', 5.5,
      'unit', 'Unité',
      'role', 'principal'
    ),
    jsonb_build_object(
      'articleId', v_supply.id,
      'code', v_supply.reference,
      'name', v_supply.designation,
      'description', coalesce(v_supply.description, ''),
      'category', coalesce(v_supply.categorie, v_cat_name),
      'subcategory', coalesce(v_supply.sous_categorie, v_sub_name),
      'brand', coalesce(v_supply.marque, ''),
      'brandId', v_supply.brand_id,
      'sourceReference', coalesce(v_supply.source_reference, ''),
      'qty', 1,
      'price', v_supply.prix_vente_ht,
      'buy', v_supply.prix_achat_ht,
      'tax', 5.5,
      'unit', coalesce(nullif(v_supply.unite, ''), 'Forfait'),
      'role', 'supply'
    ),
    jsonb_build_object(
      'articleId', v_labor.id,
      'code', v_labor.reference,
      'name', v_labor.designation,
      'description', coalesce(v_labor.description, ''),
      'category', coalesce(v_labor.categorie, v_cat_name),
      'subcategory', coalesce(v_labor.sous_categorie, v_sub_name),
      'brand', coalesce(v_labor.marque, ''),
      'brandId', v_labor.brand_id,
      'sourceReference', coalesce(v_labor.source_reference, ''),
      'qty', 1,
      'price', v_labor.prix_vente_ht,
      'buy', v_labor.prix_achat_ht,
      'tax', 5.5,
      'unit', coalesce(nullif(v_labor.unite, ''), 'Forfait'),
      'role', 'labor'
    )
  );

  select b.id into v_bundle_id
  from public.article_bundles b
  where b.organization_id = v_org
    and b.name = 'Edel 270D/2'
  limit 1;

  if v_bundle_id is null then
    insert into public.article_bundles (
      organization_id, name, category, subcategory, brand, family, items, pricing_mode, actif, updated_at
    ) values (
      v_org, 'Edel 270D/2', v_cat_name, v_sub_name, 'Auer', v_sub_name, v_items, 'detail', true, now()
    );
  else
    update public.article_bundles
    set category = v_cat_name,
        subcategory = v_sub_name,
        brand = 'Auer',
        family = v_sub_name,
        items = v_items,
        pricing_mode = 'detail',
        actif = true,
        updated_at = now()
    where id = v_bundle_id;
  end if;

  v_items := jsonb_set(v_items, '{0,articleId}', to_jsonb(v_200::text));
  v_items := jsonb_set(v_items, '{0,code}', '"EDEL-200D-2"'::jsonb);
  v_items := jsonb_set(v_items, '{0,name}', '"Edel 200D/2"'::jsonb);
  v_items := jsonb_set(v_items, '{0,description}', to_jsonb(v_desc_200));
  v_items := jsonb_set(v_items, '{0,sourceReference}', '"catalogue:edel-200d-2"'::jsonb);
  v_items := jsonb_set(v_items, '{0,price}', '2748.82'::jsonb);

  select b.id into v_bundle_id
  from public.article_bundles b
  where b.organization_id = v_org
    and b.name = 'Edel 200D/2'
  limit 1;

  if v_bundle_id is null then
    insert into public.article_bundles (
      organization_id, name, category, subcategory, brand, family, items, pricing_mode, actif, updated_at
    ) values (
      v_org, 'Edel 200D/2', v_cat_name, v_sub_name, 'Auer', v_sub_name, v_items, 'detail', true, now()
    );
  else
    update public.article_bundles
    set category = v_cat_name,
        subcategory = v_sub_name,
        brand = 'Auer',
        family = v_sub_name,
        items = v_items,
        pricing_mode = 'detail',
        actif = true,
        updated_at = now()
    where id = v_bundle_id;
  end if;
end
$do$;
