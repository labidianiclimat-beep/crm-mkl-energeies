# Base PostgreSQL de test

Les migrations n'étaient jusqu'ici validées que par relecture et par des
contrôles portant sur le texte des fichiers. Rien ne prouvait qu'elles
s'exécutent, ni que les contraintes tiennent sous des traitements simultanés.
Ces quatre scripts les jouent sur une véritable base PostgreSQL, jetable et
locale.

La base Supabase de production n'est jamais sollicitée. Tout vit dans `/tmp`
et disparaît au redémarrage de la machine.

## Mise en place

```bash
npm run pg:install        # ou : bash scripts/pg-test/install.sh
npm run test:pg
```

La machine de développement n'a ni Docker, ni Homebrew, ni PostgreSQL, ni npm.
Les binaires sont donc récupérés depuis le registre npm, qui est joignable :
le paquet `@embedded-postgres/<plateforme>` contient un PostgreSQL complet, et
son archive est en gzip, que `tar` sait lire sans outil supplémentaire. Le
client est `postgres`, choisi parce qu'il n'a aucune dépendance et s'extrait à
la main. Ni l'un ni l'autre n'est ajouté aux dépendances du projet : ce sont
des outils d'essai, pas des dépendances de production.

Arrêt de la base :

```bash
/tmp/pgtest/pg17/native/bin/pg_ctl -D /tmp/pgtest/data17 stop
```

## Les sept scripts

| Script | Objet |
|---|---|
| `01-migrations.mjs` | Joue les 66 migrations, puis vérifie tables, index uniques et fonctions |
| `02-garanties.mjs` | Unicité, concurrence réelle, reprise après échec, conservation, retour arrière |
| `03-search-path.mjs` | Mesure la dette, démontre le détournement, applique la correction, vérifie la non-régression |
| `04-oauth.mjs` | Usage unique des jetons OAuth, expiration, deux retours simultanés, purge |
| `05-origines-et-droits.mjs` | Libellés des équipes acceptés, codes internes refusés, droits effectifs, doublons |
| `06-retour-arriere.mjs` | Joue littéralement le tableau de retour arrière de la procédure de production |
| `07-postgrest-oauth.mjs` | Consommation OAuth à travers un vrai PostgREST : filtre, rejeu, rôles, purge |

`07` demande une étape d'installation supplémentaire, `bash
scripts/pg-test/install-postgrest.sh`. Les six premiers scripts parlent à
PostgreSQL directement, alors que le CRM passe par PostgREST : la syntaxe des
filtres, la traduction des erreurs de déclencheur en codes HTTP et le
cloisonnement des rôles ne se vérifient qu'à ce niveau. Aucun projet Supabase
n'est nécessaire, PostgREST étant un binaire unique posé devant la base locale.

`01` et `02` partagent une base ; les suivantes reconstruisent la leur via
`preparerBase`. Ce n'est pas un détail d'organisation : `02` supprime des index
pour prouver qu'ils sont annulables, donc une suite qui hériterait de sa base
verrait un module incomplet et signalerait des défauts inexistants. L'erreur a
été faite une fois.

`supabase-shim.sql` reconstitue ce que Supabase fournit et que les migrations
supposent présent : les rôles, le schéma `auth` avec `auth.uid()`, le schéma
`storage`, `pgcrypto` dans `extensions`, et les privilèges par défaut sur
`public`. Deux comportements y sont reproduits volontairement, parce que sans
eux le test ne prouverait rien :

- `service_role` est créé avec `bypassrls`, comme sur Supabase. C'est ce qui
  rend RLS inopérant sur les routes du CRM, et c'est pourquoi les garanties
  reposent sur des déclencheurs et des contraintes, que `service_role` ne
  contourne pas.
- Les privilèges par défaut accordent tout à `anon`, `authenticated` et
  `service_role` sur `public`. Sans eux, les migrations révoqueraient un droit
  qui n'a jamais été accordé, et leurs `revoke` passeraient sans rien prouver.

Ce fichier ne doit jamais être appliqué à une base de production.

## Deux particularités à connaître

**L'ordre des fichiers n'est pas l'ordre des dépendances.** Deux migrations
référencent une table créée par une migration qui trie après elles :
`20260316_service_role_grants` avant `20260317_clients`, et
`20261003_internal_request_assignees` avant `20261003_internal_requests`. Le
lanceur fait donc plusieurs passes et rejoue les échecs, ce qui résout ces
inversions sans toucher à un historique déjà appliqué en production.

**Trois migrations de données du catalogue échouent volontairement** sur une
base vide : elles complètent des articles existants et refusent de s'appliquer
s'ils sont absents. Le lanceur les distingue des migrations de structure et ne
les compte pas comme des anomalies.

## Les essais de concurrence sont de vrais essais

Deux connexions distinctes sont ouvertes, et une transaction est maintenue
ouverte pendant que l'autre travaille. La seconde se heurte réellement au
verrou et attend. Un enchaînement séquentiel passerait sans rien démontrer.
