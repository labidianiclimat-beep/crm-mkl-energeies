-- Prévisualisation Huawei SUN2000. Lecture seule.
-- Projet autorisé : MKL CRM RECETTE, référence xqbjfytrssslnsxxdrou.
-- N’ouvrez pas le projet MKL Energies CRM.
-- Ce script ne crée, ne modifie et ne supprime aucune ligne.

select required.table_name,
       exists (
         select 1
         from information_schema.tables t
         where t.table_schema = 'public'
           and t.table_name = required.table_name
       ) as presente
from (values
  ('organizations'),
  ('articles'),
  ('article_categories'),
  ('article_subcategories'),
  ('article_brands'),
  ('devis'),
  ('devis_lignes')
) as required(table_name)
order by required.table_name;

-- Rapport. Les statuts sont absent, deja_present, conflit ou bloque.
-- bloque : la catégorie Photovoltaïque / Onduleurs est absente, donc l’import s’arrêtera.
with candidates (
  manufacturer_reference, reference, designation, description, description_technique, power_w
) as (
  values
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
Secours : Secours uniquement avec le coffret SmartGuard-63A-T0, non fourni. La batterie n’est pas incluse.$huawei$, 12000::numeric)
),
target as (
  select o.id as organization_id
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
  limit 1
)
select
  c.manufacturer_reference,
  c.reference as internal_reference,
  c.power_w,
  case
    when target.organization_id is null then 'bloque'
    when exact_internal.reference is not null then 'deja_present'
    when found.reference is not null then 'conflit'
    else 'absent'
  end as status,
  coalesce(exact_internal.reference, found.reference, '') as existing_reference,
  coalesce(exact_internal.designation, found.designation, '') as existing_designation,
  case
    when target.organization_id is null then 'Catégorie Photovoltaïque ou sous-catégorie Onduleurs absente. Aucune écriture possible.'
    when exact_internal.reference is not null then 'Référence interne déjà présente. Aucune modification.'
    when found.reference is not null then 'Correspondance proposée avec ' || found.reference || '. Article laissé intact.'
    else 'À créer après validation explicite de l’import.'
  end as note
from candidates c
left join target on true
left join lateral (
    select a.reference, a.designation
    from public.articles a
    where a.organization_id = target.organization_id
      and upper(a.reference) = upper(c.reference)
    limit 1
  ) exact_internal on true
  left join lateral (
    select a.reference, a.designation
    from public.articles a
    where a.organization_id = target.organization_id
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
  ) found on true
order by c.reference;
