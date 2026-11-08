#!/bin/sh
# Applique le socle du CRM sur MKL CRM RECETTE, lot par lot.
#
#   --verifier   contrôles de connexion et d état, aucune écriture
#   --lot NN     applique le seul lot NN, puis affiche l état
#   --controles  exécute scripts/recette/controles.sql, en lecture seule
#
# Aucun mode n écrit sur la production : l identifiant de production est
# refusé explicitement, et la cible est relue dans la base elle-même avant
# toute écriture. Il n existe pas de mode qui applique les cinq migrations
# marketing : elles sont volontairement laissées à une étape distincte.

set -eu

REF_RECETTE="xqbjfytrssslnsxxdrou"
REF_PRODUCTION="rzkwmwtjnwnmmcexwoov"
FICHIER="$HOME/.mkl-secrets/recette-db.env"
PSQL="$HOME/.mkl-pgtools/bin/psql"
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
LOTS="$RACINE/scripts/recette/lots"

# L en-tête de chaque lot liste ses migrations en « --   nom.sql », mais le
# corps des migrations contient lui aussi des commentaires indentés de la même
# façon. Il faut donc s arrêter à la première ligne vide, qui clôt l en-tête.
entete() { sed -n '1,/^$/p' "$1" | grep '^--   ' || true; }

oui()   { printf '\033[32m  ✓\033[0m %s\n' "$1"; }
non()   { printf '\033[31m  ✗\033[0m %s\n' "$1"; }
avert() { printf '\033[33m  !\033[0m %s\n' "$1"; }
titre() { printf '\n\033[1m%s\033[0m\n' "$1"; }

[ -x "$PSQL" ] || { non "psql absent de $PSQL"; exit 1; }
[ -r "$FICHIER" ] || {
  non "accès recette non enregistré"
  printf '  Lancez d abord : sh scripts/recette/enregistrer-acces-recette.sh\n\n'
  exit 1
}

# shellcheck disable=SC1090
. "$FICHIER"

[ "${MKL_RECETTE_REF:-}" = "$REF_RECETTE" ] || {
  non "le fichier d accès ne vise pas la recette"; exit 1; }
case "${MKL_RECETTE_HOTE:-}:${MKL_RECETTE_MDP:-}" in
  *"$REF_PRODUCTION"*) non "une trace de production figure dans l accès : arrêt"; exit 1 ;;
esac

URL="postgresql://postgres.$MKL_RECETTE_REF@$MKL_RECETTE_HOTE:5432/postgres?sslmode=require"

# `q` ne fait que lire ; `ecrire` applique un fichier en tout ou rien.
q()      { PGPASSWORD="$MKL_RECETTE_MDP" "$PSQL" "$URL" -tAc "$1"; }
ecrire() { PGPASSWORD="$MKL_RECETTE_MDP" "$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -f "$1"; }

# Dernier rempart, interrogé dans la base atteinte et non dans un fichier de
# configuration. Aucune fonction PostgreSQL ne révèle l identifiant du projet
# Supabase, et le pooler présente `current_user` comme « postgres » des deux
# côtés : il faut donc un critère portant sur le contenu.
#
# Le critère retenu est la table `crm_files`. Elle existe en production, où
# elle a été créée à la main depuis le tableau de bord, et **aucune migration
# du dépôt ne la crée** : elle ne peut donc jamais apparaître sur la recette,
# à aucune étape de l installation. C est une empreinte structurelle propre à
# la production, stable du premier lot au dernier.
#
# Le nombre d organisations ne convient pas : `organizations_seed` en insère
# une sur la recette dès le premier lot, et la production en compte également
# une. Ce critère bloquait donc la recette elle-même après `socle_01`.
#
# S y ajoute un critère de données : la production héberge des clients, la
# recette n en recevra aucun puisque nous n appliquons que de la structure.
garde_cible() {
  if [ "$(q "select count(*) from pg_tables
               where schemaname = 'public' and tablename = 'crm_files'")" != "0" ]; then
    non "la table crm_files est présente : empreinte de la PRODUCTION"
    printf '    Aucune migration du dépôt ne la crée. Arrêt immédiat, aucune écriture.\n\n'
    exit 1
  fi
  if [ "$(q "select count(*) from pg_tables
               where schemaname = 'public' and tablename = 'clients'")" = "1" ]; then
    clients="$(q "select count(*) from public.clients")"
    if [ "$clients" != "0" ]; then
      non "la base atteinte contient $clients client(s) : ce sont des données"
      printf '    métier, donc la PRODUCTION. Arrêt immédiat, aucune écriture.\n\n'
      exit 1
    fi
  fi
}

etat() {
  q "select
       (select count(*) from pg_tables  where schemaname = 'public') || ' tables, ' ||
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public') || ' fonctions, ' ||
       (select count(*) from pg_indexes where schemaname = 'public') || ' index, ' ||
       (select count(*) from pg_tables where schemaname = 'public'
          and rowsecurity) || ' avec RLS'"
}

MODE="${1:---verifier}"

case "$MODE" in
--verifier)
  titre "Contrôles avant application"
  garde_cible
  oui "connexion par $MKL_RECETTE_HOTE, projet $MKL_RECETTE_REF"
  oui "la base atteinte n est pas la production"
  printf '    état actuel : %s\n' "$(etat)"

  # Le déclencheur d événement qui active RLS sur chaque table créée. Sa
  # présence change le résultat attendu : sans lui, quatre tables du socle
  # resteraient sans RLS, comme sur le miroir local.
  if [ "$(q "select count(*) from pg_event_trigger where evtname = 'ensure_rls' and evtenabled <> 'D'")" = "1" ]; then
    oui "le déclencheur ensure_rls est actif : RLS sera posée sur chaque table"
  else
    avert "ensure_rls absent : attendez-vous à quatre tables sans RLS"
  fi

  titre "Lots disponibles"
  n=0
  for f in "$LOTS"/socle_*.sql; do
    [ -r "$f" ] || continue
    n=$((n + 1))
    printf '    %-10s %5s Ko   %s migration(s)\n' \
      "$(basename "$f" .sql)" \
      "$(( $(wc -c < "$f") / 1024 ))" \
      "$(entete "$f" | wc -l | tr -d ' ')"
  done
  [ "$n" -gt 0 ] || { non "aucun lot dans $LOTS, lancez decouper-socle.mjs"; exit 1; }
  printf '\n  Application d un lot : sh scripts/recette/appliquer-socle.sh --lot 01\n\n'
  ;;

--lot)
  NUMERO="${2:-}"
  [ -n "$NUMERO" ] || { non "numéro de lot manquant"; exit 1; }
  FICHIER_LOT="$LOTS/socle_$NUMERO.sql"
  [ -r "$FICHIER_LOT" ] || { non "lot introuvable : $FICHIER_LOT"; exit 1; }

  garde_cible
  titre "Lot socle_$NUMERO"
  printf '  migrations du lot :\n'
  entete "$FICHIER_LOT" | sed 's/^--   /    /'
  printf '\n  avant : %s\n' "$(etat)"

  if ecrire "$FICHIER_LOT"; then
    oui "appliqué"
  else
    non "ÉCHEC : le lot a été refusé, rien de ce lot n a été conservé"
    printf '  après : %s\n\n' "$(etat)"
    exit 1
  fi
  printf '  après : %s\n\n' "$(etat)"
  ;;

--controles)
  garde_cible
  titre "Contrôles de validation, en lecture seule"
  PGPASSWORD="$MKL_RECETTE_MDP" "$PSQL" "$URL" -f "$RACINE/scripts/recette/controles.sql"
  printf '\n'
  ;;

*)
  non "mode inconnu : $MODE"
  printf '  Modes : --verifier | --lot NN | --controles\n\n'
  exit 1
  ;;
esac
