-- =============================================================================
-- Diagnostic marketing — bloc 5
--
-- À exécuter dans l'éditeur SQL de Supabase. Tout est en lecture seule : aucune
-- requête ne contient INSERT, UPDATE, DELETE ni ALTER. Les résultats sont des
-- comptages et des montants : aucun nom, téléphone, e-mail ni adresse ne sort.
--
-- Exécutez les blocs un par un et renvoyez-moi les tableaux de résultats.
-- Le bloc 4 est le plus important : il dit si le module de comparaison est
-- exploitable ou s'il faut d'abord consolider le lien prospect-client.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. État du schéma : les migrations marketing sont-elles déjà passées ?
-- -----------------------------------------------------------------------------
select
  'colonnes origine sur commercial_opportunities' as objet,
  count(*) as presentes,
  4 as attendues
from information_schema.columns
where table_schema = 'public'
  and table_name = 'commercial_opportunities'
  and column_name in ('origin_channel', 'origin_category', 'origin_subtype', 'origin_set_at')
union all
select
  'tables marketing',
  count(*),
  4
from information_schema.tables
where table_schema = 'public'
  and table_name in ('lead_attribution', 'lead_origin_history', 'web_lead_submissions', 'web_lead_events');


-- -----------------------------------------------------------------------------
-- 2. Volumétrie générale, par organisation
-- -----------------------------------------------------------------------------
select
  organization_id,
  count(*) as fiches,
  count(*) filter (where created_at >= now() - interval '12 months') as fiches_12_mois,
  count(*) filter (where commercial_id is not null) as avec_commercial,
  count(*) filter (where created_by is not null) as avec_createur,
  count(*) filter (where extra ? 'prospectorId') as avec_prospecteur,
  count(*) filter (
    where commercial_id is null
      and created_by is null
      and not (extra ? 'prospectorId')
  ) as sans_proprietaire,
  min(created_at)::date as plus_ancienne,
  max(created_at)::date as plus_recente
from public.commercial_opportunities
group by organization_id
order by fiches desc;


-- -----------------------------------------------------------------------------
-- 3. Répartition des origines actuelles.
--    La colonne `source` est du texte libre historique : je dois voir les
--    valeurs réelles avant de décider de la correspondance vers la nouvelle
--    taxonomie. La valeur `google` est surveillée à part : c'est le marqueur
--    technique de Google Calendar, jamais une origine publicitaire.
-- -----------------------------------------------------------------------------
select
  coalesce(nullif(trim(source), ''), '(vide)') as source_enregistree,
  count(*) as fiches,
  round(100.0 * count(*) / sum(count(*)) over (), 1) as part_pourcent,
  count(*) filter (where created_at >= now() - interval '12 months') as dont_12_mois,
  min(created_at)::date as premiere,
  max(created_at)::date as derniere
from public.commercial_opportunities
group by 1
order by fiches desc;

-- Alerte dédiée : présence du marqueur réservé.
select count(*) as fiches_avec_marqueur_google_reserve
from public.commercial_opportunities
where lower(trim(coalesce(source, ''))) = 'google';


-- -----------------------------------------------------------------------------
-- 4. LE POINT CRITIQUE — taille du seau « Non attribué ».
--
--    Les devis sont rattachés à un client, pas à une fiche prospect. Le seul
--    chemin vers l'origine passe par extra->>'clientId' sur la fiche. Cette
--    requête mesure quelle part du chiffre d'affaires est rattachable.
--
--    Les trois niveaux ne sont PAS additionnables : une facture payée compte
--    à la fois en vente confirmée et en encaissement.
-- -----------------------------------------------------------------------------
with liens as (
  -- Comparaison en texte : un clientId mal formé dans l'historique ferait
  -- échouer un cast en uuid et donc tout le diagnostic.
  select distinct
    organization_id,
    nullif(trim(extra->>'clientId'), '') as client_id
  from public.commercial_opportunities
  where nullif(trim(extra->>'clientId'), '') is not null
),
docs as (
  select
    d.organization_id,
    lv.niveau,
    coalesce(d.total_ht, 0) as total_ht,
    (l.client_id is not null) as rattachable
  from public.devis d
  left join liens l
    on l.organization_id = d.organization_id
   and l.client_id = d.client_id::text
  -- Un document peut compter dans deux niveaux : une facture payée est à la
  -- fois une vente confirmée et un encaissement. Un document qui ne constate
  -- rien disparaît, puisque le tableau renvoyé est vide.
  cross join lateral unnest(
    case
      when d.kind = 'Devis' and d.statut = 'Accepté'
        then array['1 devis acceptés']
      when d.kind = 'Facture' and d.statut = 'Payée'
        then array['2 ventes confirmées', '3 factures payées']
      when d.kind = 'Facture' and d.statut not in ('Brouillon', 'Annulé')
        then array['2 ventes confirmées']
      else array[]::text[]
    end
  ) as lv(niveau)
)
select
  organization_id,
  niveau,
  count(*) as documents,
  count(*) filter (where rattachable) as rattachables,
  round(100.0 * count(*) filter (where rattachable) / nullif(count(*), 0), 1) as part_rattachable_pourcent,
  round(sum(total_ht)::numeric, 2) as total_ht,
  round(coalesce(sum(total_ht) filter (where rattachable), 0)::numeric, 2) as total_ht_rattachable,
  round(
    100.0 * coalesce(sum(total_ht) filter (where rattachable), 0) / nullif(sum(total_ht), 0),
    1
  ) as part_ca_rattachable_pourcent
from docs
group by organization_id, niveau
order by organization_id, niveau;


-- -----------------------------------------------------------------------------
-- 5. Tous les documents par nature et statut, pour voir ce qui existe
--    réellement avant de figer les trois niveaux.
-- -----------------------------------------------------------------------------
select
  kind,
  statut,
  count(*) as documents,
  round(sum(coalesce(total_ht, 0))::numeric, 2) as total_ht,
  round(sum(coalesce(total_ttc, 0))::numeric, 2) as total_ttc,
  count(*) filter (where client_id is null) as sans_client
from public.devis
group by kind, statut
order by kind, documents desc;


-- -----------------------------------------------------------------------------
-- 6. Combien de fiches ont été converties en client, et donc portent le lien.
-- -----------------------------------------------------------------------------
select
  count(*) as fiches,
  count(*) filter (where nullif(trim(extra->>'clientId'), '') is not null) as avec_lien_client,
  round(
    100.0 * count(*) filter (where nullif(trim(extra->>'clientId'), '') is not null)
      / nullif(count(*), 0),
    1
  ) as part_pourcent,
  count(*) filter (where stage = 'Gagné') as au_stade_gagne,
  count(*) filter (
    where stage = 'Gagné'
      and nullif(trim(extra->>'clientId'), '') is null
  ) as gagne_sans_lien_client
from public.commercial_opportunities;


-- -----------------------------------------------------------------------------
-- 7. Rendez-vous : combien sont rattachés à une fiche encore existante.
--    Un rendez-vous orphelin ne peut être crédité à aucune origine.
-- -----------------------------------------------------------------------------
select
  count(*) as rendez_vous,
  count(*) filter (where a.opportunity_id is null) as sans_fiche,
  count(*) filter (where a.opportunity_id is not null and o.id is null) as fiche_introuvable,
  count(*) filter (where o.id is not null) as rattaches,
  count(*) filter (where a.starts_at >= now() - interval '12 months') as dont_12_mois
from public.commercial_appointments a
left join public.commercial_opportunities o on o.id = a.opportunity_id;


-- -----------------------------------------------------------------------------
-- 8. Doublons potentiels sur le téléphone. Seuls les comptages sortent :
--    aucun numéro n'est affiché. Aucune fusion automatique n'en découlera,
--    c'est une mesure de l'ampleur du travail de dédoublonnage.
-- -----------------------------------------------------------------------------
with normalise as (
  select
    organization_id,
    regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') as tel
  from public.commercial_opportunities
),
groupes as (
  select organization_id, tel, count(*) as fiches
  from normalise
  where length(tel) >= 9
  group by organization_id, tel
)
select
  organization_id,
  count(*) filter (where fiches > 1) as numeros_partages,
  coalesce(sum(fiches) filter (where fiches > 1), 0) as fiches_concernees,
  coalesce(max(fiches), 0) as plus_grand_groupe
from groupes
group by organization_id
order by fiches_concernees desc;


-- -----------------------------------------------------------------------------
-- 9. Prospecteurs actifs sur les 12 derniers mois, en comptage seul.
--    Les identifiants sont des uuid techniques, pas des noms.
-- -----------------------------------------------------------------------------
select
  count(distinct extra->>'prospectorId') as prospecteurs_distincts,
  count(*) filter (where extra ? 'prospectorId') as fiches_avec_prospecteur,
  count(*) as fiches_12_mois
from public.commercial_opportunities
where created_at >= now() - interval '12 months';
