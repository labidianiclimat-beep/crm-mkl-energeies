#!/bin/sh
# Recompile le CRM avec la configuration de MKL CRM RECETTE, pour le test HTTP.
#
# Nécessaire parce que Next.js remplace les variables NEXT_PUBLIC_ par leur
# valeur au moment de la compilation, y compris dans le code serveur. Un build
# fabriqué avec la configuration de production appelle la production, quelle
# que soit l'adresse passée au lancement.
#
# Ce script ne déploie rien. Il ne touche que le dossier .next de cette
# machine. La production, elle, est recompilée par Vercel avec ses propres
# variables : ce build local ne l'influence pas.

set -eu
cd "$(dirname "$0")/../.."

COFFRE="$HOME/.mkl-secrets/recette-api.env"
REF_PRODUCTION="rzkwmwtjnwnmmcexwoov"
REF_RECETTE="xqbjfytrssslnsxxdrou"

[ -f "$COFFRE" ] || { printf '\n  Coffre absent : %s\n  Lancez enregistrer-cles-recette.sh\n\n' "$COFFRE"; exit 1; }
set -a; . "$COFFRE"; set +a

case "$MKL_RECETTE_URL" in
  *"$REF_RECETTE"*) : ;;
  *) printf '\n  L adresse enregistrée n est pas celle de la recette : arrêt.\n\n'; exit 1 ;;
esac

printf '\n  Compilation avec la configuration de RECETTE\n'
printf '  Adresse gravée : %s\n\n' "$MKL_RECETTE_URL"

# npm n'est pas toujours sur le PATH de cette machine. Le binaire de Next est
# appelé directement, avec l'interpréteur qui fait tourner le reste.
NODE="${MKL_NODE:-/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node}"
if command -v npm >/dev/null 2>&1; then
  COMPILER="npm run build"
else
  COMPILER="$NODE node_modules/next/dist/bin/next build"
fi

rm -rf .next
NEXT_PUBLIC_SUPABASE_URL="$MKL_RECETTE_URL" \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${MKL_RECETTE_PUBLISHABLE_KEY:-non-requis-cote-serveur}" \
SUPABASE_SERVICE_ROLE_KEY="$MKL_RECETTE_SERVICE_KEY" \
SUPABASE_PRODUCTION_REF="$REF_PRODUCTION" \
WEB_LEAD_ORGANIZATION_ID="$MKL_RECETTE_ORGANIZATION_ID" \
  $COMPILER

printf '\n  Vérification de ce qui a été gravé :\n'
if grep -rql "$REF_PRODUCTION" .next/server --include='*.js' 2>/dev/null; then
  printf '    ✗ l identifiant de PRODUCTION figure encore dans le build : arrêt\n\n'
  exit 1
fi
printf '    ✓ aucun identifiant de production\n'
if grep -rql "$REF_RECETTE" .next/server --include='*.js' 2>/dev/null; then
  printf '    ✓ identifiant de recette présent\n\n'
else
  printf '    ✗ identifiant de recette absent : arrêt\n\n'
  exit 1
fi
printf '  Build de recette prêt. Test : node scripts/recette/test-http-ovh.mjs --complet\n\n'
printf '  Pensez à recompiler normalement ensuite si vous travaillez en local\n'
printf '  sur la configuration de production.\n\n'
