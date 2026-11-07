# Séparation des environnements Vercel et Supabase

Production vise le projet Supabase **MKL Energies CRM**, Preview vise
**MKL CRM RECETTE**. Ce document décrit l'outillage qui réalise cette
séparation, ce qu'il garantit, et les pièges rencontrés en la construisant.

Appliqué le 7 novembre 2026.

## Pourquoi

Vercel applique une variable aux trois environnements si l'on ne restreint
pas sa portée. Le contrôle de build `scripts/verifier-config-supabase.mjs`
exige par ailleurs les variables publiques partout, sinon la compilation
échoue. La pente naturelle est donc de les renseigner pour tous les
environnements, ce qui donne aux déploiements Preview les identifiants de la
production.

Dans notre cas, l'exposition était réelle mais étroite. Quinze des dix-sept
variables, dont `SUPABASE_SERVICE_ROLE_KEY`, étaient déjà limitées à
Production. Seules les deux variables publiques étaient partagées, ce qui
permettait à une prévisualisation de s'authentifier contre la production et
d'y lire ce que RLS autorise au rôle `authenticated`.

## Les trois scripts

Dans `scripts/env-split/`. Aucun ne contient de secret.

| Script | Rôle |
|---|---|
| `installer-clis.sh` | installe les CLI Vercel et Supabase sans gestionnaire de paquets |
| `separer-environnements.sh` | `--verifier`, `--sonde`, `--appliquer` |
| `verifier-separation.sh` | contrôle en lecture seule, utilisable avant comme après |

### Installation des outils

Ce Mac n'a ni npm, ni Homebrew, ni Docker. Les deux CLI sont donc récupérés
à leur source officielle et dépliés dans `~/.mkl-clis`, hors du dépôt Git :
le Vercel depuis le registre npm, le Supabase depuis ses binaires GitHub.

Depuis la version 65, `vercel` n'est plus qu'un lanceur : il cherche un
binaire natif dans `node_modules`, livré par un paquet distinct propre à la
plateforme (`@vercel/vc-native-darwin-arm64`). Sans npm pour résoudre cette
dépendance optionnelle, l'installateur la récupère et la dépose lui-même.

```
./scripts/env-split/installer-clis.sh
~/.mkl-clis/bin/vercel login      # si la session n'existe pas déjà
~/.mkl-clis/bin/supabase login    # indispensable pour lire les clés de recette
```

### Déroulé

```
./scripts/env-split/separer-environnements.sh --verifier   # n'écrit rien
./scripts/env-split/separer-environnements.sh --sonde      # prouve l'innocuité
./scripts/env-split/separer-environnements.sh --appliquer   # demande SEPARER
```

Le mode `--sonde` crée une variable jetable que rien ne lit, lui retire sa
portée Preview, vérifie que Production survit, puis la supprime. Il est
conçu pour être joué avant `--appliquer`, et ne demande pas Supabase.

## Résultat

| Variable | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Secret, inchangée | Config, vers RECETTE |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Secret, inchangée | Config, vers RECETTE |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret, inchangée | Secret, clé de RECETTE |
| `SUPABASE_PRODUCTION_REF` | Config | Config, même valeur |

## Pièges rencontrés

Ils sont consignés ici parce que chacun aurait pu causer un dégât, et qu'ils
ne sont pas devinables en lisant la documentation de Vercel.

**`vercel env remove <nom>` sans `--environment` retire la variable de tous
ses environnements**, Production comprise. Tous les appels du script portent
ce drapeau, et l'innocuité du retrait a été prouvée sur une variable jetable
avant de toucher aux vraies.

**`vercel remove <nom-de-projet>` supprime tous les déploiements du projet.**
Pour n'en viser qu'un, il faut son identifiant `dpl_…`. L'option `--safe`
épargne les déploiements qui portent un alias actif, ce qui en fait une
protection, mais aussi un moyen de croire qu'une suppression a eu lieu
alors qu'elle a été ignorée.

**Sur `vercel ls`, `-p` est l'abréviation dépréciée de `--policy`, pas de
`--project`.** Une enveloppe unique qui injecterait `-p` partout passerait
donc un identifiant de projet en guise de politique de rétention. D'où deux
enveloppes : `vercel env` accepte `--project <id>`, tandis que `vercel ls`
prend le projet en argument positionnel.

**Une variable de type Secret est illisible, même par `vercel env pull`**,
qui renvoie un court marqueur à la place de la valeur. C'est la raison
d'être du type Config pour les deux variables publiques : leur valeur part
de toute façon dans le paquet JavaScript, et la rendre relisible permet de
vérifier vers quel projet Preview pointe réellement.

**`vercel env remove` ne supprime pas fiablement un nom porté par plusieurs
entrées distinctes.** Constaté sur une variable de test : la suppression
s'est déclarée réussie et les deux entrées sont restées. Il faut retirer
environnement par environnement.

## Ce que la séparation ne fait pas

Les valeurs `NEXT_PUBLIC_*` sont gelées à la compilation, et un déploiement
Vercel est immuable. Un déploiement Preview construit avant la séparation
continue donc de viser la production, et aucun changement de variable ne le
corrigera. Il faut le supprimer ou le reconstruire.

Elle ne déclenche aucun déploiement non plus. Le déploiement de production en
service garde ses valeurs gravées et continue de fonctionner sans
redéploiement.

## Garde-fou côté code

`app/lib/supabase-environment.js` double la protection, au cas où la
configuration dériverait à nouveau. Deux règles, de sévérité volontairement
différente.

La première exige que la clé service désigne le même projet que l'URL. Elle
refuse hors production, et **signale sans bloquer en production** : les deux
valeurs y sont de type Secret, donc la condition ne peut pas être éprouvée
avant le déploiement, et un refus couperait le CRM entier pour une anomalie
dont on n'aurait pas la preuve préalable.

La seconde refuse, en Preview, de viser le projet déclaré dans
`SUPABASE_PRODUCTION_REF`. Elle est bloquante sans condition, et c'est elle
qui porte réellement la protection.

Le même verdict est évalué au build, où il fait échouer la compilation d'un
Preview visant la production, et à l'exécution, où il passe par le chemin
`serviceRoleConfigured()` déjà existant et renvoie 503.

`SUPABASE_PRODUCTION_REF` n'est pas un secret : elle figure dans l'URL
publique. Elle doit porter la même valeur dans les trois environnements, car
c'est la comparaison avec l'URL propre à chacun qui produit le verdict.
