#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Base PostgreSQL de test, locale et jetable.
#
# Cette machine n'a ni Docker, ni Homebrew, ni PostgreSQL, ni npm. Les binaires
# sont donc pris dans le registre npm, qui est joignable : le paquet
# @embedded-postgres/darwin-arm64 contient un PostgreSQL complet, et son
# archive est en gzip, que `tar` sait lire sans outil supplémentaire.
#
# Tout vit dans /tmp : rien n'est ajouté au dépôt, rien n'est installé sur le
# système, et un redémarrage efface tout. La base de production Supabase n'est
# jamais touchée.
#
#   bash scripts/pg-test/install.sh            # PostgreSQL 17, port 55432
#   PG_MAJOR=15 PG_PORT=55433 bash ...         # PostgreSQL 15, port 55433
#
# Arrêt :
#   /tmp/pgtest/pg17/native/bin/pg_ctl -D /tmp/pgtest/data17 stop
# ---------------------------------------------------------------------------
set -euo pipefail

PG_MAJOR="${PG_MAJOR:-17}"
PG_PORT="${PG_PORT:-55432}"
HOME_DIR="${PG_TEST_HOME:-/tmp/pgtest}"

case "$PG_MAJOR" in
  15) VERSION="15.19.0-beta.19" ;;
  16) VERSION="16.15.0-beta.19" ;;
  17) VERSION="17.11.0-beta.19" ;;
  *) echo "Version non prévue : $PG_MAJOR (attendu 15, 16 ou 17)" >&2; exit 1 ;;
esac

ARCH="$(uname -m)"
case "$(uname -s)-$ARCH" in
  Darwin-arm64) PAQUET="darwin-arm64" ;;
  Darwin-x86_64) PAQUET="darwin-x64" ;;
  Linux-aarch64) PAQUET="linux-arm64" ;;
  Linux-x86_64) PAQUET="linux-x64" ;;
  *) echo "Plateforme non prévue : $(uname -s)-$ARCH" >&2; exit 1 ;;
esac

BIN="$HOME_DIR/pg$PG_MAJOR/native/bin"
DATA="$HOME_DIR/data$PG_MAJOR"

mkdir -p "$HOME_DIR"
cd "$HOME_DIR"

if [ ! -x "$BIN/initdb" ]; then
  echo "Téléchargement de PostgreSQL $PG_MAJOR ($PAQUET)…"
  curl -sSL --max-time 300 -o "pg$PG_MAJOR.tgz" \
    "https://registry.npmjs.org/@embedded-postgres/$PAQUET/-/$PAQUET-$VERSION.tgz"
  mkdir -p "pg$PG_MAJOR"
  tar xzf "pg$PG_MAJOR.tgz" -C "pg$PG_MAJOR" --strip-components=1
  chmod +x "$BIN"/* 2>/dev/null || true
fi

# Client JavaScript sans aucune dépendance : son archive s'extrait à la main,
# ce qui évite d'avoir besoin de npm.
if [ ! -f "$HOME_DIR/node_modules/postgres/src/index.js" ]; then
  echo "Téléchargement du client PostgreSQL…"
  curl -sSL --max-time 120 -o pgclient.tgz "https://registry.npmjs.org/postgres/-/postgres-4.0.0.tgz"
  mkdir -p node_modules/postgres
  tar xzf pgclient.tgz -C node_modules/postgres --strip-components=1
fi

if [ ! -f "$DATA/PG_VERSION" ]; then
  echo "Initialisation du cluster…"
  echo postgres > "$HOME_DIR/pw.txt"
  "$BIN/initdb" -D "$DATA" -U postgres --pwfile="$HOME_DIR/pw.txt" -E UTF8 --locale=C >/dev/null
fi

if ! "$BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
  echo "Démarrage sur le port $PG_PORT…"
  "$BIN/pg_ctl" -D "$DATA" -l "$HOME_DIR/pg$PG_MAJOR.log" \
    -o "-p $PG_PORT -k $HOME_DIR -c listen_addresses=127.0.0.1" start >/dev/null
fi

sleep 1
echo
"$BIN/postgres" --version
echo "Prêt sur 127.0.0.1:$PG_PORT — journal : $HOME_DIR/pg$PG_MAJOR.log"
