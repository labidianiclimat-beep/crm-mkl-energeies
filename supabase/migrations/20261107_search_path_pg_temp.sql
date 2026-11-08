-- ---------------------------------------------------------------------------
-- Complément de durcissement : placer pg_temp en dernier
--
-- `20261105_search_path_hardening.sql` n'agit que sur les fonctions dépourvues
-- de `search_path`. Sept fonctions en déclaraient déjà un, mais incomplet :
-- elles ont donc été sautées, et elles restent exposées.
--
-- Le défaut. Quand `pg_temp` n'est pas nommé dans un `search_path`,
-- PostgreSQL le consulte malgré tout, et **en premier**. Un utilisateur
-- capable de créer un objet temporaire peut donc masquer une fonction
-- appelée à l'intérieur d'une fonction `security definer`, et faire exécuter
-- son propre code avec les droits du propriétaire. Nommer `pg_temp` en
-- dernier referme ce passage, sans rien interdire d'autre.
--
-- Le correctif. `alter function ... set search_path` ne modifie qu'un
-- attribut : le corps de la fonction n'est pas relu, ses droits ne sont pas
-- réécrits, et aucune vue ni aucun déclencheur qui l'appelle n'est invalidé.
-- La logique métier est donc préservée par construction, et non par
-- relecture attentive.
--
-- Les schémas déjà listés sont conservés dans le même ordre. `rls_auto_enable`
-- garde son `pg_catalog` seul, sans `public` : c'est un déclencheur
-- d'événement qui n'appelle que des fonctions du catalogue, et lui ajouter
-- `public` élargirait sa résolution sans raison.
--
-- Retour arrière, fonction par fonction :
--   alter function public.<nom>(<signature>) set search_path = public;
-- ---------------------------------------------------------------------------

do $$
declare
  cible record;
  traitees integer := 0;
  absentes text[] := '{}';
begin
  for cible in
    select * from (values
      ('assign_sav_number()',                 'pg_catalog, public, pg_temp'),
      ('next_sav_number(uuid)',               'pg_catalog, public, pg_temp'),
      ('sync_user_role_from_profile()',       'pg_catalog, public, pg_temp'),
      ('team_member_ids()',                   'pg_catalog, public, pg_temp'),
      ('user_has_permission(uuid, text)',     'pg_catalog, public, pg_temp'),
      ('save_installation_finance(uuid, text, uuid, bigint, bigint, jsonb, uuid)',
                                              'pg_catalog, public, pg_temp'),
      -- Présente en production et en recette, absente des migrations du
      -- dépôt : son existence n'est donc pas garantie sur une base neuve.
      ('rls_auto_enable()',                   'pg_catalog, pg_temp')
    ) as t(signature, chemin)
  loop
    -- `to_regprocedure` renvoie NULL plutôt que d'échouer quand la fonction
    -- n'existe pas : la migration reste donc applicable sur une base qui ne
    -- les porte pas toutes.
    if to_regprocedure('public.' || cible.signature) is null then
      absentes := absentes || cible.signature;
      continue;
    end if;

    execute format('alter function public.%s set search_path = %s',
                   cible.signature, cible.chemin);
    traitees := traitees + 1;
  end loop;

  raise notice 'search_path complété sur % fonction(s)', traitees;
  if array_length(absentes, 1) is not null then
    raise notice 'absentes de cette base, donc ignorées : %',
      array_to_string(absentes, ', ');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Contrôle immédiat, dans la même transaction que la migration : si une seule
-- fonction publique conserve un `search_path` sans `pg_temp` final, la
-- migration échoue et rien n'est conservé.
-- ---------------------------------------------------------------------------

do $$
declare
  restantes text;
begin
  select string_agg(proname, ', ' order by proname) into restantes
  from (
    select p.proname,
           (select cfg from unnest(p.proconfig) as cfg where cfg like 'search_path=%') as chemin
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proconfig is not null
  ) as f
  where chemin is not null and chemin not like '%pg_temp';

  if restantes is not null then
    raise exception 'SEARCH_PATH_INCOMPLET : %', restantes;
  end if;
end $$;
