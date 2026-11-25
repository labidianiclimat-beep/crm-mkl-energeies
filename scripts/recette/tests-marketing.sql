-- Tests fonctionnels du module marketing, sur MKL CRM RECETTE.
--
-- À exécuter dans une transaction annulée : les tests écrivent réellement,
-- déclenchent les vrais déclencheurs et les vraies contraintes, puis tout est
-- défait. La base ne conserve aucune donnée de test.
--
--   psql … --single-transaction -f tests-marketing.sql   (puis rollback)
--
-- Chaque test consigne son verdict. Un test qui attend un refus est réussi
-- quand le refus arrive avec le bon code d'erreur, et échoué quand
-- l'opération passe : c'est l'inverse de l'intuition, et c'est volontaire.

create temporary table resultat (
  rang serial,
  domaine text,
  intitule text,
  verdict text,
  detail text
) on commit drop;

-- `service_role` doit pouvoir consigner ses propres verdicts : certains tests
-- basculent sur ce rôle pour éprouver les droits réels de l'application.
-- La séquence du `serial` compte aussi : sans son usage, l'insertion échoue.
grant insert, select on resultat to service_role;
grant usage on sequence resultat_rang_seq to service_role;

create temporary table contexte (
  org uuid,
  opp uuid,
  opp2 uuid,
  soumission text
) on commit drop;

insert into contexte
select
  (select id from public.organizations order by created_at limit 1),
  gen_random_uuid(), gen_random_uuid(),
  'test-' || substr(md5(random()::text), 1, 12);

do $$
declare
  c record;
begin
  select * into c from contexte;

  -- Deux prospects de travail, créés avec le libellé commercial attendu.
  insert into public.commercial_opportunities (id, organization_id, name, source,
                                               origin_channel, origin_category)
  values (c.opp, c.org, 'Essai attribution', 'Prospect GG Ads',
          'web_ingest', 'google_ads');

  insert into public.commercial_opportunities (id, organization_id, name, source,
                                               origin_channel, origin_category)
  values (c.opp2, c.org, 'Essai affinage', 'À qualifier',
          'web_ingest', 'a_qualifier');
end $$;

-- ===========================================================================
-- A. Doublons de prospects et de rendez-vous
-- ===========================================================================

do $$
declare
  c record; n integer;
begin
  select * into c from contexte;

  -- A1 : la mise en file est idempotente sur l'identifiant de soumission.
  perform public.enqueue_web_lead(c.org, c.soumission, 'lead',
            '{"nom":"Essai"}'::jsonb, now(), 30);
  perform public.enqueue_web_lead(c.org, c.soumission, 'lead',
            '{"nom":"Essai"}'::jsonb, now(), 30);
  select count(*) into n from public.web_lead_submissions
    where organization_id = c.org and submission_id = c.soumission;
  insert into resultat (domaine, intitule, verdict, detail) values
    ('doublons', 'deux mises en file identiques ne créent qu''une demande',
     case when n = 1 then 'réussi' else 'ÉCHOUÉ' end, n || ' ligne(s)');
exception when others then
  insert into resultat (domaine, intitule, verdict, detail) values
    ('doublons', 'deux mises en file identiques ne créent qu''une demande',
     'ÉCHOUÉ', sqlerrm);
end $$;

do $$
declare c record;
begin
  select * into c from contexte;
  insert into public.web_lead_submissions
    (organization_id, submission_id, kind, payload_purge_after, signature_sent_at)
  values (c.org, c.soumission, 'lead', now() + interval '30 days', now());
  insert into resultat (domaine, intitule, verdict, detail) values
    ('doublons', 'insertion directe d''une demande en double', 'ÉCHOUÉ',
     'acceptée alors qu''elle devait être refusée');
exception
  when unique_violation then
    insert into resultat (domaine, intitule, verdict, detail) values
      ('doublons', 'insertion directe d''une demande en double', 'réussi',
       'refusée par l''index unique');
  when others then
    insert into resultat (domaine, intitule, verdict, detail) values
      ('doublons', 'insertion directe d''une demande en double', 'ÉCHOUÉ', sqlerrm);
end $$;

do $$
declare c record;
begin
  select * into c from contexte;
  insert into public.lead_attribution
    (organization_id, opportunity_id, origin_channel, origin_category,
     submission_id, touch_role)
  values (c.org, c.opp, 'web_ingest', 'google_ads', c.soumission, 'premier');
  insert into public.lead_attribution
    (organization_id, opportunity_id, origin_channel, origin_category,
     submission_id, touch_role)
  values (c.org, c.opp, 'web_ingest', 'google_ads', c.soumission, 'premier');
  insert into resultat (domaine, intitule, verdict, detail) values
    ('doublons', 'deux premiers contacts pour une même soumission', 'ÉCHOUÉ',
     'acceptés alors qu''ils devaient être refusés');
exception
  when unique_violation then
    insert into resultat (domaine, intitule, verdict, detail) values
      ('doublons', 'deux premiers contacts pour une même soumission', 'réussi',
       'refusés par lead_attribution_submission_idx');
  when others then
    insert into resultat (domaine, intitule, verdict, detail) values
      ('doublons', 'deux premiers contacts pour une même soumission', 'ÉCHOUÉ', sqlerrm);
end $$;

do $$
declare c record;
begin
  select * into c from contexte;
  insert into public.commercial_opportunities (organization_id, name, source, extra)
  values (c.org, 'Doublon A', 'Prospect GG Ads',
          jsonb_build_object('webLead', jsonb_build_object('submissionId', c.soumission)));
  insert into public.commercial_opportunities (organization_id, name, source, extra)
  values (c.org, 'Doublon B', 'Prospect GG Ads',
          jsonb_build_object('webLead', jsonb_build_object('submissionId', c.soumission)));
  insert into resultat (domaine, intitule, verdict, detail) values
    ('doublons', 'deux prospects pour une même demande web', 'ÉCHOUÉ',
     'acceptés alors qu''ils devaient être refusés');
exception
  when unique_violation then
    insert into resultat (domaine, intitule, verdict, detail) values
      ('doublons', 'deux prospects pour une même demande web', 'réussi',
       'refusés par commercial_opportunities_web_lead_idx');
  when others then
    insert into resultat (domaine, intitule, verdict, detail) values
      ('doublons', 'deux prospects pour une même demande web', 'ÉCHOUÉ', sqlerrm);
end $$;

do $$
declare c record;
begin
  select * into c from contexte;
  insert into public.commercial_appointments (organization_id, starts_at, extra)
  values (c.org, now(),
          jsonb_build_object('webLead', jsonb_build_object('submissionId', c.soumission)));
  insert into public.commercial_appointments (organization_id, starts_at, extra)
  values (c.org, now() + interval '1 hour',
          jsonb_build_object('webLead', jsonb_build_object('submissionId', c.soumission)));
  insert into resultat (domaine, intitule, verdict, detail) values
    ('doublons', 'deux rendez-vous pour une même demande web', 'ÉCHOUÉ',
     'acceptés alors qu''ils devaient être refusés');
exception
  when unique_violation then
    insert into resultat (domaine, intitule, verdict, detail) values
      ('doublons', 'deux rendez-vous pour une même demande web', 'réussi',
       'refusés par commercial_appointments_web_lead_idx');
  when others then
    insert into resultat (domaine, intitule, verdict, detail) values
      ('doublons', 'deux rendez-vous pour une même demande web', 'ÉCHOUÉ', sqlerrm);
end $$;

-- ===========================================================================
-- B. Origines
-- ===========================================================================

insert into resultat (domaine, intitule, verdict, detail)
select 'origines',
       'les quatre origines attendues sont valides',
       case when bool_and(ok) then 'réussi' else 'ÉCHOUÉ' end,
       string_agg(libelle || '=' || ok::text, ', ' order by libelle)
from (values
  ('Google Ads',    public.origin_pair_is_valid('web_ingest', 'google_ads')),
  ('Facebook',      public.origin_pair_is_valid('web_ingest', 'meta_ads')),
  ('Site Internet', public.origin_pair_is_valid('web_ingest', 'site_web')),
  ('Prospection',   public.origin_pair_is_valid('crm_manual', 'prospection'))
) as t(libelle, ok);

insert into resultat (domaine, intitule, verdict, detail)
select 'origines',
       'une demande web ne peut pas être déclarée en prospection terrain',
       case when not public.origin_pair_is_valid('web_ingest', 'prospection')
            then 'réussi' else 'ÉCHOUÉ' end,
       'web_ingest + prospection refusé';

do $$
declare c record;
begin
  select * into c from contexte;
  -- Régression : le libellé commercial « Prospection » doit passer.
  insert into public.commercial_opportunities
    (organization_id, name, source, origin_channel, origin_category)
  values (c.org, 'Prospection terrain', 'Prospection', 'crm_manual', 'prospection');
  insert into resultat (domaine, intitule, verdict, detail) values
    ('origines', 'le libellé commercial « Prospection » est accepté', 'réussi',
     'création réussie');
exception when others then
  insert into resultat (domaine, intitule, verdict, detail) values
    ('origines', 'le libellé commercial « Prospection » est accepté', 'ÉCHOUÉ',
     sqlerrm);
end $$;

do $$
declare c record;
begin
  select * into c from contexte;
  insert into public.commercial_opportunities
    (organization_id, name, source, origin_channel, origin_category)
  values (c.org, 'Code brut', 'prospection', 'crm_manual', 'prospection');
  insert into resultat (domaine, intitule, verdict, detail) values
    ('origines', 'le code brut « prospection » est refusé', 'ÉCHOUÉ', 'accepté');
exception when others then
  insert into resultat (domaine, intitule, verdict, detail) values
    ('origines', 'le code brut « prospection » est refusé',
     case when sqlerrm like '%SOURCE_EXPECTS_LABEL%' then 'réussi' else 'ÉCHOUÉ' end,
     sqlerrm);
end $$;

do $$
declare c record; essai text;
begin
  select * into c from contexte;
  foreach essai in array array['google', 'Google', 'GOOGLE'] loop
    begin
      insert into public.commercial_opportunities (organization_id, name, source)
      values (c.org, 'Marqueur agenda', essai);
      insert into resultat (domaine, intitule, verdict, detail) values
        ('origines', 'le marqueur Google Calendar « ' || essai || ' » est refusé',
         'ÉCHOUÉ', 'accepté');
    exception when others then
      insert into resultat (domaine, intitule, verdict, detail) values
        ('origines', 'le marqueur Google Calendar « ' || essai || ' » est refusé',
         case when sqlerrm like '%SOURCE_RESERVED_MARKER%' then 'réussi' else 'ÉCHOUÉ' end,
         sqlerrm);
    end;
  end loop;
end $$;

do $$
declare c record;
begin
  select * into c from contexte;
  update public.commercial_opportunities
     set origin_category = 'meta_ads'
   where id = c.opp;
  insert into resultat (domaine, intitule, verdict, detail) values
    ('origines', 'une origine déjà établie ne peut pas être changée', 'ÉCHOUÉ',
     'modification acceptée');
exception when others then
  insert into resultat (domaine, intitule, verdict, detail) values
    ('origines', 'une origine déjà établie ne peut pas être changée',
     case when sqlerrm like '%ORIGIN_IMMUTABLE%' then 'réussi' else 'ÉCHOUÉ' end,
     sqlerrm);
end $$;

do $$
declare c record; vu text;
begin
  select * into c from contexte;
  update public.commercial_opportunities
     set origin_category = 'google_ads'
   where id = c.opp2;
  select origin_category into vu from public.commercial_opportunities where id = c.opp2;
  insert into resultat (domaine, intitule, verdict, detail) values
    ('origines', 'une origine « à qualifier » peut être affinée',
     case when vu = 'google_ads' then 'réussi' else 'ÉCHOUÉ' end,
     'devenue ' || vu);
exception when others then
  insert into resultat (domaine, intitule, verdict, detail) values
    ('origines', 'une origine « à qualifier » peut être affinée', 'ÉCHOUÉ', sqlerrm);
end $$;

-- ===========================================================================
-- C. Les deux modèles d'attribution
-- ===========================================================================

do $$
declare c record; premier text; dernier text;
begin
  select * into c from contexte;

  insert into public.lead_attribution
    (organization_id, opportunity_id, origin_channel, origin_category,
     touched_at, campaign_name, touch_role, evidence)
  values (c.org, c.opp, 'web_ingest', 'google_ads',
          now() - interval '10 days', 'Campagne PAC hiver', 'premier', 'gclid');

  insert into public.lead_attribution
    (organization_id, opportunity_id, origin_channel, origin_category,
     touched_at, campaign_name, touch_role, evidence)
  values (c.org, c.opp, 'web_ingest', 'meta_ads',
          now() - interval '1 day', 'Campagne PV automne', 'dernier', 'fbclid');

  select max(case when touch_role = 'premier' then origin_category end),
         max(case when touch_role = 'dernier' then origin_category end)
    into premier, dernier
    from public.lead_attribution
   where opportunity_id = c.opp and touch_role in ('premier', 'dernier');

  insert into resultat (domaine, intitule, verdict, detail) values
    ('attribution', 'premier et dernier contact lisibles côte à côte',
     case when premier = 'google_ads' and dernier = 'meta_ads'
          then 'réussi' else 'ÉCHOUÉ' end,
     'premier=' || coalesce(premier, 'néant') || ', dernier=' || coalesce(dernier, 'néant'));
exception when others then
  insert into resultat (domaine, intitule, verdict, detail) values
    ('attribution', 'premier et dernier contact lisibles côte à côte', 'ÉCHOUÉ', sqlerrm);
end $$;

-- Une modification qui ne trouve aucune ligne réussit sans rien prouver. Le
-- nombre de lignes présentes est donc vérifié d'abord : sans lui, ces deux
-- tests se déclareraient concluants sur une table vide.
do $$
declare c record; presentes integer; touchees integer;
begin
  select * into c from contexte;
  select count(*) into presentes from public.lead_attribution
   where opportunity_id = c.opp and touch_role = 'premier';

  if presentes = 0 then
    insert into resultat (domaine, intitule, verdict, detail) values
      ('attribution', 'une attribution ne peut pas être réécrite', 'NON CONCLUANT',
       'aucune ligne à réécrire : le test ne démontre rien');
    return;
  end if;

  begin
    update public.lead_attribution set campaign_name = 'Réécriture'
     where opportunity_id = c.opp and touch_role = 'premier';
    get diagnostics touchees = row_count;
    insert into resultat (domaine, intitule, verdict, detail) values
      ('attribution', 'une attribution ne peut pas être réécrite', 'ÉCHOUÉ',
       touchees || ' ligne(s) réécrite(s) sur ' || presentes);
  exception when others then
    insert into resultat (domaine, intitule, verdict, detail) values
      ('attribution', 'une attribution ne peut pas être réécrite', 'réussi', sqlerrm);
  end;
end $$;

-- La suppression se mesure sous `service_role`, le rôle qu'emploient toutes
-- les routes du CRM, et non sous le propriétaire de la base. La version
-- précédente de ce test se connectait en propriétaire : la suppression
-- réussissait, et le test concluait à tort à une faille applicative. Un
-- administrateur se connectant en SQL direct peut supprimer, c'est voulu ;
-- l'application, non.
do $$
declare droits text;
begin
  select coalesce(string_agg(privilege_type, ',' order by privilege_type), 'aucun')
    into droits
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'lead_attribution'
     and grantee = 'service_role'
     and privilege_type in ('UPDATE', 'DELETE');

  insert into resultat (domaine, intitule, verdict, detail) values
    ('attribution', 'service_role ne peut ni réécrire ni supprimer une attribution',
     case when droits = 'aucun' then 'réussi' else 'ÉCHOUÉ' end,
     'droits constatés : ' || droits);
end $$;

-- Au-delà de la table des droits, l'opération est réellement tentée sous le
-- rôle de l'application. `set local` limite le changement à la transaction.
set local role service_role;

do $$
declare c record;
begin
  select * into c from contexte;
  delete from public.lead_attribution where opportunity_id = c.opp;
  insert into resultat (domaine, intitule, verdict, detail) values
    ('attribution', 'la suppression échoue réellement sous service_role', 'ÉCHOUÉ',
     'suppression acceptée');
exception
  when insufficient_privilege then
    insert into resultat (domaine, intitule, verdict, detail) values
      ('attribution', 'la suppression échoue réellement sous service_role', 'réussi',
       'droit DELETE absent');
  when others then
    insert into resultat (domaine, intitule, verdict, detail) values
      ('attribution', 'la suppression échoue réellement sous service_role', 'réussi',
       sqlerrm);
end $$;

reset role;

-- ===========================================================================
-- D. Sécurité OAuth
-- ===========================================================================

-- `user_id` est NOT NULL et référence auth.users, vide sur la recette : il
-- faut donc un compte de travail, défait avec la transaction.
do $$
declare c record;
begin
  select * into c from contexte;
  insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-0000000000aa', 'essai-recette@local.test')
  on conflict (id) do nothing;
end $$;

-- Les contraintes de la table sont elles-mêmes des mesures de sécurité : une
-- empreinte doit être un condensat sha256, la finalité doit figurer dans une
-- liste fermée, et la redirection ne peut valoir que « / », ce qui interdit
-- toute redirection ouverte vers un domaine tiers.
do $$
declare c record; essai record;
begin
  select * into c from contexte;
  for essai in
    select * from (values
      ('une empreinte qui n''est pas un sha256 est refusée',
       'pas-un-condensat', 'calendar', '/'),
      ('une finalité hors liste est refusée',
       encode(sha256(random()::text::bytea), 'hex'), 'agenda', '/'),
      ('une redirection vers un domaine tiers est refusée',
       encode(sha256(random()::text::bytea), 'hex'), 'calendar', 'https://exemple.test/vol')
    ) as t(intitule, empreinte, finalite, redirection)
  loop
    begin
      insert into public.google_oauth_states
        (nonce_hash, purpose, user_id, organization_id, redirect_path, expires_at)
      values (essai.empreinte, essai.finalite,
              '00000000-0000-0000-0000-0000000000aa', c.org, essai.redirection,
              now() + interval '10 minutes');
      insert into resultat (domaine, intitule, verdict, detail) values
        ('oauth', essai.intitule, 'ÉCHOUÉ', 'accepté');
    exception when check_violation then
      insert into resultat (domaine, intitule, verdict, detail) values
        ('oauth', essai.intitule, 'réussi', 'refusé par une contrainte');
    when others then
      insert into resultat (domaine, intitule, verdict, detail) values
        ('oauth', essai.intitule, 'ÉCHOUÉ', sqlerrm);
    end;
  end loop;
end $$;

do $$
declare c record; empreinte text;
begin
  select * into c from contexte;
  empreinte := encode(sha256(random()::text::bytea), 'hex');

  insert into public.google_oauth_states
    (nonce_hash, purpose, user_id, organization_id, redirect_path, expires_at)
  values (empreinte, 'calendar', '00000000-0000-0000-0000-0000000000aa', c.org, '/',
          now() + interval '10 minutes');

  -- D1 : modifier un champ autre que la consommation.
  begin
    update public.google_oauth_states set expires_at = now() + interval '1 year'
     where nonce_hash = empreinte;
    insert into resultat (domaine, intitule, verdict, detail) values
      ('oauth', 'un jeton OAuth est immuable', 'ÉCHOUÉ', 'modification acceptée');
  exception when others then
    insert into resultat (domaine, intitule, verdict, detail) values
      ('oauth', 'un jeton OAuth est immuable',
       case when sqlerrm like '%OAUTH_STATE_IMMUTABLE%' then 'réussi' else 'ÉCHOUÉ' end,
       sqlerrm);
  end;

  -- D2 : une modification doit consommer, pas seulement toucher la ligne.
  begin
    update public.google_oauth_states set consumed_at = null
     where nonce_hash = empreinte;
    insert into resultat (domaine, intitule, verdict, detail) values
      ('oauth', 'une écriture qui ne consomme pas est refusée', 'ÉCHOUÉ', 'acceptée');
  exception when others then
    insert into resultat (domaine, intitule, verdict, detail) values
      ('oauth', 'une écriture qui ne consomme pas est refusée',
       case when sqlerrm like '%OAUTH_STATE_CONSUMPTION_REQUIRED%' then 'réussi' else 'ÉCHOUÉ' end,
       sqlerrm);
  end;

  -- D3 : consommation, puis seconde tentative.
  update public.google_oauth_states set consumed_at = now() where nonce_hash = empreinte;
  begin
    update public.google_oauth_states set consumed_at = now() where nonce_hash = empreinte;
    insert into resultat (domaine, intitule, verdict, detail) values
      ('oauth', 'un jeton ne peut être consommé qu''une fois', 'ÉCHOUÉ',
       'seconde consommation acceptée');
  exception when others then
    insert into resultat (domaine, intitule, verdict, detail) values
      ('oauth', 'un jeton ne peut être consommé qu''une fois',
       case when sqlerrm like '%OAUTH_STATE_ALREADY_CONSUMED%' then 'réussi' else 'ÉCHOUÉ' end,
       sqlerrm);
  end;
end $$;

do $$
declare c record; empreinte text; pris integer;
begin
  select * into c from contexte;
  empreinte := encode(sha256(random()::text::bytea), 'hex');
  -- La contrainte exige expires_at > created_at : on pose donc une création
  -- dans le passé, et une échéance déjà franchie.
  insert into public.google_oauth_states
    (nonce_hash, purpose, user_id, organization_id, redirect_path,
     created_at, expires_at)
  values (empreinte, 'calendar', '00000000-0000-0000-0000-0000000000aa', c.org, '/',
          now() - interval '20 minutes', now() - interval '1 minute');

  -- La consommation applicative filtre sur l'échéance : un jeton périmé ne
  -- doit être sélectionné par personne.
  with pris as (
    update public.google_oauth_states set consumed_at = now()
     where nonce_hash = empreinte and consumed_at is null and expires_at > now()
    returning 1
  )
  select count(*) into pris from pris;

  insert into resultat (domaine, intitule, verdict, detail) values
    ('oauth', 'un jeton périmé n''est pas consommable',
     case when pris = 0 then 'réussi' else 'ÉCHOUÉ' end,
     pris || ' ligne(s) prise(s)');
exception when others then
  insert into resultat (domaine, intitule, verdict, detail) values
    ('oauth', 'un jeton périmé n''est pas consommable', 'ÉCHOUÉ', sqlerrm);
end $$;

insert into resultat (domaine, intitule, verdict, detail)
select 'oauth',
       'ni anon ni authenticated n''ont de droit sur les jetons OAuth',
       case when count(*) = 0 then 'réussi' else 'ÉCHOUÉ' end,
       coalesce(string_agg(grantee || ':' || privilege_type, ', '), 'aucun droit')
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'google_oauth_states'
  and grantee in ('anon', 'authenticated');

insert into resultat (domaine, intitule, verdict, detail)
select 'oauth',
       'ni anon ni authenticated n''ont de droit sur les demandes web',
       case when count(*) = 0 then 'réussi' else 'ÉCHOUÉ' end,
       coalesce(string_agg(table_name || '/' || grantee, ', '), 'aucun droit')
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('web_lead_submissions', 'web_lead_events', 'lead_attribution')
  and grantee in ('anon', 'authenticated');

-- ===========================================================================
-- E. Durcissement des fonctions
-- ===========================================================================

insert into resultat (domaine, intitule, verdict, detail)
select 'durcissement',
       'aucune fonction publique sans search_path',
       case when count(*) = 0 then 'réussi' else 'ÉCHOUÉ' end,
       coalesce(string_agg(proname, ', '), 'aucune')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and not exists (
    select 1 from unnest(coalesce(p.proconfig, '{}')) as cfg
     where cfg like 'search_path=%'
  );

insert into resultat (domaine, intitule, verdict, detail)
select 'durcissement',
       'pg_temp est présent et placé en dernier',
       case when count(*) = 0 then 'réussi' else 'ÉCHOUÉ' end,
       coalesce(string_agg(proname, ', '), 'aucune anomalie')
from (
  select p.proname,
         (select cfg from unnest(p.proconfig) as cfg where cfg like 'search_path=%') as chemin
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proconfig is not null
) as f
where chemin is not null
  and chemin not like '%pg_temp';

select rang, domaine, intitule, verdict, detail from resultat order by rang;

select verdict, count(*) as nombre from resultat group by verdict order by verdict;
