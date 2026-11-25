#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Déclencheur de la file des demandes du site, depuis le VPS OVH.
#
# Pourquoi côté OVH plutôt que sur Vercel : les crons Vercel du plan Hobby ne
# descendent pas sous la journée, et le plan Hobby n'autorise que deux tâches,
# alors que le CRM en déclare déjà trois. Le VPS, lui, tourne en permanence et
# fait tourner déjà le serveur du site ; une minute y est une granularité
# ordinaire.
#
# Ce script ne traite rien lui-même : il demande au CRM de vider sa file. Le
# traitement, les verrous et les réessais restent entièrement dans le CRM, donc
# la file demeure persistante et récupérable même si ce déclencheur est arrêté
# pendant des heures.
#
# Installation (à faire seulement après accord, voir le plan de déploiement) :
#   sudo install -m 0755 mkl-crm-queue.sh /usr/local/bin/mkl-crm-queue
#   sudo install -m 0600 mkl-crm-queue.env /etc/mkl/crm-queue.env
#   sudo install -m 0644 mkl-crm-queue.service mkl-crm-queue.timer /etc/systemd/system/
#   sudo systemctl daemon-reload && sudo systemctl enable --now mkl-crm-queue.timer
# ---------------------------------------------------------------------------
set -uo pipefail

CONFIG="${MKL_CRM_QUEUE_ENV:-/etc/mkl/crm-queue.env}"
# shellcheck source=/dev/null
[ -r "$CONFIG" ] && . "$CONFIG"

CRM_URL="${CRM_URL:-}"
CRON_SECRET="${CRON_SECRET:-}"

if [ -z "$CRM_URL" ] || [ -z "$CRON_SECRET" ]; then
  echo "CRM_URL et CRON_SECRET doivent être définis dans $CONFIG" >&2
  exit 78
fi

# Le secret voyage dans l'en-tête, jamais dans l'URL : une URL se retrouve
# dans les journaux d'accès des deux côtés. `--max-time` borne l'appel pour
# qu'une minute bloquée n'empile pas les suivantes.
reponse="$(
  curl -sS --max-time 45 \
    -o /tmp/mkl-crm-queue.out -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H 'Content-Length: 0' \
    "${CRM_URL%/}/api/cron/web-leads"
)" || {
  echo "appel du CRM impossible" >&2
  exit 1
}

if [ "$reponse" != "200" ]; then
  # Le corps de la réponse ne contient jamais de coordonnées client : seules
  # des quantités. Il peut donc être journalisé sans précaution.
  echo "CRM a répondu $reponse : $(head -c 200 /tmp/mkl-crm-queue.out)" >&2
  exit 1
fi

# En fonctionnement normal il n'y a rien à dire : seules les exécutions ayant
# réellement traité quelque chose laissent une trace, pour que le journal
# reste lisible.
if ! grep -q '"reserved":0' /tmp/mkl-crm-queue.out; then
  echo "file traitée : $(head -c 200 /tmp/mkl-crm-queue.out)"
fi
