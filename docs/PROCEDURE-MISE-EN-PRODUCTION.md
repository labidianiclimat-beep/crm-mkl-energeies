# Mise en production du module marketing — procédure courte

Document d'exécution. Le détail du raisonnement est dans
`PLAN-DEPLOIEMENT-MARKETING.md` ; ici, seulement ce qu'il faut faire, dans
l'ordre, et comment savoir que c'est réussi.

Rien dans ce document n'a été exécuté.

---

## 0. Le plan Vercel, avant tout le reste

`vercel.json` déclare quatre tâches planifiées. **Le plan Hobby en autorise
deux, et en déclarer davantage fait échouer le déploiement.** Le passage au
plan Pro est donc à faire en premier, avant d'appliquer la moindre migration.

Dans Vercel, *Settings → Billing*, vérifier que le plan affiché est bien
**Pro** avant de continuer. Sans cela, vous appliqueriez les migrations puis
vous verriez le déploiement du code refusé, ce qui laisserait la base à jour
et le code en retard — la situation décrite au point 4, qui n'est pas
dangereuse mais laisse la faille OAuth ouverte plus longtemps que nécessaire.

> Ce qui tourne aujourd'hui : rien. La version en production de `vercel.json`
> ne déclare aucune tâche planifiée. Ce déploiement est donc le premier à en
> activer, y compris les rappels d'agenda et les alertes du parc.

---

## 1. La sauvegarde à vérifier avant d'intervenir

Avant la première migration, trois points, dans cet ordre.

**La sauvegarde existe et elle est récente.** Dans Supabase, *Database →
Backups*. Relever la date et l'heure de la dernière sauvegarde réussie. Si
elle a plus de vingt-quatre heures, en déclencher une et attendre qu'elle
aboutisse avant de continuer.

**La sauvegarde est restaurable.** Une sauvegarde jamais restaurée n'est pas
une sauvegarde vérifiée. Sur le plan Supabase actuel, la restauration se fait
sur une nouvelle instance : il n'est donc pas nécessaire de la tester ici, mais
il faut avoir noté le point de restauration avant de commencer.

**Le point de retour du code est noté.** Dans Vercel, relever l'identifiant du
déploiement actuellement en production. C'est vers lui que le retour arrière
pointera.

> À noter : la restauration d'une sauvegarde Supabase ramène **toute** la base
> à son état antérieur, y compris les fiches commerciales créées depuis. Ce
> n'est donc pas le retour arrière de premier recours. Les retours arrière par
> migration, au point 5, sont à préférer.

---

## 2. L'ordre exact des migrations

Une à la fois. Le contrôle du point 3 se fait après chacune, avant de passer à
la suivante.

| # | Fichier | Pourquoi à cette place |
|---|---|---|
| 1 | `20261102_google_oauth_states.sql` | N'ajoute qu'une table neuve. Ne dépend que de `auth.users`, déjà présent |
| 2 | `20261102_web_lead_ingest.sql` | N'ajoute que des tables et des fonctions neuves |
| 3 | `20261105_web_lead_idempotence.sql` | Exige les tables de la deuxième |
| 4 | `20261102_lead_attribution.sql` | **La seule à toucher des tables en service.** Passe en dernier des quatre, quand le reste est vérifié |
| 5 | `20261105_search_path_hardening.sql` | Ne modifie qu'un réglage sur des fonctions existantes. Annulable d'une instruction |

L'ordre ne suit pas les noms de fichiers. Il suit les dépendances et le risque.

Les contrôles préalables que vous avez déjà exécutés confirment que ce chemin
est libre : `fiches_web = 0`, `rdv_web = 0`, aucun doublon, `table_presente = 0`,
`tables_module = 0`, `colonnes_origine = 0`. Aucune donnée historique ne peut
donc entrer en conflit avec les index d'unicité, et aucune application
partielle n'est en cours.

---

## 3. Les vérifications après chaque migration

### Après la 1 — jetons OAuth

```sql
select count(*) as index_attendu_3 from pg_indexes
 where schemaname = 'public' and tablename = 'google_oauth_states';

select count(*) as check_attendu_4 from pg_constraint
 where conrelid = 'public.google_oauth_states'::regclass and contype = 'c';

select tgname, tgenabled from pg_trigger
 where tgrelid = 'public.google_oauth_states'::regclass and not tgisinternal;

select grantee, string_agg(privilege_type, ', ' order by privilege_type)
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'google_oauth_states'
 group by grantee;
```

Attendu : 3 index, 4 contraintes `check`, un déclencheur avec `tgenabled = 'O'`,
et `service_role` seul, avec `INSERT, SELECT, UPDATE`. Ni `anon`, ni
`authenticated` ne doivent apparaître.

### Après la 2 — file des demandes

```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and proname in ('enqueue_web_lead', 'reserve_web_leads', 'settle_web_lead',
                   'requeue_web_lead', 'purge_web_lead_payloads')
 order by 1;

-- Une seule version de la purge, sinon son appel devient ambigu.
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'purge_web_lead_payloads';
```

Attendu : les cinq fonctions, et la purge en un seul exemplaire.

### Après la 3 — index anti-doublons

```sql
select indexname, indexdef from pg_indexes
 where schemaname = 'public'
   and indexname in ('commercial_opportunities_web_lead_idx',
                     'commercial_appointments_web_lead_idx',
                     'lead_attribution_submission_idx',
                     'web_lead_submissions_submission_idx')
 order by 1;
```

Attendu : quatre lignes, toutes portant `UNIQUE`. Si la création échoue avec le
code `23505`, c'est qu'un doublon existe : il se résout à la main, jamais par
suppression automatique, une fiche prospect étant une donnée commerciale.

### Après la 4 — origines, la plus sensible

C'est la seule migration qui pose des garde-fous sur une table en service. Le
contrôle structurel ne suffit pas : il faut vérifier que la saisie quotidienne
passe encore.

```sql
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'commercial_opportunities'
   and column_name in ('origin_channel', 'origin_category', 'origin_subtype', 'origin_set_at')
 order by 1;

-- Aucune fiche existante ne doit avoir été touchée.
select count(*) as fiches_avec_origine from public.commercial_opportunities
 where origin_category is not null;
```

Attendu : les quatre colonnes, et `fiches_avec_origine = 0`. La migration
n'écrit dans aucune ligne existante : elle ajoute des colonnes vides.

Puis, **dans le CRM et non en SQL**, créer un prospect de prospection terrain
et l'enregistrer. Il doit s'enregistrer sans erreur.

> C'est le contrôle le plus important de toute la procédure. Une version
> antérieure du garde-fou refusait le libellé « Prospection », et toute
> création de prospect terrain aurait échoué. Le défaut est corrigé et vérifié
> sur PostgreSQL réel, sur les six libellés de vos équipes, mais il se
> constate en trente secondes dans l'interface.

### Après la 5 — durcissement

```sql
-- Doit renvoyer 0. Les fonctions des extensions sont exclues : elles ne
-- doivent pas être modifiées, et la migration les laisse de côté.
select count(*) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f'
   and not exists (select 1 from pg_depend d
                    where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e')
   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as c(opt)
                    where c.opt like 'search_path=%');
```

Attendu : `0`. Puis, dans le CRM, ouvrir la liste des clients et celle des
articles : ces écrans passent par les fonctions dont le réglage vient de
changer.

---

## 4. Le déploiement lié à la correction OAuth

**La migration seule ne corrige rien.** La table `google_oauth_states` ne fait
rien tant que le code ne s'en sert pas, et la vulnérabilité est dans le code
actuellement en production : le `state` renvoyé par Google y est un simple
`base64` contenant l'identifiant d'utilisateur et celui de l'organisation, sans
signature. Qui sait le fabriquer rattache un compte Google à l'agenda de
n'importe quel utilisateur. **La fenêtre d'exposition se ferme au déploiement
du code, pas à la migration.**

L'ordre est donc contraint dans les deux sens :

- Déployer le code **avant** la migration : la table n'existe pas, et
  `/api/google/calendar/connect` renvoie 503. La connexion Google est
  indisponible, mais rien n'est vulnérable.
- Déployer le code **après** la migration : la table existe sans utilisateur,
  ce qui est inoffensif, et la vulnérabilité reste ouverte jusqu'au
  déploiement.

Le second est le bon, et le délai entre les deux doit être court.

Ce qui change dans le code, déjà en place localement :

| Fichier | Ce qu'il fait désormais |
|---|---|
| `app/lib/oauth-state.js` | Jeton aléatoire sans identité ; chemins de retour en liste blanche |
| `app/api/google/calendar/connect/route.js` | Enregistre le jeton en base, pose le cookie, renvoie 503 si l'enregistrement échoue |
| `app/api/google/calendar/callback/route.js` | Contrôle le cookie **avant** la consommation atomique ; identité lue en base, jamais dans l'URL ; vérifie les habilitations accordées |

Aucune variable d'environnement à ajouter **pour l'OAuth**. La clé de
chiffrement des jetons Google dérive de `CRM_SESSION_SECRET`, ou à défaut de
`ACTIVATION_PIN_PEPPER`, déjà en place.

Deux variables restent à poser sur Vercel avant le déploiement, pour le reste
du module : `CRON_SECRET`, sans quoi les cinq tâches planifiées répondent 401,
et `WEB_LEAD_KEYRING`, sans quoi `/api/web-leads` refuse tout appel. Leur
absence est sans danger — elle bloque, elle n'ouvre rien — mais les tâches
planifiées tourneraient dans le vide.

**Vérification après déploiement.** Dans le CRM, *Réglages → Agenda Google*,
lancer une connexion et l'aller jusqu'au bout. Elle doit aboutir. Puis
rafraîchir la page de retour de Google : elle doit échouer, le jeton étant à
usage unique. Enfin :

```sql
-- Un seul jeton, consommé une seule fois.
select purpose, consumed_at is not null as consomme, expires_at > now() as valide
  from public.google_oauth_states order by created_at desc limit 5;
```

La synchronisation reste coupée à ce stade : ce contrôle ne porte que sur la
connexion.

---

## 5. La procédure de retour arrière

Du moins intrusif au plus. Chaque migration s'annule indépendamment, dans
l'ordre inverse de l'application.

| Migration | Retour arrière |
|---|---|
| 5 — durcissement | `alter function <signature> reset search_path;` pour les fonctions concernées. Ne touche pas aux corps |
| 4 — origines | `drop trigger commercial_opportunities_origin_guard` et `commercial_opportunities_source_guard` **sur `public.commercial_opportunities`**, puis `drop table public.lead_attribution, public.lead_origin_history cascade;`, puis `alter table public.commercial_opportunities drop column` des quatre colonnes `origin_*` |
| 3 — index | `drop index` des quatre index, `drop function public.purge_web_lead_payloads(integer);` |
| 2 — file | `drop table public.web_lead_events, public.web_lead_submissions cascade;` et `drop function` des quatre fonctions de file |
| 1 — jetons OAuth | `drop table public.google_oauth_states cascade;` |

Quatre remarques qui comptent.

**Les deux garde-fous de la migration 4 se suppriment séparément.** Elle pose
quatre déclencheurs : deux sur ses propres tables, que le `drop table ...
cascade` emporte, et deux sur `commercial_opportunities`, qui survivraient à
la suppression des tables. Ce sont ceux-là qu'il faut nommer explicitement,
faute de quoi la saisie resterait contrainte par un module désinstallé.

**Les trois migrations créant des index le font sans `concurrently`.** Elles
sont donc transactionnelles : une migration interrompue ne laisse rien
derrière elle. En contrepartie la table est verrouillée en écriture pendant la
création, de l'ordre de quelques secondes sur vos volumes. Vérifié sur
PostgreSQL réel, y compris en appliquant une migration entière dans une
transaction annulée.

**Le retour arrière du code est indépendant de celui de la base.** Dans
Vercel, *Deployments*, puis *Promote to Production* sur le déploiement noté au
point 1. Si vous annulez le code OAuth sans annuler la migration, la table
reste en place sans utilisateur : c'est sans conséquence, mais la
vulnérabilité se rouvre.

**Aucun retour arrière ne supprime de donnée commerciale.** Les `drop table`
ne portent que sur les deux tables ajoutées par le module. Les prospects,
clients, devis et rendez-vous ne sont touchés par aucune des cinq migrations :
la quatrième ajoute des colonnes vides, sans écrire dans les lignes
existantes.

---

## Ce qui reste coupé après cette procédure

La synchronisation réelle n'est pas activée. Le raccordement des formulaires du
site et la mise en place du traitement par minute font l'objet des paliers 5 et
6 de `PLAN-DEPLOIEMENT-MARKETING.md`, et attendent votre accord séparé.
