#!/usr/bin/env bash
#
# Sauvegarde logique de Supabase Production, en lecture seule.
#
# pg_dump n'écrit rien dans la base : il ouvre une transaction de lecture et
# en sort un instantané cohérent. Aucune donnée de production n'est modifiée.
#
# Produit trois fichiers horodatés dans ~/MKL-sauvegardes :
#
#   public-<horodatage>.dump       l'archive, format personnalisé de PostgreSQL
#   inventaire-<horodatage>.txt    le compte exact de lignes par table
#   journal-<horodatage>.log       la trace de l'exécution
#
# L'inventaire est ce qui rend la sauvegarde vérifiable : après restauration
# locale, on compare ligne à ligne. Une archive dont on n'a jamais compté le
# contenu n'est pas une sauvegarde vérifiée.
#
#   bash scripts/backup/sauvegarder-production.sh
#   bash scripts/backup/sauvegarder-production.sh --avec-auth
#
set -euo pipefail

OUTILS="${PG_OUTILS_HOME:-$HOME/.mkl-pgtools}/bin"
DOSSIER="${MKL_SECRETS_HOME:-$HOME/.mkl-secrets}"
SORTIE="${MKL_SAUVEGARDES:-$HOME/MKL-sauvegardes}"
CONFIG="$DOSSIER/supabase-prod.conf"

AVEC_AUTH=0
[ "${1:-}" = "--avec-auth" ] && AVEC_AUTH=1

for prealable in "$OUTILS/pg_dump" "$OUTILS/psql"; do
  [ -x "$prealable" ] || { echo "Manquant : $prealable
Lancez d'abord : bash scripts/backup/installer-outils-pg.sh" >&2; exit 1; }
done
[ -f "$CONFIG" ] || { echo "Accès non configuré.
Lancez d'abord : bash scripts/backup/configurer-acces.sh" >&2; exit 1; }

# shellcheck disable=SC1090
set -a; . "$CONFIG"; set +a

# Le mot de passe n'est jamais passé en argument ni exporté en clair : seul le
# chemin du fichier l'est, et `ps` ne révèle donc rien d'exploitable.
export PGPASSFILE="$DOSSIER/pgpass-supabase"
export PGSSLMODE=require
export PGCONNECT_TIMEOUT=15

mkdir -p "$SORTIE"
chmod 700 "$SORTIE"
HORODATAGE="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$SORTIE/public-$HORODATAGE.dump"
INVENTAIRE="$SORTIE/inventaire-$HORODATAGE.txt"
JOURNAL="$SORTIE/journal-$HORODATAGE.log"

# ---------------------------------------------------------------------------
# Choix du mode de connexion
#
# Supabase recommande la connexion directe pour pg_dump, mais elle est en IPv6
# seul sur le plan Pro. Plutôt que de deviner si votre réseau sort en IPv6, on
# essaie, et on se replie sur le Session pooler en IPv4.
# ---------------------------------------------------------------------------

choisir() {
  for essai in "direct:$MKL_DIRECT_HOTE:$MKL_DIRECT_UTILISATEUR" \
               "pooler:$MKL_POOLER_HOTE:$MKL_POOLER_UTILISATEUR"; do
    IFS=':' read -r nom hote utilisateur <<< "$essai"
    if PGHOST="$hote" PGPORT="$MKL_PORT" PGUSER="$utilisateur" PGDATABASE="$MKL_BASE" \
       "$OUTILS/psql" -Atqc "select 1" >/dev/null 2>>"$JOURNAL"; then
      echo "$nom $hote $utilisateur"
      return 0
    fi
    echo "  $nom ($hote) injoignable, essai suivant" >&2
  done
  return 1
}

echo "Choix du mode de connexion"
if ! LIGNE="$(choisir)"; then
  echo "Aucun mode de connexion n'a répondu. Détail dans $JOURNAL" >&2
  echo "Vérifiez le mot de passe, puis que le port est bien 5432 et non 6543." >&2
  exit 1
fi
read -r MODE PGHOST PGUSER <<< "$LIGNE"
export PGHOST PGUSER
export PGPORT="$MKL_PORT" PGDATABASE="$MKL_BASE"
echo "  connexion retenue : $MODE ($PGHOST)"

VERSION_SERVEUR="$("$OUTILS/psql" -Atqc "show server_version")"
VERSION_OUTIL="$("$OUTILS/pg_dump" --version | awk '{print $NF}')"
echo "  serveur PostgreSQL $VERSION_SERVEUR, pg_dump $VERSION_OUTIL"

if [ "${VERSION_SERVEUR%%.*}" -gt "${VERSION_OUTIL%%.*}" ]; then
  echo "pg_dump est plus ancien que le serveur : la sauvegarde serait refusée." >&2
  echo "Relancez l'installation avec PG_OUTILS_VERSION=${VERSION_SERVEUR%%.*}.x" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Inventaire avant sauvegarde
#
# Comptes exacts, et non les estimations de `pg_stat_user_tables`, qui dérivent
# entre deux passages de l'autovacuum et ne prouveraient rien.
# ---------------------------------------------------------------------------

echo "Inventaire des lignes, en lecture seule"
"$OUTILS/psql" -Atq -F'|' -o "$INVENTAIRE" <<'SQL'
select table_schema || '.' || table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
                           false, true, '')))[1]::text::bigint
  from information_schema.tables
 where table_schema = 'public' and table_type = 'BASE TABLE'
 order by 1;
SQL
chmod 600 "$INVENTAIRE"
echo "  $(wc -l < "$INVENTAIRE" | tr -d ' ') tables recensées"

# ---------------------------------------------------------------------------
# La sauvegarde
#
# Portée : le schéma `public`. C'est le seul que les cinq migrations touchent,
# et c'est donc le filet de sécurité utile. Les schémas internes de Supabase
# (`extensions`, `realtime`, `vault`, `pgbouncer`…) ne se restaurent pas en
# dehors de Supabase et relèvent de la sauvegarde quotidienne du fournisseur.
#
# `auth` reste hors du lot par défaut : il contient les empreintes de mots de
# passe et les jetons de session, qu'il n'y a aucune raison de déposer sur un
# portable alors qu'aucune migration ne les modifie. `--avec-auth` l'ajoute si
# vous le voulez explicitement.
#
# Les propriétaires et les droits sont conservés dans l'archive, pour qu'une
# restauration vers Supabase soit fidèle. C'est à la restauration locale de
# les ignorer, pas à la sauvegarde de les perdre.
# ---------------------------------------------------------------------------

PORTEE=(--schema=public)
if [ "$AVEC_AUTH" = "1" ]; then
  PORTEE+=(--schema=auth)
  echo "Portée élargie : public et auth"
else
  echo "Portée : schéma public"
fi

echo "Sauvegarde en cours"
"$OUTILS/pg_dump" \
  "${PORTEE[@]}" \
  --format=custom \
  --compress=9 \
  --no-unlogged-table-data \
  --verbose \
  --file="$ARCHIVE" \
  2>>"$JOURNAL"

chmod 600 "$ARCHIVE" "$JOURNAL"

TAILLE="$(du -h "$ARCHIVE" | awk '{print $1}')"
OBJETS="$("$OUTILS/pg_restore" --list "$ARCHIVE" | grep -c "^[0-9]" || true)"

echo
echo "Sauvegarde terminée"
echo "  archive     $ARCHIVE  ($TAILLE, $OBJETS objets)"
echo "  inventaire  $INVENTAIRE"
echo "  journal     $JOURNAL"
echo
echo "Aucune donnée de production n'a été modifiée : pg_dump ne fait que lire."
echo
echo "Étape suivante, la vérification :"
echo "  node scripts/backup/verifier-sauvegarde.mjs \"$ARCHIVE\""
