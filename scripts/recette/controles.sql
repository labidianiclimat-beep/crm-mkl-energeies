-- Contrôles de validation de MKL CRM RECETTE.
--
-- Strictement en lecture seule. À exécuter sur la recette après le socle,
-- puis après chacune des cinq migrations marketing.
--
-- Les valeurs attendues ne sont pas inventées : elles viennent d'un relevé
-- en lecture seule de la production du 7 novembre 2026, et du socle éprouvé
-- sur PostgreSQL 17 local.
--
-- La colonne `attendu_socle` décrit l'état juste après le socle, avant toute
-- migration marketing. La colonne `attendu_apres_cinq` décrit l'état visé
-- une fois les cinq appliquées.

with mesures as (
  select
    (select count(*) from pg_tables where schemaname = 'public') as tables,
    (select count(*) from pg_tables where schemaname = 'public' and rowsecurity) as tables_rls,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f') as fonctions,
    (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal and c.relnamespace = 'public'::regnamespace) as declencheurs,
    (select count(*) from pg_policies where schemaname = 'public') as politiques,
    (select count(*) from pg_class
      where relkind = 'i' and relnamespace = 'public'::regnamespace) as index,
    (select count(*) from pg_tables where schemaname = 'public'
       and tablename in ('lead_attribution', 'lead_origin_history', 'google_oauth_states',
                         'web_lead_submissions', 'web_lead_events')) as tables_module,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) as c(opt)
                         where c.opt like 'search_path=%')) as sans_search_path,
    -- Les quatre index UNIQUES que les migrations marketing posent. Noms
    -- relevés dans les fichiers, et non supposés : seuls ces quatre-là sont
    -- déclarés `create unique index`, et ce sont eux qui interdisent
    -- réellement les doublons.
    (select count(*) from pg_indexes where schemaname = 'public'
       and indexname in ('commercial_appointments_web_lead_idx',
                         'commercial_opportunities_web_lead_idx',
                         'lead_attribution_submission_idx',
                         'web_lead_submissions_submission_idx')) as index_antidoublons,
    -- Le socle ne doit pas avoir réveillé un déclencheur sur une table
    -- étrangère au CRM, ni laissé une table sans RLS.
    (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) as tables_sans_rls
  from (select 1) as _
)
select *
  from (
    values
      -- Attendus mesurés, non devinés. Le socle vient d'une application
      -- réelle sur PostgreSQL 17 local ; les apports des cinq migrations
      -- viennent du décompte de leurs instructions : 5 tables, 20 index
      -- explicites plus 5 clés primaires, 7 déclencheurs, aucune politique.
      ('tables publiques',                   (select tables from mesures),             78,  83),
      -- Le déclencheur d'événement `ensure_rls`, présent sur la recette comme
      -- en production, active RLS sur chaque table créée dans `public`. Les
      -- quatre tables que le dépôt n'équipe pas s'alignent donc d'elles-mêmes.
      ('tables avec RLS activée',            (select tables_rls from mesures),         78,  83),
      ('tables sans RLS',                    (select tables_sans_rls from mesures),     0,   0),
      ('fonctions publiques',                (select fonctions from mesures),          28,  46),
      ('déclencheurs sur public',            (select declencheurs from mesures),        5,  12),
      ('politiques RLS',                     (select politiques from mesures),        105, 105),
      ('index',                              (select index from mesures),             213, 238),
      ('tables du module marketing',         (select tables_module from mesures),       0,   5),
      ('index uniques anti-doublons',        (select index_antidoublons from mesures),  0,   4),
      -- 22 des deux côtés après le socle : le socle reproduit exactement
      -- l'état de la production. La cinquième migration les ramène à zéro.
      ('fonctions sans search_path',         (select sans_search_path from mesures),   22,   0)
  ) as controles(controle, obtenu, attendu_socle, attendu_apres_cinq)
 order by controle;
