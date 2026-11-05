#!/usr/bin/env bash
# Déploiement vers https://mkl-energies.fr
# Dans Cursor : écris « déploie » — ou lance : npm run deploy
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ ! -f "$ROOT/index.html" || ! -f "$ROOT/app.js" ]]; then
  echo "Refus : ce dossier n’est pas la copie complète du site. Déploiement interrompu." >&2
  exit 1
fi
HOST="${OVH_HOST:-ubuntu@148.113.149.139}"
REMOTE_DIR="${OVH_DIR:-/var/www/mkl-energies}"
SSH_KEY="${OVH_SSH_KEY:-$HOME/.ssh/mkl_ovh}"

SSH=(ssh -o BatchMode=yes -o IdentitiesOnly=yes)
if [[ -f "$SSH_KEY" ]]; then
  SSH+=(-i "$SSH_KEY")
fi

echo "→ Sync vers ${HOST}:${REMOTE_DIR}"
rsync -avz --delete \
  -e "${SSH[*]}" \
  --exclude node_modules \
  --exclude 'tmp-*' \
  --exclude .git \
  --exclude .tunnel-url \
  --exclude .tunnel.log \
  --exclude .well-known \
  --exclude '*.log' \
  --exclude .env \
  --exclude 'deploy/ovh/private/' \
  --exclude 'data/leads.json' \
  --exclude 'data/appointments.json' \
  --exclude 'data/realisations-extra.json' \
  --exclude 'data/covers.json' \
  --exclude 'data/category-covers.json' \
  --exclude 'data/consent-proofs.jsonl' \
  --exclude 'data/crm-outbox.json' \
  --exclude 'data/.store.lock' \
  --exclude 'data/.*.tmp' \
  --exclude 'data/proofs' \
  --exclude 'assets/realisations/metiers/' \
  --exclude 'assets/metiers/radiateur-mkl.jpg' \
  --filter 'P assets/realisations/**.jpg' \
  --filter 'P assets/realisations/**.jpeg' \
  --filter 'P assets/realisations/**.png' \
  --filter 'P assets/realisations/**.webp' \
  --filter 'P assets/clim/gallery/**.jpg' \
  --filter 'P assets/clim/gallery/**.jpeg' \
  --filter 'P assets/clim/gallery/**.webp' \
  "$ROOT/" "${HOST}:${REMOTE_DIR}/"

echo "→ Dépendances Node (sharp / watermark logo)"
"${SSH[@]}" "$HOST" \
  "cd '${REMOTE_DIR}' && npm install --omit=dev --no-audit --no-fund"

echo "→ Redémarrage service"
"${SSH[@]}" "$HOST" \
  "sudo systemctl restart mkl-energies && sudo systemctl --no-pager is-active mkl-energies"

echo "OK → https://mkl-energies.fr"
