#!/bin/sh
# Lance le test réseau DEPUIS le VPS OVH vers le CRM RECETTE.
#
#   sh scripts/recette/test-depuis-vps.sh https://<deploiement>.vercel.app/api/web-leads
#
# Le script est transmis au VPS par l'entrée standard et exécuté en mémoire :
# rien n'est écrit sur le disque du serveur, et le site en ligne n'est pas
# touché. Les secrets voyagent eux aussi par l'entrée standard, jamais par la
# ligne de commande distante, qui serait visible dans la liste des processus.
#
# Le mot de passe SSH est saisi une seule fois : la connexion est maintenue le
# temps du test par une prise de contrôle locale, puis fermée.

set -eu

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
HOTE="${OVH_HOST:-ubuntu@148.113.149.139}"
SITE_DISTANT="${OVH_DIR:-/var/www/mkl-energies}"
COFFRE="$HOME/.mkl-secrets/recette-api.env"
REF_PRODUCTION="rzkwmwtjnwnmmcexwoov"

arret() { printf '\n  %s\n\n' "$1" >&2; exit 2; }

# ---------------------------------------------------------------------------
# 1. Garde-fous sur la cible, avant toute connexion
# ---------------------------------------------------------------------------

URL="${1:-${MKL_PREVIEW_URL:-}}"
[ -n "$URL" ] || arret "Adresse du déploiement RECETTE manquante en premier argument."

case "$URL" in
  *"$REF_PRODUCTION"*) arret "L'adresse porte l'identifiant du projet de PRODUCTION : arrêt." ;;
  https://*) ;;
  *) arret "Seul HTTPS est accepté : arrêt." ;;
esac
case "$URL" in
  */api/web-leads) ;;
  *) arret "Le chemin visé n'est pas la route d'ingestion : arrêt." ;;
esac

# ---------------------------------------------------------------------------
# 2. Secrets, lus dans le coffre hors dépôt
# ---------------------------------------------------------------------------

[ -f "$COFFRE" ] || arret "Coffre absent : $COFFRE"
[ "$(stat -f '%Lp' "$COFFRE" 2>/dev/null || stat -c '%a' "$COFFRE")" = "600" ] \
  || arret "Le coffre doit être en droits 600."
# shellcheck disable=SC1090
. "$COFFRE"

for NOM in MKL_RECETTE_KEY_ID MKL_RECETTE_HMAC_SECRET MKL_VERCEL_BYPASS; do
  eval "VALEUR=\${$NOM:-}"
  [ -n "$VALEUR" ] || arret "$NOM absent du coffre."
  # Refus de tout caractère qui pourrait s'échapper de la chaîne injectée.
  case "$VALEUR" in
    *\'*|*\\*|*\"*) arret "$NOM contient un caractère interdit." ;;
  esac
done

# ---------------------------------------------------------------------------
# 3. Connexion maintenue : le mot de passe n'est demandé qu'une fois
# ---------------------------------------------------------------------------

# Une connexion déjà ouverte par l'appelant est réutilisée telle quelle : le
# script de diagnostic en établit une après avoir trouvé le bon compte, et il
# serait absurde de redemander le mot de passe.
if [ -n "${MKL_SSH_PRISE:-}" ] \
   && ssh -o ControlPath="$MKL_SSH_PRISE" -O check "$HOTE" >/dev/null 2>&1; then
  PRISE="$MKL_SSH_PRISE"
  printf '\n  Connexion déjà ouverte vers %s, réutilisée.\n' "$HOTE"
  fermer() { :; }   # elle appartient à l'appelant, qui la refermera
else
  PRISE="$(mktemp -d "${TMPDIR:-/tmp}/mkl-ssh.XXXXXX")/prise"
  fermer() {
    ssh -o ControlPath="$PRISE" -O exit "$HOTE" >/dev/null 2>&1 || true
    rm -rf "$(dirname "$PRISE")"
  }
  trap fermer EXIT INT TERM
  printf '\n  Connexion à %s\n  Saisissez le mot de passe SSH ci-dessous (il ne sera pas affiché).\n\n' "$HOTE"
  ssh -M -N -f -o ControlPath="$PRISE" -o ConnectTimeout=20 \
      -o StrictHostKeyChecking=accept-new "$HOTE" \
    || arret "Connexion refusée. Rien n'a été tenté d'autre."
fi

SSH="ssh -o ControlPath=$PRISE -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new"

printf '\n  === Le VPS, en lecture seule ===\n'
ETAT=$($SSH "$HOTE" 'hostname; date -u +%s; node -v 2>/dev/null || echo absent') \
  || arret "La machine ne répond plus."

MACHINE=$(printf '%s\n' "$ETAT" | sed -n 1p)
HORLOGE=$(printf '%s\n' "$ETAT" | sed -n 2p)
NODE=$(printf '%s\n' "$ETAT" | sed -n 3p)
printf '  %-30s %s\n' 'machine' "$MACHINE" 'version de Node' "$NODE"

DECALAGE=$(( $(date -u +%s) - HORLOGE ))
printf '  %-30s %s s\n' "écart d'horloge avec ce poste" "$DECALAGE"
if [ "${DECALAGE#-}" -ge 120 ]; then
  arret "Horloge du VPS décalée de ${DECALAGE} s : la fenêtre HMAC est de cinq minutes. Arrêt."
fi

MAJEURE=$(printf '%s\n' "$NODE" | sed -n 's/^v\([0-9]*\).*/\1/p')
if [ "${MAJEURE:-0}" -lt 18 ]; then
  arret "Node « $NODE » sur le VPS : « fetch » exige la version 18 ou plus. Arrêt."
fi

# Le module de signature du site, s'il est là : la signature est alors produite
# par le code qui tournera réellement en production, et non par un équivalent.
MODULE="$SITE_DISTANT/lib/crm-sync.mjs"
if $SSH "$HOTE" "[ -r '$MODULE' ]"; then
  printf '  %-28s %s\n' 'module de signature du site' 'présent, il sera utilisé'
else
  printf '  %-28s %s\n' 'module de signature du site' 'absent, calcul équivalent local'
  MODULE=""
fi

# ---------------------------------------------------------------------------
# 4. Le test, exécuté en mémoire sur le VPS
# ---------------------------------------------------------------------------

printf '\n  === Test réseau depuis le VPS ===\n'

{
  printf "process.env.CRM_SYNC_URL='%s';\n" "$URL"
  printf "process.env.CRM_SYNC_KEY_ID='%s';\n" "$MKL_RECETTE_KEY_ID"
  printf "process.env.CRM_SYNC_SECRET='%s';\n" "$MKL_RECETTE_HMAC_SECRET"
  printf "process.env.CRM_SYNC_BYPASS='%s';\n" "$MKL_VERCEL_BYPASS"
  if [ -n "$MODULE" ]; then
    printf "process.env.CRM_SYNC_MODULE='%s';\n" "$MODULE"
  fi
  cat "$RACINE/scripts/recette/test-reseau-ovh.mjs"
} | $SSH "$HOTE" "node --input-type=module" && CODE=0 || CODE=$?

printf '\n  Le VPS n a reçu aucun fichier et le site en ligne n a pas été modifié.\n'

if [ "$CODE" != "0" ]; then
  arret "Le test distant a échoué (code $CODE). Aucun nettoyage automatique."
fi

# L'adresse d'un déploiement Vercel ne dit rien du projet Supabase qu'il
# interroge : seule la lecture de la base le prouve. C'est donc l'étape
# suivante, menée depuis ce poste, qui établit que le prospect est arrivé
# en RECETTE, puis le supprime.
printf '  Reste à faire depuis ce poste, pour prouver la cible et nettoyer :\n'
printf '    sh scripts/recette/cible.sh   puis   node scripts/recette/test-http-ovh.mjs --nettoyer\n\n'
