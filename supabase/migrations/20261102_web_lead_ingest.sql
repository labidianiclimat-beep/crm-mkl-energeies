-- ---------------------------------------------------------------------------
-- File d'attente des demandes du site mkl-energies.fr
--
-- Le backend OVH ne doit jamais abandonner une demande parce que le CRM est
-- indisponible. Le contrat est donc : réception, accusé de réception, puis
-- traitement différé et réessayable.
--
--   - Idempotence : un même `submission_id` ne peut entrer qu'une fois, par
--     index unique. Un rejeu renvoie l'accusé initial au lieu de créer un
--     doublon.
--   - Réservation atomique : PostgREST ne sait pas faire de SKIP LOCKED, donc
--     la prise de travail passe par une fonction, pas par un PATCH suivi d'un
--     SELECT. Deux exécutions simultanées du traitement ne peuvent pas prendre
--     la même demande.
--   - Réessais progressifs : 1 min, 5 min, 15 min, 1 h, 6 h, 24 h, puis arrêt
--     en échec avec reprise manuelle possible.
--   - Rétention : la demande brute est effacée après `payload_purge_after`,
--     la ligne d'historique reste.
--
-- Dépend d'un identifiant de soumission stable et unique côté OVH, à vérifier
-- dans `server.mjs` avant application.
--
-- Appliquée en production le 7 novembre 2026 à 19 h 21 UTC. La file reste vide
-- tant que le trousseau n'est pas posé : aucune demande ne peut y entrer.
-- ---------------------------------------------------------------------------

create table if not exists public.web_lead_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  submission_id text not null,
  kind text not null,
  payload jsonb,
  payload_purge_after timestamptz not null,
  payload_purged_at timestamptz,
  signature_sent_at timestamptz not null,
  received_at timestamptz not null default now(),
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  opportunity_id uuid references public.commercial_opportunities (id) on delete set null,
  dedup_decision text,
  dedup_candidate_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_lead_submissions_kind_chk
    check (kind in ('lead', 'appointment')),
  constraint web_lead_submissions_status_chk
    check (status in ('pending', 'processing', 'done', 'failed', 'review', 'discarded')),
  constraint web_lead_submissions_submission_chk
    check (char_length(submission_id) between 8 and 128),
  constraint web_lead_submissions_attempts_chk
    check (attempts >= 0),
  constraint web_lead_submissions_dedup_chk
    check (dedup_decision is null or dedup_decision in ('new', 'replay', 'review')),
  -- Une demande traitée doit avoir produit quelque chose ou être motivée.
  constraint web_lead_submissions_done_chk
    check (status <> 'done' or opportunity_id is not null)
);

comment on table public.web_lead_submissions is
  'Demandes reçues du site, conservées jusqu''à intégration réussie. L''accusé de réception est émis dès l''insertion, avant tout traitement.';
comment on column public.web_lead_submissions.payload is
  'Demande brute, effacée à la purge. Ne doit contenir aucun secret ni en-tête d''authentification.';
comment on column public.web_lead_submissions.last_error_code is
  'Code d''erreur interne, jamais un message brut : évite de recopier des coordonnées client dans les journaux techniques.';

-- Clé d'idempotence identique à celle de la file OVH (lib/crm-outbox.mjs),
-- qui rejette un second enregistrement sur le couple kind + sourceId.
create unique index if not exists web_lead_submissions_submission_idx
  on public.web_lead_submissions (organization_id, kind, submission_id);

create index if not exists web_lead_submissions_queue_idx
  on public.web_lead_submissions (next_attempt_at)
  where status = 'pending';

create index if not exists web_lead_submissions_stuck_idx
  on public.web_lead_submissions (locked_at)
  where status = 'processing';

create index if not exists web_lead_submissions_review_idx
  on public.web_lead_submissions (organization_id, received_at desc)
  where status in ('review', 'failed');

create index if not exists web_lead_submissions_purge_idx
  on public.web_lead_submissions (payload_purge_after)
  where payload is not null;

-- ---------------------------------------------------------------------------
-- Historique des tentatives : ajout seul
-- ---------------------------------------------------------------------------

create table if not exists public.web_lead_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  submission_pk uuid not null references public.web_lead_submissions (id) on delete cascade,
  kind text not null,
  attempt integer not null default 0,
  error_code text,
  author_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint web_lead_events_kind_chk check (kind in (
    'received', 'duplicate_ignored', 'reserved', 'succeeded', 'retry_scheduled',
    'failed', 'sent_to_review', 'requeued', 'discarded', 'payload_purged'
  ))
);

create index if not exists web_lead_events_submission_idx
  on public.web_lead_events (submission_pk, created_at);

create or replace function public.web_lead_events_append_only()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  raise exception 'WEB_LEAD_EVENTS_APPEND_ONLY';
end;
$$;

-- Le déclencheur ne couvre que la réécriture. La suppression est empêchée par
-- l'absence de droit DELETE : la couvrir ici empêcherait aussi la suppression
-- en cascade, et donc la suppression d'une demande par un administrateur.
drop trigger if exists web_lead_events_append_only on public.web_lead_events;
create trigger web_lead_events_append_only
before update on public.web_lead_events
for each row
execute function public.web_lead_events_append_only();

-- ---------------------------------------------------------------------------
-- Immuabilité de la demande reçue
--
-- Le contenu reçu et son identifiant ne changent jamais. Seul l'état du
-- traitement évolue.
-- ---------------------------------------------------------------------------

create or replace function public.web_lead_submissions_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.submission_id <> old.submission_id
    or new.organization_id <> old.organization_id
    or new.kind <> old.kind
    or new.received_at <> old.received_at
    or new.signature_sent_at <> old.signature_sent_at
  then
    raise exception 'WEB_LEAD_SUBMISSION_IMMUTABLE';
  end if;

  -- La demande brute ne peut qu'être effacée, jamais réécrite.
  if old.payload is not null and new.payload is not null and new.payload <> old.payload then
    raise exception 'WEB_LEAD_PAYLOAD_IMMUTABLE';
  end if;
  if old.payload is null and new.payload is not null then
    raise exception 'WEB_LEAD_PAYLOAD_PURGED';
  end if;

  -- Un prospect déjà créé ne se réaffecte pas : c'est la garantie
  -- anti-doublon en cas de rejeu tardif.
  if old.opportunity_id is not null and new.opportunity_id is distinct from old.opportunity_id then
    raise exception 'WEB_LEAD_ALREADY_INTEGRATED';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists web_lead_submissions_guard on public.web_lead_submissions;
create trigger web_lead_submissions_guard
before update on public.web_lead_submissions
for each row
execute function public.web_lead_submissions_guard();

-- ---------------------------------------------------------------------------
-- Réception
--
-- Renvoie l'accusé de réception. Sur rejeu, renvoie l'accusé d'origine avec
-- `duplicate` à vrai : OVH peut donc réessayer sans risque après une coupure
-- survenue entre l'écriture et la réponse.
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_web_lead(
  p_organization_id uuid,
  p_submission_id text,
  p_kind text,
  p_payload jsonb,
  p_signature_sent_at timestamptz,
  p_retention_days integer default 30
)
returns table (id uuid, received_at timestamptz, status text, duplicate boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  existing public.web_lead_submissions;
  inserted public.web_lead_submissions;
begin
  select * into existing
  from public.web_lead_submissions
  where organization_id = p_organization_id
    and kind = p_kind
    and submission_id = p_submission_id;

  if found then
    insert into public.web_lead_events (organization_id, submission_pk, kind, attempt)
    values (p_organization_id, existing.id, 'duplicate_ignored', existing.attempts);
    return query select existing.id, existing.received_at, existing.status, true;
    return;
  end if;

  insert into public.web_lead_submissions (
    organization_id, submission_id, kind, payload,
    payload_purge_after, signature_sent_at
  )
  values (
    p_organization_id, p_submission_id, p_kind, p_payload,
    now() + make_interval(days => greatest(coalesce(p_retention_days, 30), 1)),
    p_signature_sent_at
  )
  returning * into inserted;

  insert into public.web_lead_events (organization_id, submission_pk, kind)
  values (p_organization_id, inserted.id, 'received');

  return query select inserted.id, inserted.received_at, inserted.status, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Réservation atomique
--
-- Récupère aussi les demandes bloquées en `processing` depuis plus de dix
-- minutes : une exécution interrompue ne gèle pas la file.
-- ---------------------------------------------------------------------------

create or replace function public.reserve_web_leads(
  p_worker text,
  p_limit integer default 20
)
returns setof public.web_lead_submissions
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  return query
  with candidates as (
    select s.id
    from public.web_lead_submissions s
    where (s.status = 'pending' and s.next_attempt_at <= now())
       or (s.status = 'processing' and s.locked_at < now() - interval '10 minutes')
    order by s.next_attempt_at
    limit greatest(least(coalesce(p_limit, 20), 100), 1)
    for update skip locked
  )
  update public.web_lead_submissions s
  set status = 'processing',
      locked_at = now(),
      locked_by = left(coalesce(p_worker, 'inconnu'), 64),
      attempts = s.attempts + 1
  from candidates c
  where s.id = c.id
  returning s.*;
end;
$$;

-- ---------------------------------------------------------------------------
-- Résultat d'une tentative
-- ---------------------------------------------------------------------------

create or replace function public.settle_web_lead(
  p_id uuid,
  p_outcome text,
  p_opportunity_id uuid default null,
  p_dedup_decision text default null,
  p_dedup_candidate_ids uuid[] default '{}'::uuid[],
  p_error_code text default null
)
returns public.web_lead_submissions
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  row_before public.web_lead_submissions;
  result public.web_lead_submissions;
  retry_delay interval;
  event_kind text;
  next_status text;
begin
  select * into row_before from public.web_lead_submissions where id = p_id;
  if not found then
    raise exception 'WEB_LEAD_NOT_FOUND';
  end if;

  if p_outcome = 'succeeded' then
    next_status := 'done';
    event_kind := 'succeeded';
  elsif p_outcome = 'review' then
    next_status := 'review';
    event_kind := 'sent_to_review';
  elsif p_outcome = 'retry' then
    retry_delay := case row_before.attempts
      when 1 then interval '1 minute'
      when 2 then interval '5 minutes'
      when 3 then interval '15 minutes'
      when 4 then interval '1 hour'
      when 5 then interval '6 hours'
      else interval '24 hours'
    end;
    if row_before.attempts >= 7 then
      next_status := 'failed';
      event_kind := 'failed';
    else
      next_status := 'pending';
      event_kind := 'retry_scheduled';
    end if;
  else
    raise exception 'WEB_LEAD_UNKNOWN_OUTCOME';
  end if;

  update public.web_lead_submissions
  set status = next_status,
      locked_at = null,
      locked_by = null,
      opportunity_id = coalesce(p_opportunity_id, opportunity_id),
      dedup_decision = coalesce(p_dedup_decision, dedup_decision),
      dedup_candidate_ids = case
        when p_dedup_candidate_ids is null or cardinality(p_dedup_candidate_ids) = 0
          then dedup_candidate_ids
        else p_dedup_candidate_ids
      end,
      last_error_code = case when next_status = 'pending' or next_status = 'failed'
        then left(coalesce(p_error_code, 'inconnu'), 64) else null end,
      next_attempt_at = case when next_status = 'pending' then now() + retry_delay else next_attempt_at end
  where id = p_id
  returning * into result;

  insert into public.web_lead_events (organization_id, submission_pk, kind, attempt, error_code)
  values (result.organization_id, result.id, event_kind, result.attempts,
          left(nullif(p_error_code, ''), 64));

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reprise manuelle
--
-- Une demande en échec ou en revue peut être remise en file par un
-- administrateur. Une demande déjà intégrée ne peut pas l'être : le
-- déclencheur bloquerait de toute façon la réaffectation du prospect.
-- ---------------------------------------------------------------------------

create or replace function public.requeue_web_lead(p_id uuid, p_author_id uuid)
returns public.web_lead_submissions
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  result public.web_lead_submissions;
begin
  update public.web_lead_submissions
  set status = 'pending',
      attempts = 0,
      next_attempt_at = now(),
      locked_at = null,
      locked_by = null,
      last_error_code = null
  where id = p_id
    and status in ('failed', 'review')
    and opportunity_id is null
  returning * into result;

  if not found then
    raise exception 'WEB_LEAD_NOT_REQUEUABLE';
  end if;

  insert into public.web_lead_events (organization_id, submission_pk, kind, author_id)
  values (result.organization_id, result.id, 'requeued', p_author_id);

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Purge des demandes brutes
--
-- L'historique du traitement est conservé, le contenu de la demande non.
-- ---------------------------------------------------------------------------

create or replace function public.purge_web_lead_payloads()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  purged integer;
begin
  with cleared as (
    update public.web_lead_submissions
    set payload = null,
        payload_purged_at = now()
    where payload is not null
      and payload_purge_after < now()
      and status in ('done', 'discarded')
    returning id, organization_id
  )
  insert into public.web_lead_events (organization_id, submission_pk, kind)
  select organization_id, id, 'payload_purged' from cleared;

  get diagnostics purged = row_count;
  return purged;
end;
$$;

alter table public.web_lead_submissions enable row level security;
alter table public.web_lead_events enable row level security;

-- Toutes les écritures passent par les fonctions ci-dessus. `service_role` ne
-- reçoit que la lecture : aucune route ne peut insérer, modifier ou supprimer
-- une demande en contournant la file.
revoke all on public.web_lead_submissions from anon, authenticated, service_role;
revoke all on public.web_lead_events from anon, authenticated, service_role;

grant select on public.web_lead_submissions to service_role;
grant select on public.web_lead_events to service_role;

revoke all on function public.web_lead_events_append_only() from public, anon, authenticated;
revoke all on function public.web_lead_submissions_guard() from public, anon, authenticated;
revoke all on function public.enqueue_web_lead(uuid, text, text, jsonb, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.reserve_web_leads(text, integer) from public, anon, authenticated;
revoke all on function public.settle_web_lead(uuid, text, uuid, text, uuid[], text) from public, anon, authenticated;
revoke all on function public.requeue_web_lead(uuid, uuid) from public, anon, authenticated;
revoke all on function public.purge_web_lead_payloads() from public, anon, authenticated;

grant execute on function public.enqueue_web_lead(uuid, text, text, jsonb, timestamptz, integer) to service_role;
grant execute on function public.reserve_web_leads(text, integer) to service_role;
grant execute on function public.settle_web_lead(uuid, text, uuid, text, uuid[], text) to service_role;
grant execute on function public.requeue_web_lead(uuid, uuid) to service_role;
grant execute on function public.purge_web_lead_payloads() to service_role;
