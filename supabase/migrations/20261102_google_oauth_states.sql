-- ---------------------------------------------------------------------------
-- Jetons OAuth à usage unique (option A)
--
-- Remplace le paramètre `state` actuel, qui transporte `userId` et `orgId` en
-- base64 non signé et permet donc à un appel anonyme sur la route de retour
-- d'écrire des jetons Google dans l'organisation de son choix.
--
-- Le jeton envoyé à Google est un aléa de 32 octets. Seule son empreinte
-- SHA-256 est stockée ici : une lecture de cette table ne permet pas de
-- rejouer un parcours d'autorisation.
--
-- NON APPLIQUÉE. Aucune donnée existante n'est touchée par ce fichier.
-- ---------------------------------------------------------------------------

create table if not exists public.google_oauth_states (
  nonce_hash text primary key,
  purpose text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null,
  redirect_path text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint google_oauth_states_purpose_chk
    check (purpose in ('calendar', 'google_ads', 'meta_ads')),
  constraint google_oauth_states_nonce_hash_chk
    check (nonce_hash ~ '^[0-9a-f]{64}$'),
  constraint google_oauth_states_expiry_chk
    check (expires_at > created_at),
  -- Liste blanche, et non expression de forme.
  --
  -- Deux versions par expression ont déjà laissé passer ce qu'elles devaient
  -- bloquer : `//exemple.test/`, qu'un navigateur lit comme une adresse
  -- absolue vers un autre domaine, puis `/../admin` et toute remontée de
  -- chemin, le point étant un caractère autorisé. Une énumération ne peut pas
  -- se tromper ainsi.
  --
  -- Le CRM est une application à page unique : `/` est aujourd'hui la seule
  -- destination de retour utilisée. Ajouter une destination demande donc une
  -- migration d'une ligne, ce qui est voulu pour un champ qui décide d'une
  -- redirection. La même liste est reprise dans app/lib/oauth-state.js, et
  -- tests/oauth-state.test.js vérifie que les deux ne divergent pas.
  constraint google_oauth_states_redirect_chk
    check (redirect_path is null or redirect_path in ('/'))
);

comment on table public.google_oauth_states is
  'Jetons OAuth à usage unique. La consommation se fait par un UPDATE conditionnel atomique, jamais par un SELECT suivi d''un UPDATE.';
comment on column public.google_oauth_states.nonce_hash is
  'SHA-256 hexadécimal du jeton. Le jeton en clair n''est jamais stocké.';
comment on column public.google_oauth_states.redirect_path is
  'Destination interne de retour, prise dans une liste blanche fermée. Une énumération et non une expression de forme : deux expressions successives avaient laissé passer une redirection externe puis une remontée de chemin.';

create index if not exists google_oauth_states_expiry_idx
  on public.google_oauth_states (expires_at)
  where consumed_at is null;

create index if not exists google_oauth_states_user_idx
  on public.google_oauth_states (organization_id, user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Immuabilité
--
-- `service_role` contourne RLS et les politiques, mais pas les déclencheurs.
-- C'est donc le seul endroit où l'usage unique peut être garanti même en cas
-- de bogue applicatif : une fois consommé, un jeton ne peut plus revenir à
-- l'état disponible, et l'identité attachée au jeton ne peut plus changer.
--
-- Pas de SECURITY DEFINER : la fonction ne lit et n'écrit aucune table, elle
-- ne compare que OLD et NEW. Lui donner les droits de son propriétaire serait
-- un privilège sans emploi, donc une surface inutile.
-- ---------------------------------------------------------------------------

create or replace function public.google_oauth_states_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  -- `is distinct from` et non `<>` : la comparaison doit rester juste pour
  -- `redirect_path`, qui est le seul champ comparé pouvant valoir NULL. Avec
  -- `<>`, passer une valeur à NULL ou l'inverse donne NULL, donc ni vrai ni
  -- faux, et la modification serait acceptée en silence. Les autres champs
  -- sont déclarés NOT NULL, mais la même forme est employée partout pour
  -- qu'aucune colonne rendue nullable plus tard ne rouvre la brèche.
  if new.nonce_hash is distinct from old.nonce_hash
    or new.user_id is distinct from old.user_id
    or new.organization_id is distinct from old.organization_id
    or new.purpose is distinct from old.purpose
    or new.redirect_path is distinct from old.redirect_path
    or new.created_at is distinct from old.created_at
    or new.expires_at is distinct from old.expires_at
  then
    raise exception 'OAUTH_STATE_IMMUTABLE';
  end if;

  if old.consumed_at is not null then
    raise exception 'OAUTH_STATE_ALREADY_CONSUMED';
  end if;

  if new.consumed_at is null then
    raise exception 'OAUTH_STATE_CONSUMPTION_REQUIRED';
  end if;

  return new;
end;
$$;

drop trigger if exists google_oauth_states_guard on public.google_oauth_states;
create trigger google_oauth_states_guard
before update on public.google_oauth_states
for each row
execute function public.google_oauth_states_guard();

-- ---------------------------------------------------------------------------
-- Purge
--
-- Les jetons consommés ou expirés n'ont aucune valeur d'audit au-delà de
-- quelques jours. La suppression passe par cette fonction pour qu'aucun droit
-- de DELETE direct ne soit nécessaire.
--
-- SECURITY DEFINER conservé, et nécessaire ici : c'est précisément ce qui
-- permet de ne jamais accorder DELETE à `service_role`. Sans ce droit, un
-- jeton consommé ne peut pas être supprimé puis réinséré pour être rejoué.
--
-- La table et les fonctions appelées sont qualifiées : une fonction SECURITY
-- DEFINER s'exécute avec les droits de son propriétaire, donc une résolution
-- détournée y aurait plus de portée qu'ailleurs.
-- ---------------------------------------------------------------------------

create or replace function public.purge_google_oauth_states(p_keep_days integer default 7)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  removed integer;
begin
  delete from public.google_oauth_states
  where created_at < pg_catalog.now()
                   - pg_catalog.make_interval(days => greatest(coalesce(p_keep_days, 7), 1));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

alter table public.google_oauth_states enable row level security;

-- Pas de droit DELETE : la suppression passe uniquement par la purge, sinon un
-- jeton consommé pourrait être supprimé puis réinséré pour être rejoué.
revoke all on public.google_oauth_states from anon, authenticated, service_role;
grant select, insert, update on public.google_oauth_states to service_role;

revoke all on function public.google_oauth_states_guard() from public, anon, authenticated;
revoke all on function public.purge_google_oauth_states(integer) from public, anon, authenticated;
grant execute on function public.purge_google_oauth_states(integer) to service_role;

-- Droit explicite sur le déclencheur. Il n'est plus SECURITY DEFINER, donc il
-- s'exécute avec les droits de celui qui écrit dans la table. PostgreSQL ne
-- vérifie EXECUTE qu'à la création du déclencheur, mais s'appuyer sur ce
-- détail serait fragile : le droit est donc accordé, et à `service_role`
-- seulement. Aucune permission applicative n'est élargie, `anon` et
-- `authenticated` restant sans aucun droit sur la table comme sur la
-- fonction.
grant execute on function public.google_oauth_states_guard() to service_role;
