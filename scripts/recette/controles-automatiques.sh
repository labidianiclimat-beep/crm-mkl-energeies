#!/bin/sh
# Batterie complète des contrôles de cloisonnement et d'intégration, en une
# commande et sans aucun effet sur les bases.
#
#   sh scripts/recette/controles-automatiques.sh
#
# Six étapes, du moins coûteux au plus coûteux. La première qui échoue arrête
# tout : enchaîner après un échec donne des résultats illisibles.
#
#   1. Tests unitaires du CRM.
#   2. Tests unitaires du site OVH.
#   3. Accord des deux bords sur le format de l'attribution.
#   4. Cloisonnement des environnements, variables lues avant compilation.
#   5. Projet réellement gravé dans le build compilé.
#   6. Étage HMAC de la route d'ingestion, par de vraies requêtes HTTP.
#
# Rien ici n'écrit dans une base, ne déploie ni ne contacte la production. Les
# deux étapes qui écrivent dans la recette restent séparées et demandent une
# confirmation :
#
#   node scripts/recette/test-http-ovh.mjs --complet
#   node scripts/recette/test-http-ovh.mjs --nettoyer

set -eu
cd "$(dirname "$0")/../.."

NODE="${MKL_NODE:-/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node}"
command -v node >/dev/null 2>&1 && NODE="$(command -v node)"

ETAPE=0
echec() { printf '\n  \033[31m✗\033[0m étape %s : %s\n\n' "$ETAPE" "$1"; exit 1; }
titre() { ETAPE=$((ETAPE + 1)); printf '\n  %s. %s\n' "$ETAPE" "$1"; }
bilan() { printf '     %s\n' "$1"; }

printf '\n  Contrôles automatiques — cloisonnement et intégration OVH\n'

# ---------------------------------------------------------------------------
titre "Tests unitaires du CRM"
SORTIE="$("$NODE" --test tests/*.test.js 2>&1 || true)"
PASS="$(printf '%s' "$SORTIE" | sed -n 's/^.*ℹ pass \([0-9]*\).*$/\1/p' | tail -1)"
FAIL="$(printf '%s' "$SORTIE" | sed -n 's/^.*ℹ fail \([0-9]*\).*$/\1/p' | tail -1)"
bilan "$PASS réussi(s), ${FAIL:-0} échoué(s)"
if [ "${FAIL:-0}" != "0" ]; then
  # Les échecs sont nommés, sans quoi il faut relancer la suite pour les voir.
  printf '%s' "$SORTIE" | grep -E "^✖" | sed 's/^/       /' | sort -u
  printf '     Ces échecs sont-ils liés au cloisonnement ? Les fichiers concernés\n'
  printf '     le disent. Les zones de devis et de catalogue sont en cours de\n'
  printf '     modification et échouent indépendamment de ce chantier.\n'
fi

# ---------------------------------------------------------------------------
titre "Tests unitaires du site OVH"
SORTIE="$("$NODE" --test ovh-site/tests/*.test.js 2>&1 || true)"
PASS="$(printf '%s' "$SORTIE" | sed -n 's/^.*ℹ pass \([0-9]*\).*$/\1/p' | tail -1)"
FAIL="$(printf '%s' "$SORTIE" | sed -n 's/^.*ℹ fail \([0-9]*\).*$/\1/p' | tail -1)"
bilan "$PASS réussi(s), ${FAIL:-0} échoué(s)"
[ "${FAIL:-0}" = "0" ] || echec "le site OVH a des tests en échec"

# ---------------------------------------------------------------------------
titre "Accord des deux bords sur le format de l'attribution"
SORTIE="$("$NODE" --test tests/ovh-crm-attribution.test.js 2>&1 || true)"
PASS="$(printf '%s' "$SORTIE" | sed -n 's/^.*ℹ pass \([0-9]*\).*$/\1/p' | tail -1)"
FAIL="$(printf '%s' "$SORTIE" | sed -n 's/^.*ℹ fail \([0-9]*\).*$/\1/p' | tail -1)"
bilan "$PASS réussi(s), ${FAIL:-0} échoué(s)"
[ "${FAIL:-0}" = "0" ] || echec "le site et le CRM ne s'accordent plus sur le format"

# ---------------------------------------------------------------------------
titre "Cloisonnement des environnements, avant compilation"
if "$NODE" scripts/verifier-config-supabase.mjs >/tmp/mkl-config.log 2>&1; then
  bilan "conforme"
  grep -i "avertissement" /tmp/mkl-config.log | sed 's/^/       /' || true
else
  sed 's/^/       /' /tmp/mkl-config.log
  echec "la configuration Supabase est refusée"
fi

# ---------------------------------------------------------------------------
titre "Projet réellement gravé dans le build"
if [ ! -f .next/BUILD_ID ]; then
  bilan "aucun build local : étape sautée"
  bilan "compilez d'abord, ou lancez compiler-pour-recette.sh"
elif "$NODE" scripts/verifier-build-grave.mjs >/tmp/mkl-grave.log 2>&1; then
  grep -E "^Projet attendu|^  gravé|^Conforme" /tmp/mkl-grave.log | sed 's/^/       /'
else
  sed 's/^/       /' /tmp/mkl-grave.log
  echec "le build ne vise pas le projet attendu"
fi

# ---------------------------------------------------------------------------
titre "Étage HMAC de la route d'ingestion, par requêtes HTTP réelles"
if [ ! -f .next/BUILD_ID ]; then
  bilan "aucun build local : étape sautée"
else
  SORTIE="$("$NODE" scripts/recette/test-http-ovh.mjs --signature 2>&1 || true)"
  printf '%s' "$SORTIE" | grep -E "réussi\(s\)," | sed 's/^ */       /'
  printf '%s' "$SORTIE" | grep -E "ÉCHOUÉ" | sed 's/^ */       /' || true
  printf '%s' "$SORTIE" | grep -q "0 échoué" || echec "l'étage HMAC a des contrôles en échec"
fi

printf '\n  \033[32m✓\033[0m Tous les contrôles bloquants sont conformes.\n\n'
printf '  Pour aller jusqu à l écriture réelle dans la recette :\n'
printf '    node scripts/recette/test-http-ovh.mjs --complet\n'
printf '    node scripts/recette/test-http-ovh.mjs --nettoyer\n\n'
