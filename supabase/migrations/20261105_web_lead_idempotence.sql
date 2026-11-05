-- ---------------------------------------------------------------------------
-- Idempotence de l'intégration des demandes du site
--
-- Complète 20261102_web_lead_ingest.sql. La file garantissait déjà qu'une
-- demande n'entre qu'une fois et qu'un seul traitement la réserve. Elle ne
-- garantissait pas que le traitement lui-même, qui écrit dans trois tables,
-- soit rejouable : une panne après la création de la fiche faisait recréer une
-- fiche à la tentative suivante.
--
-- Trois garanties ajoutées ici :
--
--   1. Unicité en base. Un identifiant de soumission ne peut porter qu'une
--      fiche prospect et qu'un rendez-vous par organisation. La garantie ne
--      dépend plus du code applicatif : même un traitement concurrent, un
--      script d'administration ou une erreur future se heurtent à l'index.
--   2. Rattachement précoce. La fiche créée est inscrite sur la demande avant
--      les étapes suivantes, pour qu'une reprise sache qu'elle doit continuer
--      et non recommencer.
--   3. Résolution manuelle. Une demande en revue peut être rattachée à une
--      fiche existante ou écartée, sans jamais disparaître de l'historique.
--
-- Et une politique de conservation : une demande en échec garde sa demande
-- brute, mais pas indéfiniment. Elle est signalée, puis effacée après un délai
-- de grâce. L'historique du traitement, lui, reste.
--
-- NON APPLIQUÉE.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Vérification préalable, à exécuter avant la migration
--
-- Les index ci-dessous sont partiels : ils ne regardent que les fiches issues
-- du site. Aucune fiche saisie à la main ne porte `extra.webLead`, elles sont
-- donc hors de portée. Cette requête doit renvoyer zéro ligne ; sinon il
-- existe déjà des doublons à traiter à la main avant d'appliquer.
--
--   select extra #>> '{webLead,submissionId}' as soumission, count(*)
--     from public.commercial_opportunities
--    where nullif(extra #>> '{webLead,submissionId}', '') is not null
--    group by 1 having count(*) > 1;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Unicité
--
-- La clé est l'organisation et l'identifiant de soumission, sans le genre de
-- la demande : si un même identifiant arrivait à la fois comme demande et
-- comme rendez-vous, il devrait toujours produire une seule fiche.
--
-- Le prédicat écarte la chaîne vide autant que l'absence de clé. Sans lui,
-- toutes les fiches dont `extra.webLead.submissionId` vaut "" entreraient dans
-- l'index et la deuxième serait refusée.
-- ---------------------------------------------------------------------------

create unique index if not exists commercial_opportunities_web_lead_idx
  on public.commercial_opportunities (
    organization_id,
    (extra #>> '{webLead,submissionId}')
  )
  where nullif(extra #>> '{webLead,submissionId}', '') is not null;

comment on index public.commercial_opportunities_web_lead_idx is
  'Une demande du site ne peut créer qu''une fiche. Garantie en base : un traitement concurrent ou un rejeu ne peut pas la contourner.';

create unique index if not exists commercial_appointments_web_lead_idx
  on public.commercial_appointments (
    organization_id,
    (extra #>> '{webLead,submissionId}')
  )
  where nullif(extra #>> '{webLead,submissionId}', '') is not null;

comment on index public.commercial_appointments_web_lead_idx is
  'Un rendez-vous pris en ligne ne peut être enregistré qu''une fois, même si la clôture de la demande a échoué après sa création.';

-- ---------------------------------------------------------------------------
-- 2. Délai de conservation et traçabilité
-- ---------------------------------------------------------------------------

alter table public.web_lead_submissions
  add column if not exists retention_alert_at timestamptz;

comment on column public.web_lead_submissions.retention_alert_at is
  'Date du signalement de fin de conservation. Une demande en échec n''est jamais effacée sans avoir été signalée puis laissée en délai de grâce.';

-- Trois motifs nouveaux : le rattachement de la fiche en cours de traitement,
-- le rapprochement décidé par un administrateur, et le signalement de fin de
-- conservation. Le `check` doit être remplacé, une valeur ne s'y ajoute pas.
alter table public.web_lead_events
  drop constraint if exists web_lead_events_kind_chk;

alter table public.web_lead_events
  add constraint web_lead_events_kind_chk check (kind in (
    'received', 'duplicate_ignored', 'reserved', 'succeeded', 'retry_scheduled',
    'failed', 'sent_to_review', 'requeued', 'discarded', 'payload_purged',
    'opportunity_attached', 'linked_manually', 'retention_warned'
  ));

-- ---------------------------------------------------------------------------
-- 3. Rattachement précoce de la fiche
--
-- Appelée juste après la création de la fiche, avant l'attribution et le
-- rendez-vous. Une tentative interrompue laisse donc une trace exploitable :
-- la reprise voit `opportunity_id` et reprend là où elle s'est arrêtée.
--
-- Rejouable sans effet : rattacher la même fiche deux fois ne fait rien. Le
-- déclencheur `web_lead_submissions_guard` refuse en revanche de la remplacer
-- par une autre, ce qui est la protection contre un rejeu tardif.
-- ---------------------------------------------------------------------------

create or replace function public.attach_web_lead_opportunity(
  p_id uuid,
  p_opportunity_id uuid
)
returns public.web_lead_submissions
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  row_before public.web_lead_submissions;
  result public.web_lead_submissions;
begin
  if p_opportunity_id is null then
    raise exception 'WEB_LEAD_OPPORTUNITY_REQUISE';
  end if;

  select * into row_before
  from public.web_lead_submissions
  where id = p_id
  for update;

  if not found then
    raise exception 'WEB_LEAD_NOT_FOUND';
  end if;

  if row_before.opportunity_id = p_opportunity_id then
    return row_before;
  end if;

  update public.web_lead_submissions
  set opportunity_id = p_opportunity_id
  where id = p_id
  returning * into result;

  insert into public.web_lead_events (organization_id, submission_pk, kind, attempt)
  values (result.organization_id, result.id, 'opportunity_attached', result.attempts);

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Rapprochement manuel
--
-- Pour une demande partie en revue parce qu'un prospect proche existait déjà.
-- L'administrateur tranche : c'est la même personne, la demande est rattachée
-- à la fiche existante et considérée comme traitée. Aucune fusion automatique
-- n'est faite par le code, et aucune donnée de la fiche existante n'est
-- modifiée : seul le lien est posé.
-- ---------------------------------------------------------------------------

create or replace function public.link_web_lead_to_opportunity(
  p_id uuid,
  p_opportunity_id uuid,
  p_author_id uuid
)
returns public.web_lead_submissions
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  row_before public.web_lead_submissions;
  result public.web_lead_submissions;
  target_org uuid;
begin
  select * into row_before
  from public.web_lead_submissions
  where id = p_id
  for update;

  if not found then
    raise exception 'WEB_LEAD_NOT_FOUND';
  end if;

  if row_before.status not in ('review', 'failed') then
    raise exception 'WEB_LEAD_NOT_LINKABLE';
  end if;

  -- Une demande ne se rattache qu'à une fiche de sa propre organisation.
  select organization_id into target_org
  from public.commercial_opportunities
  where id = p_opportunity_id;

  if not found or target_org is distinct from row_before.organization_id then
    raise exception 'WEB_LEAD_OPPORTUNITY_HORS_ORGANISATION';
  end if;

  update public.web_lead_submissions
  set status = 'done',
      opportunity_id = coalesce(opportunity_id, p_opportunity_id),
      dedup_decision = 'review',
      locked_at = null,
      locked_by = null,
      last_error_code = null
  where id = p_id
  returning * into result;

  insert into public.web_lead_events (organization_id, submission_pk, kind, attempt, author_id)
  values (result.organization_id, result.id, 'linked_manually', result.attempts, p_author_id);

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Mise à l'écart explicite
--
-- Une demande sans suite — test, plaisanterie, doublon évident — est écartée,
-- jamais supprimée. Elle quitte la file et sa demande brute devient purgeable,
-- mais sa ligne et son historique demeurent.
-- ---------------------------------------------------------------------------

create or replace function public.discard_web_lead(
  p_id uuid,
  p_author_id uuid,
  p_reason text default null
)
returns public.web_lead_submissions
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  result public.web_lead_submissions;
begin
  update public.web_lead_submissions
  set status = 'discarded',
      locked_at = null,
      locked_by = null,
      last_error_code = left(nullif(p_reason, ''), 64)
  where id = p_id
    and status in ('review', 'failed', 'pending')
    and opportunity_id is null
  returning * into result;

  if not found then
    raise exception 'WEB_LEAD_NOT_DISCARDABLE';
  end if;

  insert into public.web_lead_events (organization_id, submission_pk, kind, attempt, author_id, error_code)
  values (result.organization_id, result.id, 'discarded', result.attempts, p_author_id,
          left(nullif(p_reason, ''), 64));

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Reprise manuelle : refuser une relance vouée à l'échec
--
-- `requeue_web_lead` remettait en file une demande dont la demande brute avait
-- été purgée. Le traitement échouait alors sept fois de suite pour rien, et
-- l'administrateur n'en comprenait pas la raison. Le refus est désormais
-- immédiat et explicite.
-- ---------------------------------------------------------------------------

create or replace function public.requeue_web_lead(p_id uuid, p_author_id uuid)
returns public.web_lead_submissions
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  result public.web_lead_submissions;
  row_before public.web_lead_submissions;
begin
  select * into row_before
  from public.web_lead_submissions
  where id = p_id
  for update;

  if not found then
    raise exception 'WEB_LEAD_NOT_FOUND';
  end if;

  if row_before.payload is null then
    raise exception 'WEB_LEAD_PAYLOAD_PURGED';
  end if;

  update public.web_lead_submissions
  set status = 'pending',
      attempts = 0,
      next_attempt_at = now(),
      locked_at = null,
      locked_by = null,
      last_error_code = null
  where id = p_id
    and status in ('failed', 'review')
  returning * into result;

  if not found then
    raise exception 'WEB_LEAD_NOT_REQUEUABLE';
  end if;

  insert into public.web_lead_events (organization_id, submission_pk, kind, author_id)
  values (result.organization_id, result.id, 'requeued', p_author_id);

  return result;
end;
$$;

-- La condition `opportunity_id is null` a disparu volontairement : une demande
-- dont la fiche existe mais dont l'attribution a échoué doit pouvoir être
-- relancée, et la reprise idempotente ne recréera pas la fiche. Le déclencheur
-- continue d'interdire de rattacher une autre fiche.

-- ---------------------------------------------------------------------------
-- 7. Conservation des demandes brutes
--
-- Politique en trois temps :
--
--   - une demande aboutie ou écartée perd sa demande brute à l'échéance
--     normale, comme avant ;
--   - une demande en échec ou en revue est d'abord signalée, et conservée ;
--   - elle n'est effacée qu'après un délai de grâce compté depuis le
--     signalement, pour qu'un administrateur ait eu le temps d'agir.
--
-- Le but est double : ne pas conserver indéfiniment les coordonnées d'une
-- personne dont la demande n'a jamais abouti, et ne jamais effacer en silence
-- une demande encore récupérable.
-- ---------------------------------------------------------------------------

create or replace function public.web_lead_retention_scan()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  signalled integer;
begin
  with flagged as (
    update public.web_lead_submissions
    set retention_alert_at = now()
    where payload is not null
      and retention_alert_at is null
      and payload_purge_after < now()
      and status in ('failed', 'review')
    returning id, organization_id, attempts
  )
  insert into public.web_lead_events (organization_id, submission_pk, kind, attempt)
  select organization_id, id, 'retention_warned', attempts from flagged;

  get diagnostics signalled = row_count;
  return signalled;
end;
$$;

-- L'ancienne version sans paramètre est supprimée avant la nouvelle : les
-- laisser coexister rendrait l'appel `purge_web_lead_payloads()` ambigu, le
-- paramètre ayant une valeur par défaut.
drop function if exists public.purge_web_lead_payloads();

create or replace function public.purge_web_lead_payloads(
  p_grace_days integer default 30
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  purged integer;
  grace interval;
begin
  grace := make_interval(days => greatest(coalesce(p_grace_days, 30), 1));

  with cleared as (
    update public.web_lead_submissions
    set payload = null,
        payload_purged_at = now()
    where payload is not null
      and (
        -- Demande aboutie ou écartée : échéance normale.
        (status in ('done', 'discarded') and payload_purge_after < now())
        -- Demande non aboutie : signalée, puis délai de grâce.
        or (status in ('failed', 'review')
            and retention_alert_at is not null
            and retention_alert_at < now() - grace)
      )
    returning id, organization_id
  )
  insert into public.web_lead_events (organization_id, submission_pk, kind)
  select organization_id, id, 'payload_purged' from cleared;

  get diagnostics purged = row_count;
  return purged;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Droits
-- ---------------------------------------------------------------------------

revoke all on function public.attach_web_lead_opportunity(uuid, uuid) from public, anon, authenticated;
revoke all on function public.link_web_lead_to_opportunity(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.discard_web_lead(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.web_lead_retention_scan() from public, anon, authenticated;
revoke all on function public.purge_web_lead_payloads(integer) from public, anon, authenticated;
revoke all on function public.requeue_web_lead(uuid, uuid) from public, anon, authenticated;

grant execute on function public.attach_web_lead_opportunity(uuid, uuid) to service_role;
grant execute on function public.link_web_lead_to_opportunity(uuid, uuid, uuid) to service_role;
grant execute on function public.discard_web_lead(uuid, uuid, text) to service_role;
grant execute on function public.web_lead_retention_scan() to service_role;
grant execute on function public.purge_web_lead_payloads(integer) to service_role;
grant execute on function public.requeue_web_lead(uuid, uuid) to service_role;
