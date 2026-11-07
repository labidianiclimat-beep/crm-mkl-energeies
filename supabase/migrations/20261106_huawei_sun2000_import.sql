-- Import Huawei SUN2000. N’insère rien tant que la confirmation n’est pas remplacée.
-- Projet autorisé : MKL CRM RECETTE, référence xqbjfytrssslnsxxdrou.
-- N’ouvrez pas le projet MKL Energies CRM.
-- Ne modifie aucun article existant, aucun prix et aucun devis.
-- Confirmation attendue : CONFIRME-RECETTE-xqbjfytrssslnsxxdrou

do $$
declare
  v_confirmation text := 'EN-ATTENTE';
  v_org uuid;
  v_brand_id uuid;
  v_cat_id uuid;
  v_sub_id uuid;
  v_created integer := 0;
begin
  if v_confirmation <> 'CONFIRME-RECETTE-xqbjfytrssslnsxxdrou' then
    raise exception 'Import non confirmé. Aucun article créé. Lancez d’abord la prévisualisation, puis remplacez EN-ATTENTE.';
  end if;

  select o.id
    into v_org
  from public.organizations o
  where exists (
    select 1
    from public.article_categories c
    join public.article_subcategories s
      on s.category_id = c.id
     and s.organization_id = c.organization_id
    where c.organization_id = o.id
      and lower(c.name) = 'photovoltaïque'
      and lower(s.name) = 'onduleurs'
  )
  order by (select count(*) from public.articles a where a.organization_id = o.id) desc, o.name
  limit 1;

  if v_org is null then
    raise exception 'Catégorie Photovoltaïque ou sous-catégorie Onduleurs absente. Aucun onduleur Huawei n’a été créé.';
  end if;

  select c.id, s.id
    into v_cat_id, v_sub_id
  from public.article_categories c
  join public.article_subcategories s
    on s.category_id = c.id
   and s.organization_id = c.organization_id
  where c.organization_id = v_org
    and lower(c.name) = 'photovoltaïque'
    and lower(s.name) = 'onduleurs'
  order by s.sort_order
  limit 1;

  select b.id
    into v_brand_id
  from public.article_brands b
  where b.organization_id = v_org
    and lower(b.name) = 'huawei'
  order by b.actif desc, b.name
  limit 1;

  if v_brand_id is null then
    insert into public.article_brands (organization_id, name, actif)
    values (v_org, 'Huawei', true)
    returning id into v_brand_id;
  end if;

  create temporary table huawei_sun2000_candidates (
    manufacturer_reference text primary key,
    reference text not null,
    designation text not null,
    description text not null,
    description_technique text not null,
    power_w numeric not null
  ) on commit drop;

  insert into huawei_sun2000_candidates (
    manufacturer_reference, reference, designation, description, description_technique, power_w
  ) values
  ($huawei$SUN2000-3K-LB0$huawei$, $huawei$HUA-SUN2000-3K-LB0$huawei$, $huawei$Onduleur hybride Huawei SUN2000-3K-LB0 — 3 kW — Monophasé$huawei$, $huawei$Fourniture d’un onduleur photovoltaïque hybride Huawei SUN2000, de puissance nominale 3 kW, compatible avec un système de stockage Huawei LUNA2000 selon les spécifications du fabricant, intégrant une gestion MPPT et une supervision via FusionSolar.$huawei$, $huawei$Onduleur hybride photovoltaïque Huawei SUN2000-3K-LB0, réseau monophasé, puissance nominale AC 3 kW, puissance photovoltaïque maximale recommandée 4,5 kWc, 2 trackers MPPT. Compatibilité batterie et fonctionnalités de secours soumises aux conditions et équipements définis par Huawei.

Référence constructeur : SUN2000-3K-LB0
Gamme : Huawei SUN2000
Type de réseau : Monophasé
Puissance AC : 3000 W
Puissance PV maximale recommandée : 4500 Wc
Nombre de MPPT : 2
Rendement maximal : 97,8 %
Tension DC maximale : 600 V
Plage MPPT : 40 à 560 V
Batteries compatibles selon Huawei : LUNA2000-5/10/15-S0 et LUNA2000-7/14/21-S1
Secours : Secours uniquement avec le coffret SmartGuard-63A-S0, non fourni. La batterie n’est pas incluse.$huawei$, 3000::numeric),
  ($huawei$SUN2000-3.68K-LB0$huawei$, $huawei$HUA-SUN2000-3.68K-LB0$huawei$, $huawei$Onduleur hybride Huawei SUN2000-3.68K-LB0 — 3,68 kW — Monophasé$huawei$, $huawei$Fourniture d’un onduleur photovoltaïque hybride Huawei SUN2000, de puissance nominale 3,68 kW, compatible avec un système de stockage Huawei LUNA2000 selon les spécifications du fabricant, intégrant une gestion MPPT et une supervision via FusionSolar.$huawei$, $huawei$Onduleur hybride photovoltaïque Huawei SUN2000-3.68K-LB0, réseau monophasé, puissance nominale AC 3,68 kW, puissance photovoltaïque maximale recommandée 5,52 kWc, 2 trackers MPPT. Compatibilité batterie et fonctionnalités de secours soumises aux conditions et équipements définis par Huawei.

Référence constructeur : SUN2000-3.68K-LB0
Gamme : Huawei SUN2000
Type de réseau : Monophasé
Puissance AC : 3680 W
Puissance PV maximale recommandée : 5520 Wc
Nombre de MPPT : 2
Rendement maximal : 97,8 %
Tension DC maximale : 600 V
Plage MPPT : 40 à 560 V
Batteries compatibles selon Huawei : LUNA2000-5/10/15-S0 et LUNA2000-7/14/21-S1
Secours : Secours uniquement avec le coffret SmartGuard-63A-S0, non fourni. La batterie n’est pas incluse.$huawei$, 3680::numeric),
  ($huawei$SUN2000-4K-LB0$huawei$, $huawei$HUA-SUN2000-4K-LB0$huawei$, $huawei$Onduleur hybride Huawei SUN2000-4K-LB0 — 4 kW — Monophasé$huawei$, $huawei$Fourniture d’un onduleur photovoltaïque hybride Huawei SUN2000, de puissance nominale 4 kW, compatible avec un système de stockage Huawei LUNA2000 selon les spécifications du fabricant, intégrant une gestion MPPT et une supervision via FusionSolar.$huawei$, $huawei$Onduleur hybride photovoltaïque Huawei SUN2000-4K-LB0, réseau monophasé, puissance nominale AC 4 kW, puissance photovoltaïque maximale recommandée 6 kWc, 2 trackers MPPT. Compatibilité batterie et fonctionnalités de secours soumises aux conditions et équipements définis par Huawei.

Référence constructeur : SUN2000-4K-LB0
Gamme : Huawei SUN2000
Type de réseau : Monophasé
Puissance AC : 4000 W
Puissance PV maximale recommandée : 6000 Wc
Nombre de MPPT : 2
Rendement maximal : 97,8 %
Tension DC maximale : 600 V
Plage MPPT : 40 à 560 V
Batteries compatibles selon Huawei : LUNA2000-5/10/15-S0 et LUNA2000-7/14/21-S1
Secours : Secours uniquement avec le coffret SmartGuard-63A-S0, non fourni. La batterie n’est pas incluse.$huawei$, 4000::numeric),
  ($huawei$SUN2000-4.6K-LB0$huawei$, $huawei$HUA-SUN2000-4.6K-LB0$huawei$, $huawei$Onduleur hybride Huawei SUN2000-4.6K-LB0 — 4,6 kW — Monophasé$huawei$, $huawei$Fourniture d’un onduleur photovoltaïque hybride Huawei SUN2000, de puissance nominale 4,6 kW, compatible avec un système de stockage Huawei LUNA2000 selon les spécifications du fabricant, intégrant une gestion MPPT et une supervision via FusionSolar.$huawei$, $huawei$Onduleur hybride photovoltaïque Huawei SUN2000-4.6K-LB0, réseau monophasé, puissance nominale AC 4,6 kW, puissance photovoltaïque maximale recommandée 6,9 kWc, 2 trackers MPPT. Compatibilité batterie et fonctionnalités de secours soumises aux conditions et équipements définis par Huawei.

Référence constructeur : SUN2000-4.6K-LB0
Gamme : Huawei SUN2000
Type de réseau : Monophasé
Puissance AC : 4600 W
Puissance PV maximale recommandée : 6900 Wc
Nombre de MPPT : 2
Rendement maximal : 97,8 %
Tension DC maximale : 600 V
Plage MPPT : 40 à 560 V
Batteries compatibles selon Huawei : LUNA2000-5/10/15-S0 et LUNA2000-7/14/21-S1
Secours : Secours uniquement avec le coffret SmartGuard-63A-S0, non fourni. La batterie n’est pas incluse.$huawei$, 4600::numeric),
  ($huawei$SUN2000-5K-LB0$huawei$, $huawei$HUA-SUN2000-5K-LB0$huawei$, $huawei$Onduleur hybride Huawei SUN2000-5K-LB0 — 5 kW — Monophasé$huawei$, $huawei$Fourniture d’un onduleur photovoltaïque hybride Huawei SUN2000, de puissance nominale 5 kW, compatible avec un système de stockage Huawei LUNA2000 selon les spécifications du fabricant, intégrant une gestion MPPT et une supervision via FusionSolar.$huawei$, $huawei$Onduleur hybride photovoltaïque Huawei SUN2000-5K-LB0, réseau monophasé, puissance nominale AC 5 kW, puissance photovoltaïque maximale recommandée 7,5 kWc, 2 trackers MPPT. Compatibilité batterie et fonctionnalités de secours soumises aux conditions et équipements définis par Huawei.

Référence constructeur : SUN2000-5K-LB0
Gamme : Huawei SUN2000
Type de réseau : Monophasé
Puissance AC : 5000 W
Puissance PV maximale recommandée : 7500 Wc
Nombre de MPPT : 2
Rendement maximal : 97,8 %
Tension DC maximale : 600 V
Plage MPPT : 40 à 560 V
Batteries compatibles selon Huawei : LUNA2000-5/10/15-S0 et LUNA2000-7/14/21-S1
Secours : Secours uniquement avec le coffret SmartGuard-63A-S0, non fourni. La batterie n’est pas incluse.$huawei$, 5000::numeric),
  ($huawei$SUN2000-6K-LB0$huawei$, $huawei$HUA-SUN2000-6K-LB0$huawei$, $huawei$Onduleur hybride Huawei SUN2000-6K-LB0 — 6 kW — Monophasé$huawei$, $huawei$Fourniture d’un onduleur photovoltaïque hybride Huawei SUN2000, de puissance nominale 6 kW, compatible avec un système de stockage Huawei LUNA2000 selon les spécifications du fabricant, intégrant une gestion MPPT et une supervision via FusionSolar.$huawei$, $huawei$Onduleur hybride photovoltaïque Huawei SUN2000-6K-LB0, réseau monophasé, puissance nominale AC 6 kW, puissance photovoltaïque maximale recommandée 9 kWc, 2 trackers MPPT. Compatibilité batterie et fonctionnalités de secours soumises aux conditions et équipements définis par Huawei.

Référence constructeur : SUN2000-6K-LB0
Gamme : Huawei SUN2000
Type de réseau : Monophasé
Puissance AC : 6000 W
Puissance PV maximale recommandée : 9000 Wc
Nombre de MPPT : 2
Rendement maximal : 97,8 %
Tension DC maximale : 600 V
Plage MPPT : 40 à 560 V
Batteries compatibles selon Huawei : LUNA2000-5/10/15-S0 et LUNA2000-7/14/21-S1
Secours : Secours uniquement avec le coffret SmartGuard-63A-S0, non fourni. La batterie n’est pas incluse.$huawei$, 6000::numeric),
  ($huawei$SUN2000-8K-LC0$huawei$, $huawei$HUA-SUN2000-8K-LC0$huawei$, $huawei$Onduleur hybride Huawei SUN2000-8K-LC0 — 8 kW — Monophasé$huawei$, $huawei$Fourniture d’un onduleur photovoltaïque hybride Huawei SUN2000, de puissance nominale 8 kW, compatible avec un système de stockage Huawei LUNA2000 selon les spécifications du fabricant, intégrant une gestion MPPT et une supervision via FusionSolar.$huawei$, $huawei$Onduleur hybride photovoltaïque Huawei SUN2000-8K-LC0, réseau monophasé, puissance nominale AC 8 kW, puissance photovoltaïque maximale recommandée 12 kWc, 3 trackers MPPT. Compatibilité batterie et fonctionnalités de secours soumises aux conditions et équipements définis par Huawei.

Référence constructeur : SUN2000-8K-LC0
Gamme : Huawei SUN2000
Type de réseau : Monophasé
Puissance AC : 8000 W
Puissance PV maximale recommandée : 12000 Wc
Nombre de MPPT : 3
Rendement maximal : 98,1 %
Tension DC maximale : 600 V
Plage MPPT : 40 à 560 V
Batteries compatibles selon Huawei : LUNA2000-5/10/15-S0 et LUNA2000-7/14/21-S1
Secours : Secours uniquement avec le coffret SmartGuard-63A-S0, non fourni. La batterie n’est pas incluse.$huawei$, 8000::numeric),
  ($huawei$SUN2000-10K-LC0$huawei$, $huawei$HUA-SUN2000-10K-LC0$huawei$, $huawei$Onduleur hybride Huawei SUN2000-10K-LC0 — 10 kW — Monophasé$huawei$, $huawei$Fourniture d’un onduleur photovoltaïque hybride Huawei SUN2000, de puissance nominale 10 kW, compatible avec un système de stockage Huawei LUNA2000 selon les spécifications du fabricant, intégrant une gestion MPPT et une supervision via FusionSolar.$huawei$, $huawei$Onduleur hybride photovoltaïque Huawei SUN2000-10K-LC0, réseau monophasé, puissance nominale AC 10 kW, puissance photovoltaïque maximale recommandée 15 kWc, 3 trackers MPPT. Compatibilité batterie et fonctionnalités de secours soumises aux conditions et équipements définis par Huawei.

Référence constructeur : SUN2000-10K-LC0
Gamme : Huawei SUN2000
Type de réseau : Monophasé
Puissance AC : 10000 W
Puissance PV maximale recommandée : 15000 Wc
Nombre de MPPT : 3
Rendement maximal : 98,1 %
Tension DC maximale : 600 V
Plage MPPT : 40 à 560 V
Batteries compatibles selon Huawei : LUNA2000-5/10/15-S0 et LUNA2000-7/14/21-S1
Secours : Secours uniquement avec le coffret SmartGuard-63A-S0, non fourni. La batterie n’est pas incluse.$huawei$, 10000::numeric),
  ($huawei$SUN2000-5K-MAP0$huawei$, $huawei$HUA-SUN2000-5K-MAP0$huawei$, $huawei$Onduleur hybride Huawei SUN2000-5K-MAP0 — 5 kW — Triphasé$huawei$, $huawei$Fourniture d’un onduleur photovoltaïque hybride Huawei SUN2000, de puissance nominale 5 kW, compatible avec un système de stockage Huawei LUNA2000 selon les spécifications du fabricant, intégrant une gestion MPPT et une supervision via FusionSolar.$huawei$, $huawei$Onduleur hybride photovoltaïque Huawei SUN2000-5K-MAP0, réseau triphasé, puissance nominale AC 5 kW, puissance photovoltaïque maximale recommandée 9 kWc, 2 trackers MPPT. Compatibilité batterie et fonctionnalités de secours soumises aux conditions et équipements définis par Huawei.

Référence constructeur : SUN2000-5K-MAP0
Gamme : Huawei SUN2000
Type de réseau : Triphasé
Puissance AC : 5000 W
Puissance PV maximale recommandée : 9000 Wc
Nombre de MPPT : 2
Rendement maximal : 98,4 %
Tension DC maximale : 1100 V
Plage de fonctionnement PV : 160 à 1 000 V
Batteries compatibles selon Huawei : LUNA2000-5/10/15-S0 et LUNA2000-7/14/21-S1
Secours : Secours uniquement avec le coffret SmartGuard-63A-T0, non fourni. La batterie n’est pas incluse.$huawei$, 5000::numeric),
  ($huawei$SUN2000-6K-MAP0$huawei$, $huawei$HUA-SUN2000-6K-MAP0$huawei$, $huawei$Onduleur hybride Huawei SUN2000-6K-MAP0 — 6 kW — Triphasé$huawei$, $huawei$Fourniture d’un onduleur photovoltaïque hybride Huawei SUN2000, de puissance nominale 6 kW, compatible avec un système de stockage Huawei LUNA2000 selon les spécifications du fabricant, intégrant une gestion MPPT et une supervision via FusionSolar.$huawei$, $huawei$Onduleur hybride photovoltaïque Huawei SUN2000-6K-MAP0, réseau triphasé, puissance nominale AC 6 kW, puissance photovoltaïque maximale recommandée 11 kWc, 2 trackers MPPT. Compatibilité batterie et fonctionnalités de secours soumises aux conditions et équipements définis par Huawei.

Référence constructeur : SUN2000-6K-MAP0
Gamme : Huawei SUN2000
Type de réseau : Triphasé
Puissance AC : 6000 W
Puissance PV maximale recommandée : 11000 Wc
Nombre de MPPT : 2
Rendement maximal : 98,6 %
Tension DC maximale : 1100 V
Plage de fonctionnement PV : 160 à 1 000 V
Batteries compatibles selon Huawei : LUNA2000-5/10/15-S0 et LUNA2000-7/14/21-S1
Secours : Secours uniquement avec le coffret SmartGuard-63A-T0, non fourni. La batterie n’est pas incluse.$huawei$, 6000::numeric),
  ($huawei$SUN2000-8K-MAP0$huawei$, $huawei$HUA-SUN2000-8K-MAP0$huawei$, $huawei$Onduleur hybride Huawei SUN2000-8K-MAP0 — 8 kW — Triphasé$huawei$, $huawei$Fourniture d’un onduleur photovoltaïque hybride Huawei SUN2000, de puissance nominale 8 kW, compatible avec un système de stockage Huawei LUNA2000 selon les spécifications du fabricant, intégrant une gestion MPPT et une supervision via FusionSolar.$huawei$, $huawei$Onduleur hybride photovoltaïque Huawei SUN2000-8K-MAP0, réseau triphasé, puissance nominale AC 8 kW, puissance photovoltaïque maximale recommandée 14,6 kWc, 2 trackers MPPT. Compatibilité batterie et fonctionnalités de secours soumises aux conditions et équipements définis par Huawei.

Référence constructeur : SUN2000-8K-MAP0
Gamme : Huawei SUN2000
Type de réseau : Triphasé
Puissance AC : 8000 W
Puissance PV maximale recommandée : 14600 Wc
Nombre de MPPT : 2
Rendement maximal : 98,6 %
Tension DC maximale : 1100 V
Plage de fonctionnement PV : 160 à 1 000 V
Batteries compatibles selon Huawei : LUNA2000-5/10/15-S0 et LUNA2000-7/14/21-S1
Secours : Secours uniquement avec le coffret SmartGuard-63A-T0, non fourni. La batterie n’est pas incluse.$huawei$, 8000::numeric),
  ($huawei$SUN2000-10K-MAP0$huawei$, $huawei$HUA-SUN2000-10K-MAP0$huawei$, $huawei$Onduleur hybride Huawei SUN2000-10K-MAP0 — 10 kW — Triphasé$huawei$, $huawei$Fourniture d’un onduleur photovoltaïque hybride Huawei SUN2000, de puissance nominale 10 kW, compatible avec un système de stockage Huawei LUNA2000 selon les spécifications du fabricant, intégrant une gestion MPPT et une supervision via FusionSolar.$huawei$, $huawei$Onduleur hybride photovoltaïque Huawei SUN2000-10K-MAP0, réseau triphasé, puissance nominale AC 10 kW, puissance photovoltaïque maximale recommandée 18 kWc, 2 trackers MPPT. Compatibilité batterie et fonctionnalités de secours soumises aux conditions et équipements définis par Huawei.

Référence constructeur : SUN2000-10K-MAP0
Gamme : Huawei SUN2000
Type de réseau : Triphasé
Puissance AC : 10000 W
Puissance PV maximale recommandée : 18000 Wc
Nombre de MPPT : 2
Rendement maximal : 98,6 %
Tension DC maximale : 1100 V
Plage de fonctionnement PV : 160 à 1 000 V
Batteries compatibles selon Huawei : LUNA2000-5/10/15-S0 et LUNA2000-7/14/21-S1
Secours : Secours uniquement avec le coffret SmartGuard-63A-T0, non fourni. La batterie n’est pas incluse.$huawei$, 10000::numeric),
  ($huawei$SUN2000-12K-MAP0$huawei$, $huawei$HUA-SUN2000-12K-MAP0$huawei$, $huawei$Onduleur hybride Huawei SUN2000-12K-MAP0 — 12 kW — Triphasé$huawei$, $huawei$Fourniture d’un onduleur photovoltaïque hybride Huawei SUN2000, de puissance nominale 12 kW, compatible avec un système de stockage Huawei LUNA2000 selon les spécifications du fabricant, intégrant une gestion MPPT et une supervision via FusionSolar.$huawei$, $huawei$Onduleur hybride photovoltaïque Huawei SUN2000-12K-MAP0, réseau triphasé, puissance nominale AC 12 kW, puissance photovoltaïque maximale recommandée 22 kWc, 2 trackers MPPT. Compatibilité batterie et fonctionnalités de secours soumises aux conditions et équipements définis par Huawei.

Référence constructeur : SUN2000-12K-MAP0
Gamme : Huawei SUN2000
Type de réseau : Triphasé
Puissance AC : 12000 W
Puissance PV maximale recommandée : 22000 Wc
Nombre de MPPT : 2
Rendement maximal : 98,6 %
Tension DC maximale : 1100 V
Plage de fonctionnement PV : 160 à 1 000 V
Batteries compatibles selon Huawei : LUNA2000-5/10/15-S0 et LUNA2000-7/14/21-S1
Secours : Secours uniquement avec le coffret SmartGuard-63A-T0, non fourni. La batterie n’est pas incluse.$huawei$, 12000::numeric);

  create temporary table huawei_sun2000_import_report (
    manufacturer_reference text,
    internal_reference text,
    status text,
    existing_reference text,
    existing_designation text,
    note text
  ) on commit drop;

  insert into huawei_sun2000_import_report (
    manufacturer_reference, internal_reference, status, existing_reference, existing_designation, note
  )
  select
    c.manufacturer_reference,
    c.reference,
    case
      when exact_internal.reference is not null then 'deja_present'
      when found.reference is not null then 'conflit'
      else 'absent'
    end,
    coalesce(exact_internal.reference, found.reference, ''),
    coalesce(exact_internal.designation, found.designation, ''),
    case
      when exact_internal.reference is not null then 'Référence interne déjà présente. Aucune modification.'
      when found.reference is not null then 'Correspondance proposée avec ' || found.reference || '. Article laissé intact.'
      else 'À créer.'
    end
  from huawei_sun2000_candidates c
  left join lateral (
    select a.reference, a.designation
    from public.articles a
    where a.organization_id = v_org
      and upper(a.reference) = upper(c.reference)
    limit 1
  ) exact_internal on true
  left join lateral (
    select a.reference, a.designation
    from public.articles a
    where a.organization_id = v_org
      and position(
        c.manufacturer_reference in
        regexp_replace(
          upper(replace(replace(
            coalesce(a.reference, '') || ' ' || coalesce(a.designation, '') || ' ' || coalesce(a.description, '') || ' ' || coalesce(a.description_technique, ''),
            ' ', ''
          ), ',', '.')),
          'SUN2000-4\.6K-LB00',
          'SUN2000-4.6K-LB0',
          'g'
        )
      ) > 0
    order by a.reference
    limit 1
  ) found on true;

  insert into public.articles (
    organization_id, reference, designation, description, description_technique,
    categorie, sous_categorie, category_id, subcategory_id,
    marque, brand_id,
    prix_achat_ht, prix_vente_ht, taux_tva, unite, actif, power_w, source_reference,
    fiche_nom, fiche_data, updated_at
  )
  select
    v_org, c.reference, c.designation, c.description, c.description_technique,
    'Photovoltaïque', 'Onduleurs', v_cat_id, v_sub_id,
    'Huawei', v_brand_id,
    0, 0, 20, 'Unité', true, c.power_w, 'catalogue:huawei-sun2000-hybride',
    null, null, now()
  from huawei_sun2000_candidates c
  join huawei_sun2000_import_report r on r.internal_reference = c.reference
  where r.status = 'absent'
    and not exists (
      select 1
      from public.articles a
      where a.organization_id = v_org
        and lower(a.reference) = lower(c.reference)
    );

  get diagnostics v_created = row_count;
  raise notice 'Onduleurs Huawei créés : %', v_created;
end $$;
