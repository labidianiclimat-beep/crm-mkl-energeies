#!/usr/bin/env bash
#
# Installe pg_dump, pg_restore et psql sans Homebrew, hors du dépôt.
#
# Ce poste n'a ni Homebrew, ni Docker, ni PostgreSQL. Deux sources ont été
# essayées avant celle-ci : le paquet npm `embedded-postgres` et les archives
# Zonky sur Maven Central ne livrent que `initdb`, `pg_ctl` et `postgres`.
# Vérifié : `pg_dump` en est absent. Postgres.app, en revanche, embarque la
# distribution complète et publie ses versions sur GitHub.
#
# Seuls quatre exécutables et leurs bibliothèques sont extraits, au lieu des
# 227 Mo du dossier `lib` complet, qui contient aussi PostGIS et GDAL.
#
# Rien n'est installé à l'échelle du système : tout va dans ~/.mkl-pgtools,
# qu'un seul `rm -rf` fait disparaître quand la sauvegarde est faite.
#
#   bash scripts/backup/installer-outils-pg.sh
#   PG_MAJEUR=18 bash scripts/backup/installer-outils-pg.sh
#
set -euo pipefail

MAJEUR="${PG_MAJEUR:-17}"
RELEASE="${POSTGRESAPP_VERSION:-v2.9.6}"
CIBLE="${PG_OUTILS_HOME:-$HOME/.mkl-pgtools}"
MONTAGE="$CIBLE/montage"
TELECHARGEMENT="$CIBLE/telechargement"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Ce script est pour macOS. Ailleurs, pg_dump s'installe par le gestionnaire de paquets." >&2
  exit 1
fi

if [ -x "$CIBLE/bin/pg_dump" ]; then
  echo "Outils déjà installés dans $CIBLE"
  "$CIBLE/bin/pg_dump" --version
  exit 0
fi

nettoyer() {
  hdiutil detach "$MONTAGE" -quiet 2>/dev/null || true
  rm -rf "$TELECHARGEMENT" "$MONTAGE"
}
trap nettoyer EXIT

mkdir -p "$TELECHARGEMENT" "$CIBLE/bin" "$CIBLE/lib"
chmod 700 "$CIBLE"

URL="https://github.com/PostgresApp/PostgresApp/releases/download/$RELEASE/Postgres-${RELEASE#v}-$MAJEUR.dmg"
echo "Téléchargement de Postgres.app $RELEASE (PostgreSQL $MAJEUR)"
echo "  $URL"
curl -sSfL -o "$TELECHARGEMENT/postgres.dmg" "$URL"
echo "  $(du -h "$TELECHARGEMENT/postgres.dmg" | awk '{print $1}') téléchargés"

# Montage en lecture seule et sans ouvrir le Finder : on ne fait que recopier.
mkdir -p "$MONTAGE"
hdiutil attach -nobrowse -readonly -quiet -mountpoint "$MONTAGE" "$TELECHARGEMENT/postgres.dmg"

SOURCE="$MONTAGE/Postgres.app/Contents/Versions/$MAJEUR"
if [ ! -d "$SOURCE/bin" ]; then
  echo "Disposition inattendue dans l'image disque : $SOURCE/bin introuvable" >&2
  exit 1
fi

for outil in pg_dump pg_restore pg_dumpall psql; do
  cp "$SOURCE/bin/$outil" "$CIBLE/bin/$outil"
done
echo "  4 exécutables copiés"

# ---------------------------------------------------------------------------
# Fermeture transitive des bibliothèques
#
# Les exécutables référencent leurs dépendances par `@loader_path/../lib/...`,
# donc une simple copie de `bin` ne suffirait pas : il faut `lib` à côté. Mais
# le dossier complet pèse 227 Mo parce qu'il porte aussi PostGIS et GDAL. On
# ne recopie donc que ce qui est réellement atteint, en suivant les
# dépendances de proche en proche : libpq dépend elle-même d'autres
# bibliothèques, qu'une copie directe des quatre premières aurait oubliées.
# ---------------------------------------------------------------------------

A_TRAITER=()
for outil in pg_dump pg_restore pg_dumpall psql; do
  A_TRAITER+=("$CIBLE/bin/$outil")
done

DEJA_VUES=""
while [ ${#A_TRAITER[@]} -gt 0 ]; do
  COURANT="${A_TRAITER[0]}"
  A_TRAITER=("${A_TRAITER[@]:1}")
  while read -r reference; do
    [ -n "$reference" ] || continue
    nom="$(basename "$reference")"
    case " $DEJA_VUES " in *" $nom "*) continue ;; esac
    if [ -f "$SOURCE/lib/$nom" ]; then
      cp -n "$SOURCE/lib/$nom" "$CIBLE/lib/$nom"
      DEJA_VUES="$DEJA_VUES $nom"
      A_TRAITER+=("$CIBLE/lib/$nom")
    fi
    # Deux formes de référence coexistent, et n'en suivre qu'une ne suffit pas.
    # Les exécutables, qui vivent dans `bin`, désignent `@loader_path/../lib/X`.
    # Les bibliothèques, qui vivent déjà dans `lib`, désignent leurs voisines
    # par `@loader_path/X`. Vérifié : libpq réclame ainsi libssl, qu'une
    # recherche limitée à la première forme laissait de côté.
  done < <(otool -L "$COURANT" | tail -n +2 | grep -oE '@loader_path/(\.\./lib/)?[^ ]+' || true)
done

NOMBRE="$(ls -1 "$CIBLE/lib" | wc -l | tr -d ' ')"
echo "  $NOMBRE bibliothèque(s) copiée(s), au lieu des 227 Mo du dossier complet"

hdiutil detach "$MONTAGE" -quiet
rm -rf "$TELECHARGEMENT"
trap - EXIT
rm -rf "$MONTAGE"

echo
"$CIBLE/bin/pg_dump" --version
"$CIBLE/bin/psql" --version
echo "  $(du -sh "$CIBLE" | awk '{print $1}') au total dans $CIBLE"
echo
echo "Étape suivante : bash scripts/backup/configurer-acces.sh"
