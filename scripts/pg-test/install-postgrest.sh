#!/usr/bin/env bash
#
# Récupère PostgREST pour tester la couche REST sans projet Supabase.
#
# Les autres suites parlent à PostgreSQL directement ; le CRM, lui, passe par
# PostgREST. La syntaxe des filtres et la traduction des erreurs de déclencheur
# en codes HTTP ne se vérifient qu'à ce niveau.
#
# Le binaire publié pour macOS est lié à la libpq de Homebrew, qui n'est pas
# forcément installée. Plutôt que d'imposer Homebrew, on redirige la dépendance
# vers la libpq déjà fournie par l'archive PostgreSQL de `install.sh`.
#
#   bash scripts/pg-test/install.sh          # d'abord : PostgreSQL
#   bash scripts/pg-test/install-postgrest.sh
#
set -euo pipefail

VERSION="${POSTGREST_VERSION:-v16.5}"
PG_HOME="${PG_TEST_HOME:-/tmp/pgtest}"
PG_MAJOR="${PG_MAJOR:-17}"

if [ ! -d "$PG_HOME/pg$PG_MAJOR/native/lib" ]; then
  echo "PostgreSQL absent de $PG_HOME. Lancez d'abord : bash scripts/pg-test/install.sh" >&2
  exit 1
fi

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  CIBLE="macos-aarch64" ;;
  Darwin-x86_64) CIBLE="macos-x86-64" ;;
  Linux-aarch64) CIBLE="linux-static-aarch64" ;;
  Linux-x86_64)  CIBLE="linux-static-x86-64" ;;
  *) echo "Plateforme non prévue : $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

cd "$PG_HOME"

if [ ! -x "$PG_HOME/postgrest" ]; then
  URL="https://github.com/PostgREST/postgrest/releases/download/$VERSION/postgrest-$VERSION-$CIBLE.tar.xz"
  echo "Téléchargement de PostgREST $VERSION ($CIBLE)"
  curl -sSfL -o postgrest.tar.xz "$URL"
  tar xJf postgrest.tar.xz
  rm -f postgrest.tar.xz
fi

# Les constructions Linux sont statiques et n'ont rien à rediriger.
if [ "$(uname -s)" = "Darwin" ]; then
  for lib in $(otool -L postgrest | grep -oE "/opt/homebrew/[^ ]*\.dylib" || true); do
    base="$(basename "$lib")"
    locale="$PG_HOME/pg$PG_MAJOR/native/lib/$base"
    if [ -f "$locale" ]; then
      install_name_tool -change "$lib" "$locale" postgrest
      echo "  $base redirigé vers la libpq embarquée"
    else
      echo "  $base introuvable localement : PostgREST risque de ne pas démarrer" >&2
    fi
  done
fi

"$PG_HOME/postgrest" --version
echo
echo "Prêt. Lancez : node scripts/pg-test/07-postgrest-oauth.mjs"
