-- ---------------------------------------------------------------------------
-- Origine des prospects et attribution publicitaire
--
-- Trois principes portés par le schéma, pas seulement par le code applicatif :
--
--   1. Un prospect saisi dans le CRM ne peut jamais porter une origine
--      publicitaire, et une demande venue du site ne peut jamais être
--      attribuée à un prospecteur terrain. Le cloisonnement est une contrainte
--      CHECK sur le couple canal / catégorie.
--   2. Une origine déjà établie ne se réécrit pas. Seule une origine
--      « À qualifier » peut être précisée, et seulement à l'intérieur du même
--      canal. Garanti par déclencheur, donc opposable même à `service_role`.
--   3. Les contacts sont historisés un par un. Premier contact et dernier
--      contact sont calculés à la lecture, aucune donnée ne tranche entre les
--      deux modèles d'attribution.
--
-- Aucune reprise de données n'est faite ici : les prospects existants gardent
-- `origin_category` à NULL et leur colonne `source` intacte.
--
-- Appliquée en production le 7 novembre 2026 à 19 h 24 UTC. Contrôlé juste
-- après : les 246 prospects existants ont tous `origin_category` à NULL, donc
-- aucune origine n'a été écrite. Contrôlé juste avant, parce que le déclencheur
-- `commercial_opportunities_source_guard` refuse certaines valeurs de `source` :
-- aucune des sept valeurs présentes n'est refusée, et « Prospection », portée
-- par trente-trois prospects dont un créé le jour même, ne passe que grâce à la
-- comparaison exacte — c'est bien la casse qui la sépare du code brut.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Vocabulaire partagé
-- ---------------------------------------------------------------------------

-- Ces deux fonctions sont appelées depuis des contraintes CHECK : leur
-- résolution de noms doit être figée, sinon la validité d'une origine
-- dépendrait du search_path de la session qui écrit la ligne.
create or replace function public.origin_pair_is_valid(p_channel text, p_category text)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case p_channel
    when 'crm_manual' then p_category in ('prospection', 'entrant', 'a_qualifier')
    when 'web_ingest' then p_category in ('google_ads', 'meta_ads', 'site_web', 'a_qualifier')
    when 'import'     then p_category in ('site_web', 'prospection', 'entrant', 'a_qualifier')
    else false
  end;
$$;

comment on function public.origin_pair_is_valid(text, text) is
  'Cloisonnement canal / catégorie. Doit rester aligné sur ORIGIN_CATEGORIES dans app/lib/origin-taxonomy.js.';

create or replace function public.origin_subtype_is_valid(p_category text, p_subtype text)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case
    when coalesce(p_subtype, '') = '' then true
    else case p_category
      -- Pas de sous-origine pour Google Ads : le détail utile est la campagne,
      -- stockée dans lead_attribution.campaign_id / campaign_name.
      when 'google_ads'  then false
      when 'meta_ads'    then p_subtype in ('facebook', 'instagram')
      when 'site_web'    then p_subtype in ('seo', 'direct', 'referral')
      when 'prospection' then p_subtype in ('porte_a_porte', 'stand', 'foire_salon', 'centre_appels', 'autre_terrain')
      when 'entrant'     then p_subtype in ('appel_entrant', 'recommandation', 'partenaire')
      when 'a_qualifier' then false
      else false
    end
  end;
$$;

comment on function public.origin_subtype_is_valid(text, text) is
  'Sous-origines autorisées. Doit rester aligné sur ORIGIN_CATEGORIES dans app/lib/origin-taxonomy.js, alignement vérifié par tests/origin-taxonomy-sql.test.js.';

-- ---------------------------------------------------------------------------
-- Origine courante du prospect
--
-- Colonnes ajoutées en NULL, sans valeur par défaut : un prospect historique
-- reste sans origine structurée tant qu'un humain ne l'a pas qualifié.
-- ---------------------------------------------------------------------------

alter table public.commercial_opportunities
  add column if not exists origin_channel text,
  add column if not exists origin_category text,
  add column if not exists origin_subtype text,
  add column if not exists origin_set_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'commercial_opportunities_origin_chk'
  ) then
    alter table public.commercial_opportunities
      add constraint commercial_opportunities_origin_chk check (
        (origin_channel is null and origin_category is null)
        or (
          public.origin_pair_is_valid(origin_channel, origin_category)
          and public.origin_subtype_is_valid(origin_category, origin_subtype)
        )
      );
  end if;
end;
$$;

create index if not exists commercial_opportunities_origin_idx
  on public.commercial_opportunities (organization_id, origin_category, created_at desc)
  where origin_category is not null;

create index if not exists commercial_opportunities_origin_todo_idx
  on public.commercial_opportunities (organization_id, created_at desc)
  where origin_category = 'a_qualifier';

-- ---------------------------------------------------------------------------
-- Journal des origines : ajout seul, jamais de réécriture
-- ---------------------------------------------------------------------------

create table if not exists public.lead_origin_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null references public.commercial_opportunities (id) on delete cascade,
  from_channel text,
  from_category text,
  from_subtype text,
  to_channel text not null,
  to_category text not null,
  to_subtype text,
  reason text not null,
  author_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lead_origin_history_opportunity_idx
  on public.lead_origin_history (opportunity_id, created_at);

-- ---------------------------------------------------------------------------
-- Contacts publicitaires et terrain, un enregistrement par contact
--
-- Le premier contact est la ligne la plus ancienne, le dernier contact la plus
-- récente. Les deux modèles d'attribution se lisent donc sur la même table.
-- ---------------------------------------------------------------------------

create table if not exists public.lead_attribution (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null references public.commercial_opportunities (id) on delete cascade,
  touched_at timestamptz not null default now(),
  origin_channel text not null,
  origin_category text not null,
  origin_subtype text,
  prospector_id uuid references auth.users (id) on delete set null,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  keyword text,
  placement text,
  click_kind text,
  click_id text,
  landing_path text,
  referrer_host text,
  submission_id text,
  -- Rôle du contact quand la demande en transporte deux. Vide quand la
  -- première visite est aussi celle de la demande : le contact est alors à la
  -- fois le premier et le dernier, et une seule ligne est écrite.
  touch_role text,
  evidence text not null default '',
  created_at timestamptz not null default now(),
  constraint lead_attribution_origin_chk check (
    public.origin_pair_is_valid(origin_channel, origin_category)
    and public.origin_subtype_is_valid(origin_category, origin_subtype)
  ),
  constraint lead_attribution_touch_role_chk check (
    touch_role is null or touch_role in ('premier', 'dernier')
  ),
  constraint lead_attribution_click_chk check (
    click_kind is null or click_kind in ('gclid', 'gbraid', 'wbraid', 'fbclid')
  ),
  -- Doit couvrir toutes les valeurs que `classifyWebLead` peut renvoyer, plus
  -- les deux origines hors site. Vérifié par tests/origin-taxonomy-sql.test.js.
  constraint lead_attribution_evidence_chk check (
    evidence in (
      '', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'utm', 'paid_inconnu',
      'referrer', 'inconnu', 'saisie_manuelle', 'import'
    )
  ),
  -- Une preuve de clic n'existe que sur un contact venu du site.
  constraint lead_attribution_click_channel_chk check (
    click_id is null or origin_channel = 'web_ingest'
  ),
  -- Un prospecteur ne peut pas être crédité d'un contact publicitaire.
  constraint lead_attribution_prospector_chk check (
    prospector_id is null or origin_category in ('prospection', 'entrant', 'a_qualifier')
  )
);

comment on table public.lead_attribution is
  'Journal des contacts à l''origine d''un prospect. Table en ajout seul : premier et dernier contact sont déduits de touched_at.';
comment on column public.lead_attribution.click_id is
  'Identifiant de clic publicitaire. Nécessaire au rapprochement avec les régies, purgé avec le reste de la demande brute.';

create index if not exists lead_attribution_opportunity_idx
  on public.lead_attribution (opportunity_id, touched_at);

create index if not exists lead_attribution_reporting_idx
  on public.lead_attribution (organization_id, origin_category, touched_at desc);

create index if not exists lead_attribution_campaign_idx
  on public.lead_attribution (organization_id, campaign_id, touched_at desc)
  where campaign_id is not null;

create index if not exists lead_attribution_prospector_idx
  on public.lead_attribution (organization_id, prospector_id, touched_at desc)
  where prospector_id is not null;

-- Un même contact ne peut pas être enregistré deux fois pour une même demande.
--
-- Le rôle entre dans la clé : une demande du site transporte jusqu'à deux
-- contacts, le premier et le dernier, qui portent le même identifiant de
-- soumission. Sans le rôle, la seconde ligne serait refusée et la demande
-- échouerait entièrement.
create unique index if not exists lead_attribution_submission_idx
  on public.lead_attribution (organization_id, submission_id, coalesce(touch_role, ''))
  where submission_id is not null;

-- ---------------------------------------------------------------------------
-- Déclencheurs d'intégrité
-- ---------------------------------------------------------------------------

create or replace function public.lead_attribution_append_only()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  raise exception 'LEAD_ATTRIBUTION_APPEND_ONLY';
end;
$$;

-- Le déclencheur ne couvre que la réécriture, pas la suppression : la
-- suppression d'un prospect doit rester possible et se propage en cascade.
-- C'est l'absence de droit DELETE qui interdit une suppression directe.
drop trigger if exists lead_attribution_append_only on public.lead_attribution;
create trigger lead_attribution_append_only
before update on public.lead_attribution
for each row
execute function public.lead_attribution_append_only();

drop trigger if exists lead_origin_history_append_only on public.lead_origin_history;
create trigger lead_origin_history_append_only
before update on public.lead_origin_history
for each row
execute function public.lead_attribution_append_only();

-- ---------------------------------------------------------------------------
-- Une origine ne se réécrit pas
--
-- Autorisé : passer de NULL à une origine, ou préciser une origine
-- « À qualifier » sans changer de canal.
-- Refusé : tout le reste, y compris requalifier un prospect terrain en
-- prospect publicitaire.
-- ---------------------------------------------------------------------------

create or replace function public.commercial_opportunities_origin_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if old.origin_category is not null
    and (new.origin_category is distinct from old.origin_category
      or new.origin_channel is distinct from old.origin_channel)
  then
    if old.origin_category <> 'a_qualifier' then
      raise exception 'ORIGIN_IMMUTABLE';
    end if;
    if new.origin_channel is distinct from old.origin_channel then
      raise exception 'ORIGIN_CHANNEL_IMMUTABLE';
    end if;
    if new.origin_category = 'a_qualifier' then
      raise exception 'ORIGIN_REFINEMENT_REQUIRED';
    end if;
  end if;

  if new.origin_category is not null and old.origin_category is null then
    new.origin_set_at := coalesce(new.origin_set_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists commercial_opportunities_origin_guard on public.commercial_opportunities;
create trigger commercial_opportunities_origin_guard
before update on public.commercial_opportunities
for each row
execute function public.commercial_opportunities_origin_guard();

-- ---------------------------------------------------------------------------
-- Garde-fou sur la colonne miroir `source`
--
-- `source` reste la valeur affichée par les écrans actuels et par les tableaux
-- de bord, qui agrègent dessus. Le libellé est produit par
-- `mirrorSourceLabel` dans app/lib/origin-taxonomy.js : ce déclencheur ne le
-- recalcule pas, il interdit seulement les deux valeurs qui casseraient
-- l'existant.
--
--   - 'google' est le marqueur des événements synchronisés depuis Google
--     Calendar (app/lib/agenda.js, app/lib/prospect-assign.js). Une origine
--     Google Ads écrite sous cette valeur ferait passer des prospects réels
--     pour des événements d'agenda importés.
--   - un code brut de catégorie afficherait « google_ads » à l'écran au lieu
--     de « Prospect GG Ads ».
-- ---------------------------------------------------------------------------

create or replace function public.commercial_opportunities_source_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  brut text := trim(coalesce(new.source, ''));
begin
  if tg_op = 'UPDATE' and new.source is not distinct from old.source then
    return new;
  end if;

  -- Marqueur réservé, comparé sans égard à la casse : aucun libellé commercial
  -- ne vaut « Google », donc toutes ses variantes sont du même mauvais côté.
  if lower(brut) = 'google' then
    raise exception 'SOURCE_RESERVED_MARKER';
  end if;

  -- Codes bruts, comparés exactement et non en minuscules.
  --
  -- La version précédente normalisait en minuscules et refusait donc
  -- « Prospection », qui est le libellé commercial légitime de la famille
  -- prospection, produit par `mirrorSourceLabel`. Toute création de prospect
  -- de prospection terrain échouait — le cas le plus courant. Vérifié sur les
  -- six libellés : aucun n'est égal à un code brut, et « Prospection » est le
  -- seul à n'en différer que par la casse. La comparaison exacte les sépare
  -- donc sans ambiguïté, et continue de refuser le code écrit en clair.
  if brut in ('google_ads', 'meta_ads', 'site_web', 'prospection', 'entrant', 'a_qualifier') then
    raise exception 'SOURCE_EXPECTS_LABEL';
  end if;

  return new;
end;
$$;

drop trigger if exists commercial_opportunities_source_guard on public.commercial_opportunities;
create trigger commercial_opportunities_source_guard
before insert or update on public.commercial_opportunities
for each row
execute function public.commercial_opportunities_source_guard();

-- ---------------------------------------------------------------------------
-- Rattachement des conversions
--
-- `clients` et `devis` ne portent pas l'origine : elle se lit par le prospect
-- d'origine, pour qu'il n'existe qu'un seul endroit où une origine est écrite.
-- ---------------------------------------------------------------------------

-- `clients` ne porte pas de colonne `extra` : le rattachement au prospect
-- d'origine se fait par son numéro, `origin_prospect_number`, qui renvoie à
-- `commercial_opportunities.prospect_number`. Vérifié sur une base réelle, la
-- version précédente de cet index échouait à la création.
create index if not exists clients_source_prospect_idx
  on public.clients (organization_id, origin_prospect_number)
  where origin_prospect_number is not null;

create index if not exists devis_source_prospect_idx
  on public.devis ((extra ->> 'sourceProspectId'))
  where extra ->> 'sourceProspectId' is not null;

alter table public.lead_attribution enable row level security;
alter table public.lead_origin_history enable row level security;

-- `service_role` est inclus dans la révocation : les privilèges par défaut du
-- schéma public lui accordent sinon tous les droits, ce qui rendrait le
-- caractère « ajout seul » purement déclaratif côté suppression.
revoke all on public.lead_attribution from anon, authenticated, service_role;
revoke all on public.lead_origin_history from anon, authenticated, service_role;

grant select, insert on public.lead_attribution to service_role;
grant select, insert on public.lead_origin_history to service_role;

revoke all on function public.lead_attribution_append_only() from public, anon, authenticated;
revoke all on function public.commercial_opportunities_origin_guard() from public, anon, authenticated;
revoke all on function public.commercial_opportunities_source_guard() from public, anon, authenticated;
grant execute on function public.origin_pair_is_valid(text, text) to service_role;
grant execute on function public.origin_subtype_is_valid(text, text) to service_role;
