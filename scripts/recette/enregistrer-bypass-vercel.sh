#!/bin/sh
# Enregistre le jeton de contournement de la protection Vercel dans le coffre
# local, hors du dépôt Git. La valeur est saisie à l'écran masqué et n'est
# jamais affichée.
#
#   sh scripts/recette/enregistrer-bypass-vercel.sh
#
# Ce jeton franchit « Vercel Authentication » sur TOUS les déploiements du
# projet, production comprise. Il mérite donc le même soin qu'une clé de
# service : il est rangé en droits 600, hors du dépôt, et il n'apparaît ni
# dans l'historique du shell, ni dans les journaux.
#
# Il ne donne pas accès aux données : passé la porte de Vercel, la route
# d'ingestion exige toujours une signature HMAC valable, et les autres pages
# du CRM exigent toujours une session. Le jeton ouvre la porte, il ne la
# remplace pas.

set -eu

COFFRE="$HOME/.mkl-secrets"
FICHIER="$COFFRE/recette-api.env"

printf '\n  Jeton de contournement de la protection Vercel\n\n'

if [ ! -f "$FICHIER" ]; then
  printf '  Le coffre %s est absent.\n' "$FICHIER"
  printf '  Lancez d abord enregistrer-cles-recette.sh.\n\n'
  exit 1
fi

printf '  Collez le jeton relevé dans Vercel, puis Entrée.\n'
printf '  La saisie reste invisible, c est normal.\n\n'
printf '  Jeton : '
stty -echo 2>/dev/null || true
IFS= read -r JETON
stty echo 2>/dev/null || true
printf '\n\n'

if [ -z "$JETON" ]; then
  printf '  \033[31m✗\033[0m aucune valeur saisie\n\n'
  exit 1
fi

# Vercel engendre un jeton de 32 caractères alphanumériques. Un contrôle de
# forme évite d enregistrer une adresse, un nom de variable ou une ligne
# entière copiée par erreur.
LONGUEUR="$(printf '%s' "$JETON" | wc -c | tr -d ' ')"
HORS_ALPHABET="$(printf '%s' "$JETON" | tr -d 'A-Za-z0-9' | wc -c | tr -d ' ')"

if [ "$HORS_ALPHABET" != "0" ]; then
  printf '  \033[31m✗\033[0m la valeur contient des caractères inattendus : ce n est\n'
  printf '     probablement pas le jeton, mais une ligne copiée trop largement.\n\n'
  exit 1
fi
if [ "$LONGUEUR" -lt 24 ]; then
  printf '  \033[31m✗\033[0m la valeur fait %s caractères, Vercel en engendre 32 : refus\n\n' "$LONGUEUR"
  exit 1
fi

umask 077
# L entrée est remplacée si elle existe déjà, sans toucher aux autres lignes.
TEMPORAIRE="$(mktemp "$COFFRE/.bypass.XXXXXX")"
grep -v '^MKL_VERCEL_BYPASS=' "$FICHIER" > "$TEMPORAIRE" || true
printf 'MKL_VERCEL_BYPASS=%s\n' "$JETON" >> "$TEMPORAIRE"
mv "$TEMPORAIRE" "$FICHIER"
chmod 600 "$FICHIER"

printf '  \033[32m✓\033[0m jeton enregistré dans %s, droits 600\n' "$FICHIER"
printf '     %s caractères, jamais affiché\n\n' "$LONGUEUR"
printf '  Étape suivante, dans Cursor : le déploiement Preview vers RECETTE.\n\n'
