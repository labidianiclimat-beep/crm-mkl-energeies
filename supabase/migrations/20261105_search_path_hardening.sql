-- ---------------------------------------------------------------------------
-- Durcissement de `search_path` sur les fonctions du schéma public
--
-- AUDIT DE RISQUE
--
-- Constat. 22 fonctions distinctes du schéma `public` n'ont pas de
-- `search_path` fixé. Elles sont définies dans 14 migrations antérieures, de
-- 20260314 à 20261004. La liste est reproduite plus bas.
--
-- Nature du risque. PostgreSQL recherche le schéma temporaire avant les autres
-- pour les relations. Une fonction qui écrit `profiles` sans qualifier le
-- schéma peut donc, en théorie, lire une table temporaire créée par
-- l'appelant au lieu de la vraie table. Quand la fonction sert à décider d'un
-- droit d'accès, c'est la décision elle-même qui devient falsifiable.
--
-- Gravité réelle, après vérification :
--
--   1. Aucune des 22 n'est SECURITY DEFINER. C'est le point le plus important.
--      Aucune ne s'exécute avec des droits supérieurs à ceux de l'appelant,
--      donc aucune ne permet une élévation de privilège. Le détournement ne
--      ferait que tromper une fonction qui tourne déjà avec les droits de
--      l'attaquant.
--
--   2. Quatre d'entre elles interviennent dans des politiques RLS :
--      can_access_client_row, can_access_devis_row, can_access_opportunity_row
--      et can_access_appointment_row. Ce sont les plus sensibles, car leur
--      résultat conditionne la visibilité des lignes. Elles restent toutefois
--      évaluées avec les droits de l'appelant.
--
--   3. L'exploitation suppose de pouvoir créer une table temporaire dans la
--      session, donc d'exécuter du SQL arbitraire. PostgREST ne le permet pas :
--      il n'expose que des tables et des fonctions déclarées. Aucune fonction
--      exposée ne crée d'objet. Le chemin d'attaque n'est donc pas ouvert par
--      les interfaces actuelles.
--
--   4. Les rôles `anon` et `authenticated` ne reçoivent que USAGE sur le
--      schéma public, jamais CREATE, et PostgreSQL 15 retire par défaut CREATE
--      à PUBLIC. Ils ne peuvent pas non plus créer de schéma, faute de droit
--      CREATE sur la base.
--
-- Conclusion. Risque faible aujourd'hui, mais latent : il deviendrait réel le
-- jour où l'une de ces fonctions passerait en SECURITY DEFINER, ou le jour où
-- une interface permettrait d'exécuter du SQL libre. La correction est peu
-- coûteuse et sans contrepartie, elle doit donc être faite — sans urgence.
--
-- MÉTHODE
--
-- La correction passe par ALTER FUNCTION, pas par une réécriture des
-- fonctions. C'est délibéré : recopier 22 corps de fonction, dont quatre
-- décident de droits d'accès, introduirait un risque d'erreur de transcription
-- bien supérieur au risque corrigé. ALTER FUNCTION ne touche qu'un paramètre
-- de configuration et laisse le corps intact.
--
-- VÉRIFICATION DE NON-RÉGRESSION FAITE EN AMONT
--
-- Fixer `search_path` casse une fonction qui s'appuyait sur la résolution
-- implicite d'un nom situé hors de `public`. Les 22 corps ont été relus sur ce
-- point précis :
--
--   - les seules références hors `public` sont `auth.uid()`, déjà qualifiées
--     par le schéma dans les quatre fonctions concernées. Un nom qualifié ne
--     dépend pas de `search_path` ;
--   - aucune n'appelle de fonction d'extension sans la qualifier. C'était le
--     vrai piège : sur Supabase, pgcrypto et consorts vivent dans le schéma
--     `extensions`, qui disparaîtrait du chemin ;
--   - aucune ne crée de table temporaire, donc placer `pg_temp` en dernier ne
--     gêne aucune.
--
-- `pg_temp` est listé explicitement et en dernier. Mentionné, il n'est plus
-- recherché en priorité : c'est précisément ce qui ferme le détournement.
-- L'omettre entièrement fonctionnerait aussi, mais le mentionner en dernier
-- reste compatible avec une fonction qui créerait un jour un objet temporaire.
--
-- RETOUR EN ARRIÈRE
--
--   alter function public.<nom>(<signature>) reset search_path;
--
-- NON APPLIQUÉE.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Inventaire, à exécuter avant et après pour comparer
--
--   select p.oid::regprocedure as fonction,
--          p.prosecdef as security_definer,
--          p.proconfig
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.prokind = 'f'
--      and not exists (
--            select 1 from unnest(coalesce(p.proconfig, '{}')) as c(opt)
--             where c.opt like 'search_path=%')
--    order by 1;
--
-- Attendu avant : 22 lignes, toutes avec security_definer à faux.
-- Attendu après : aucune ligne.
--
-- Les 22 fonctions relevées dans les migrations, par ordre de première
-- apparition :
--
--   profile_can_access_state          20260314_rbac_activation
--   can_read_articles                 20260318_articles
--   next_devis_number                 20260320_devis_numbering
--   rbac_grant                        20260322_rbac_roles_permissions
--   can_manage_all_clients            20260323_rls_commercial_scoping
--   can_access_client_row             20260323_rls_commercial_scoping   (RLS)
--   can_access_devis_row              20260323_rls_commercial_scoping   (RLS)
--   is_commercial_team_lead           20260323_rls_commercial_scoping
--   state_key_to_module               20260916_thermal_studies
--   can_access_opportunity_row        20260918_prospect_dispatch        (RLS)
--   can_access_appointment_row        20260918_prospect_dispatch        (RLS)
--   is_prospect_dispatcher            20260918_prospect_dispatch
--   is_admin_role                     20260927_rename_admin_second_superadmin
--   can_manage_articles               20260927_rename_admin_second_superadmin
--   can_manage_devis                  20260927_rename_admin_second_superadmin
--   can_view_all_org_clients          20260927_rename_admin_second_superadmin
--   next_client_number                20261003_client_numbers
--   assign_client_number              20261003_client_numbers
--   next_internal_request_number      20261003_internal_requests
--   assign_internal_request_number    20261003_internal_requests
--   next_prospect_number              20261004_prospect_numbers_all
--   assign_prospect_number            20261004_prospect_numbers_all
-- ---------------------------------------------------------------------------

do $$
declare
  fonction record;
  corrigees integer := 0;
begin
  -- Parcours par signature (`oid::regprocedure`) et non par nom : deux
  -- fonctions peuvent partager un nom avec des paramètres différents, et
  -- ALTER FUNCTION exige la signature exacte. La laisser calculer par
  -- PostgreSQL évite de la recopier à la main, donc de se tromper.
  for fonction in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       -- Les fonctions appartenant à une extension sont laissées de côté.
       -- Vérifié sur une base réelle : si `pgcrypto` est posé dans `public`
       -- plutôt que dans `extensions`, il y dépose une quarantaine de
       -- fonctions. Les modifier reviendrait à toucher des objets gérés par
       -- l'extension, que sa prochaine mise à jour réécrirait de toute façon.
       and not exists (
             select 1
               from pg_depend d
              where d.objid = p.oid
                and d.classid = 'pg_proc'::regclass
                and d.deptype = 'e')
       and not exists (
             select 1
               from unnest(coalesce(p.proconfig, '{}'::text[])) as c(opt)
              where c.opt like 'search_path=%')
     order by 1
  loop
    execute format(
      'alter function %s set search_path = pg_catalog, public, pg_temp',
      fonction.signature
    );
    corrigees := corrigees + 1;
  end loop;

  raise notice 'search_path fixé sur % fonction(s) du schéma public', corrigees;
end
$$;

-- ---------------------------------------------------------------------------
-- Contrôle immédiat
--
-- Échoue bruyamment si une fonction a échappé à la boucle. Mieux vaut une
-- migration qui refuse de se terminer qu'une migration qui se croit complète.
-- ---------------------------------------------------------------------------

do $$
declare
  restantes integer;
begin
  select count(*) into restantes
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and not exists (
           select 1
             from pg_depend d
            where d.objid = p.oid
              and d.classid = 'pg_proc'::regclass
              and d.deptype = 'e')
     and not exists (
           select 1
             from unnest(coalesce(p.proconfig, '{}'::text[])) as c(opt)
            where c.opt like 'search_path=%');

  if restantes > 0 then
    raise exception 'SEARCH_PATH_INCOMPLET : % fonction(s) sans search_path', restantes;
  end if;
end
$$;
