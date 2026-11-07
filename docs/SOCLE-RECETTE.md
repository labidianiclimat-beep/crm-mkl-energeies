# Installer le socle du CRM sur MKL CRM RECETTE

But : disposer d'une base Supabase structurellement comparable à la
production, pour y éprouver les cinq migrations marketing avant de les
appliquer en production.

| | Identifiant | Région | PostgreSQL |
|---|---|---|---|
| Production, « MKL Energies CRM » | `rzkwmwtjnwnmmcexwoov` | eu-north-1 | 17.6 |
| Recette, « MKL CRM RECETTE » | `xqbjfytrssslnsxxdrou` | eu-west-1 | 17.11 |

## Procédure

```sh
sh scripts/recette/enregistrer-acces-recette.sh      # une seule fois
sh scripts/recette/appliquer-socle.sh --verifier
sh scripts/recette/appliquer-socle.sh --lot 01       # puis 02, 03, 04, 05
sh scripts/recette/appliquer-socle.sh --controles
```

Le mot de passe est saisi dans le terminal, jamais dans une conversation. Il
part dans `~/.mkl-secrets/recette-db.env`, en 600, hors du dépôt.

## Chemin de connexion

L'hôte direct `db.<ref>.supabase.co` ne publie qu'une adresse IPv6 et reste
injoignable depuis un Mac sans IPv6. Le pooler régional répond en IPv4, en
mode session sur le port 5432, avec l'utilisateur `postgres.<ref>`. Les deux
terminaisons `aws-0-eu-west-1` et `aws-1-eu-west-1` existent selon l'âge du
projet : le script d'enregistrement essaie les deux et retient celle qui
répond.

## Le socle

Soixante migrations, en cinq lots d'environ 55 Ko dont les coupures tombent
entre fichiers. Le compte se referme sur les 74 migrations du dépôt :

| | Nombre | Raison |
|---|---|---|
| dans les lots | 60 | le socle |
| brochures vidées | 3 | données seules, aucun apport structurel |
| écartées | 6 | données catalogue, refusent de s'appliquer à une base vide |
| réservées | 5 | le module marketing, objet du test |

Les quatre migrations de brochures Aquarea pèsent 2,3 Mo des 2,6 Mo du socle,
et ce poids est entièrement du PDF encodé en base64. Leur seul apport
structurel est la table `_aquarea_brochure_part` : la première la conserve,
les trois autres sont vidées. La recette reçoit donc la table, vide. C'est cet
allègement qui ramène le socle à 276 Ko, applicable sans découpage acrobatique.

## Le déclencheur qui n'est pas dans le dépôt

La production et la recette portent toutes deux un déclencheur d'événement
`ensure_rls`, actif sur `ddl_command_end`, qui appelle `public.rls_auto_enable()`
et active RLS sur chaque table créée dans `public`. Ni la fonction ni le
déclencheur ne figurent dans les migrations du dépôt.

C'est l'explication de la « dérive RLS » constatée entre le dépôt et la
production : il n'y a pas de divergence d'intention, le mécanisme vit
seulement dans la base. Conséquence utile pour la recette, les tables y
recevront RLS automatiquement, là où le miroir PostgreSQL local laisse quatre
tables sans RLS faute de ce déclencheur.

À noter, `rls_auto_enable` est `security definer` avec
`search_path = pg_catalog`, sans `pg_temp`. PostgreSQL recherche alors
`pg_temp` en premier de façon implicite, ce qui laisse théoriquement place à
un masquage de `format()` par une fonction temporaire. La migration
`search_path_hardening` ne la corrige pas : elle ignore les fonctions qui
déclarent déjà un `search_path`.

## Divergences entre le dépôt et la production

Les deux côtés comptent 78 tables publiques, mais ce n'est **pas** le même
ensemble : 77 tables communes, et une de chaque côté.

| Objet | Côté | Constat |
|---|---|---|
| `crm_files` | production seule | créée hors migration, avec ses 3 politiques aux noms saisis à la main et son index primaire. Aucune référence dans le dépôt. |
| `pv_simulations` | dépôt seul | `20261003_pv_simulations.sql` n'a jamais été appliquée en production. Aucune référence dans le code. |
| `current_organization_id`, `current_user_role`, `rls_auto_enable` | production seule | `security definer`, absentes du dépôt. |
| 6 politiques sur `crm_state` et `profiles` | production seule | noms saisis à la main, doublons fonctionnels des politiques du dépôt. |
| `crm_state_organization_idx`, `profiles_organization_idx` | production seule | index créés hors migration. |

Aucune de ces divergences ne concerne les cinq migrations marketing : elles ne
citent ni `crm_files`, ni `pv_simulations`, ni aucune des trois fonctions. La
répétition sur la recette reste donc représentative.

## Contrôles

`scripts/recette/controles.sql`, en lecture seule, compare dix mesures aux
relevés réels de la production. Les attendus ne sont pas déduits : le socle
vient d'une application réelle sur PostgreSQL 17, et les apports des cinq
migrations sont décomptés dans leurs fichiers, soit 5 tables, 25 index dont 4
uniques, 7 déclencheurs et aucune politique.
