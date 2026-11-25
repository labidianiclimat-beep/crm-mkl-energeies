# Sauvegarde logique de production, avant la première migration

Quatre commandes, dans l'ordre. Chacune est déjà éprouvée sur la base de test
du dépôt, et aucune n'écrit dans la production : `pg_dump` ouvre une
transaction de lecture et n'y touche rien.

Comptez une dizaine de minutes, dont l'essentiel en téléchargement.

---

## Pourquoi cette sauvegarde, puisque Supabase en fait une chaque nuit

Votre sauvegarde du 4 novembre à 04 h 11 UTC est réelle et utile. Elle a
pourtant deux limites que celle-ci comble.

Sa restauration passe par Supabase, et sur un nouveau projet : vous ne pouvez
ni la lire, ni en extraire une seule table, ni vérifier vous-même qu'elle
contient ce que vous croyez. Et elle date d'avant-hier matin : tout ce qui a
été saisi depuis n'y est pas.

Celle-ci est un fichier que vous détenez, dont le contenu est compté table par
table, et dont la restauration est prouvée parce qu'elle est effectuée. Les
deux se complètent : Supabase couvre la panne d'infrastructure, celle-ci
couvre la migration.

---

## Étape 1 — Installer pg_dump

```bash
bash scripts/backup/installer-outils-pg.sh
```

Votre Mac n'a ni Homebrew, ni Docker, ni PostgreSQL. Le script récupère
`pg_dump`, `pg_restore` et `psql` depuis Postgres.app, et n'en extrait que les
quatre exécutables utiles avec leurs cinq bibliothèques : **16 Mo installés**
dans `~/.mkl-pgtools`, au lieu des 227 Mo du dossier complet, qui embarque
aussi PostGIS et GDAL.

Rien n'est installé à l'échelle du système. Quand vous n'en aurez plus besoin :
`rm -rf ~/.mkl-pgtools`.

Résultat attendu : `pg_dump (PostgreSQL) 17.11 (Postgres.app)`.

> Deux autres sources ont été essayées et écartées : le paquet npm
> `embedded-postgres` et les archives Zonky sur Maven Central ne livrent que
> `initdb`, `pg_ctl` et `postgres`. Vérifié, `pg_dump` en est absent.

---

## Étape 2 — Enregistrer l'accès, sans qu'il passe par le terminal

```bash
bash scripts/backup/configurer-acces.sh
```

Le script demande trois choses : la référence de votre projet Supabase, l'hôte
du *Session pooler*, et le mot de passe de la base. Les deux premières se
trouvent dans Supabase, bouton **Connect** en haut du tableau de bord.

Le mot de passe est saisi **sans écho** et n'est jamais réaffiché. Il part dans
un fichier `.pgpass` en `0600`, que `pg_dump` lit tout seul. Il ne figure donc
jamais dans une ligne de commande — n'importe quel processus du Mac peut lire
celles des autres avec `ps` — ni dans l'historique de votre shell.

Tout est écrit dans `~/.mkl-secrets`, **hors de l'arborescence du dépôt**. Pas
seulement ignoré par Git : hors de sa portée, car une règle d'ignorance
s'annule d'un `git add -f`.

### Le point qui fait perdre une heure à qui l'ignore

Supabase expose trois modes de connexion, et un seul ne convient pas :

| Mode | Adresse | Pour pg_dump |
|---|---|---|
| Connexion directe | `db.<REF>.supabase.co:5432` | Recommandée, mais **IPv6 seul** sur le plan Pro, sauf option IPv4 |
| Session pooler | `aws-<N>-<REGION>.pooler.supabase.com:5432` | Convient, et en IPv4 |
| Transaction pooler | `...:6543` | **Ne convient pas** : pg_dump a besoin d'une session complète |

Votre Mac n'expose aucune adresse IPv6 globale sur ses interfaces, alors
qu'IPv6 sort pour HTTPS. C'est ambigu, donc le script d'étape 3 **essaie la
connexion directe puis se replie sur le Session pooler**, et vous dit laquelle
il a retenue. Vous n'avez pas à trancher.

---

## Étape 3 — Sauvegarder

```bash
bash scripts/backup/sauvegarder-production.sh
```

Le script choisit la connexion, compare la version de `pg_dump` à celle du
serveur, relève l'inventaire, puis sauvegarde. Trois fichiers sortent dans
`~/MKL-sauvegardes`, tous en `0600` :

| Fichier | Contenu |
|---|---|
| `public-<horodatage>.dump` | L'archive, au format personnalisé de PostgreSQL |
| `inventaire-<horodatage>.txt` | Le compte **exact** de lignes, table par table |
| `journal-<horodatage>.log` | La trace de l'exécution |

L'inventaire est ce qui rend la sauvegarde vérifiable. Les comptes sont exacts
et non les estimations de `pg_stat_user_tables`, qui dérivent entre deux
passages de l'autovacuum et ne prouveraient rien.

### Ce qui est dans la sauvegarde, et ce qui n'y est pas

Le schéma `public`, entièrement : structure et données. C'est le seul que les
cinq migrations touchent, donc le filet de sécurité utile.

Le schéma `auth` en est **volontairement exclu**. Il contient les empreintes
de mots de passe et les jetons de session, qu'il n'y a aucune raison de
déposer sur un portable alors qu'aucune migration ne les modifie. Si vous le
voulez malgré tout :

```bash
bash scripts/backup/sauvegarder-production.sh --avec-auth
```

Les schémas internes de Supabase — `extensions`, `realtime`, `vault`,
`pgbouncer` — ne sont pas inclus : ils ne se restaurent pas en dehors de
Supabase et relèvent de la sauvegarde quotidienne du fournisseur.

Les propriétaires et les droits sont **conservés** dans l'archive, pour qu'une
restauration vers Supabase soit fidèle. C'est la restauration locale de
l'étape 4 qui les ignore, pas la sauvegarde qui les perd.

---

## Étape 4 — Vérifier qu'elle est exploitable

```bash
node scripts/backup/verifier-sauvegarde.mjs ~/MKL-sauvegardes/public-<horodatage>.dump
```

C'est l'étape qui transforme un fichier en sauvegarde. Elle restaure l'archive
pour de vrai, dans la base PostgreSQL de test du dépôt, et ne touche pas à la
production — seule l'archive est lue.

Cinq contrôles :

1. **L'archive est lisible et complète.** `pg_restore --list` en sort le
   sommaire : une archive tronquée échoue ici.
2. **La restauration aboutit** sur une base neuve, préparée avec les rôles que
   Supabase suppose — sans eux, chaque `grant` échouerait et gonflerait le
   compte d'erreurs sans raison réelle.
3. **Les comptes correspondent**, table par table, à l'inventaire relevé sur
   la production au moment de la sauvegarde.
4. **Les cinq tables que les migrations vont toucher** sont présentes, avec
   leur nombre de lignes.
5. **Le contenu se relit**, et les textes accentués sont intacts. Ce dernier
   point compte : un aller-retour mal encodé ne perd aucune ligne, il remplace
   « é » par « Ã© ». Les comptes resteraient justes et la corruption passerait
   inaperçue.

Résultat attendu : `13/13 vérifications réussies`, ou davantage selon le
nombre de tables.

### Si vous voulez voir la chaîne tourner avant de viser la production

```bash
node scripts/backup/repetition.mjs
```

Même outillage, mêmes options de `pg_dump`, même script de vérification, mais
sur la base de test. Les options ne sont pas recopiées : elles sont relues
dans le script de production, pour que la répétition ne puisse pas diverger de
ce qu'elle répète. Résultat attendu : `9/9`.

C'est cette répétition qui a déjà révélé trois défauts de mon propre
outillage, dont une extraction d'options qui renvoyait vide et faisait sortir
la sauvegarde en texte brut au lieu du format personnalisé.

---

## Après la sauvegarde

Rangez l'archive ailleurs que sur le seul disque du Mac — un disque externe ou
un espace chiffré. Une sauvegarde qui vit au même endroit que la machine
qu'elle protège ne protège que d'une partie des accidents.

Notez l'horodatage du fichier : c'est votre point de retour, et il est plus
récent que celui de Supabase.

Puis dites-moi que c'est fait, et nous passons à
`20261102_google_oauth_states.sql`, seule, suivie de ses quatre contrôles.
