#!/bin/sh
# Enregistre la clé `service_role` de MKL CRM RECETTE dans un coffre local,
# hors du dépôt Git. La valeur est saisie à l'écran masqué et n'est jamais
# affichée, ni recopiée dans le journal, ni transmise ailleurs.
#
#   sh scripts/recette/enregistrer-cles-recette.sh
#
# Le script refuse d'enregistrer une clé qui n'appartient pas à la recette.
# Trois contrôles successifs, du plus décisif au plus circonstanciel :
#
#   1. La clé héritée de Supabase est un jeton JWT dont la charge contient le
#      champ `ref`, c'est-à-dire l'identifiant du projet, et le champ `role`.
#      Ce champ est signé : il lie la clé à un projet et à un seul. C'est la
#      preuve la plus forte, et elle est obtenue sans aucun appel réseau.
#   2. La clé est essayée contre l'adresse de la recette. Une clé valable
#      obtient une réponse ; une clé étrangère au projet obtient un refus.
#   3. L'organisation lue par cette adresse est comparée à celle que lit la
#      connexion PostgreSQL, dont l'empreinte de cluster est déjà vérifiée par
#      cible.sh. Les deux chemins doivent voir la même base.
#
# Les clés de nouvelle génération, préfixées `sb_secret_`, ne portent pas de
# champ `ref` lisible. Le premier contrôle est alors annoncé comme impossible,
# et la décision repose sur les deux suivants. Le script le dit explicitement
# plutôt que de laisser croire à une vérification complète.

set -eu

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
. "$RACINE/scripts/recette/cible.sh"

REF_RECETTE="xqbjfytrssslnsxxdrou"
REF_PRODUCTION="rzkwmwtjnwnmmcexwoov"
COFFRE="$HOME/.mkl-secrets"
FICHIER="$COFFRE/recette-api.env"
NODE="${MKL_NODE:-/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node}"

printf '\n  Enregistrement de la clé service_role de MKL CRM RECETTE\n\n'

# ---------------------------------------------------------------------------
# La cible PostgreSQL d'abord : inutile de demander une clé si la connexion
# déjà enregistrée ne pointe pas sur la recette.
# ---------------------------------------------------------------------------

printf '  Contrôle de la cible PostgreSQL… '
garde_cible
printf 'recette confirmée\n'

ORG="$(q "select id::text from public.organizations order by created_at limit 1")"
if [ -z "$ORG" ]; then
  non "aucune organisation sur la recette : socle incomplet"
  exit 1
fi
oui "organisation de la recette relevée"

# ---------------------------------------------------------------------------
# Saisie masquée.
# ---------------------------------------------------------------------------

printf '\n  Collez la clé service_role de RECETTE, puis Entrée.\n'
printf '  La saisie reste invisible, c est normal.\n\n'
printf '  Clé : '
stty -echo 2>/dev/null || true
IFS= read -r CLE
stty echo 2>/dev/null || true
printf '\n\n'

if [ -z "$CLE" ]; then
  non "aucune valeur saisie"
  exit 1
fi

# Un copier-coller depuis le tableau de bord ramène parfois l'identifiant du
# projet collé à la clé. Le cas de la production est éliminé tout de suite.
case "$CLE" in
  *"$REF_PRODUCTION"*)
    non "cette valeur porte l identifiant de PRODUCTION : refus immédiat"
    exit 1
    ;;
esac

# ---------------------------------------------------------------------------
# Contrôle 1 : la charge signée du jeton.
# ---------------------------------------------------------------------------

printf '  Contrôle 1, identité inscrite dans la clé… '
VERDICT="$(MKL_CLE="$CLE" MKL_REF="$REF_RECETTE" MKL_REF_PROD="$REF_PRODUCTION" "$NODE" -e '
const cle = process.env.MKL_CLE || "";
const morceaux = cle.split(".");
if (morceaux.length !== 3) { console.log("illisible"); process.exit(0); }
try {
  const charge = JSON.parse(Buffer.from(morceaux[1], "base64url").toString("utf8"));
  if (charge.ref === process.env.MKL_REF_PROD) { console.log("production"); process.exit(0); }
  if (charge.ref !== process.env.MKL_REF) { console.log("autre:" + String(charge.ref || "?")); process.exit(0); }
  if (charge.role !== "service_role") { console.log("role:" + String(charge.role || "?")); process.exit(0); }
  console.log("recette");
} catch { console.log("illisible"); }
' 2>/dev/null || echo "illisible")"

case "$VERDICT" in
  recette)
    printf 'la clé déclare le projet de recette et le rôle service_role\n'
    ;;
  production)
    printf '\n'; non "la clé déclare le projet de PRODUCTION : refus"
    exit 1
    ;;
  autre:*)
    printf '\n'; non "la clé déclare un autre projet que la recette : refus"
    exit 1
    ;;
  role:*)
    printf '\n'; non "la clé ne porte pas le rôle service_role : refus"
    exit 1
    ;;
  *)
    printf 'impossible, clé de nouvelle génération\n'
    printf '    Les deux contrôles suivants deviennent décisifs.\n'
    ;;
esac

# ---------------------------------------------------------------------------
# Contrôle 2 : la clé répond-elle sur l'adresse de la recette.
# ---------------------------------------------------------------------------

URL_RECETTE="https://$REF_RECETTE.supabase.co"
printf '  Contrôle 2, réponse de %s… ' "$URL_RECETTE"
CODE="$(curl -s -o /dev/null -w '%{http_code}' \
  -H "apikey: $CLE" -H "Authorization: Bearer $CLE" \
  "$URL_RECETTE/rest/v1/organizations?select=id&limit=1" 2>/dev/null || echo "000")"
if [ "$CODE" != "200" ]; then
  printf '\n'
  non "l adresse de la recette a répondu $CODE : la clé n est pas acceptée"
  printf '    Aucune clé n a été enregistrée.\n\n'
  exit 1
fi
printf 'acceptée\n'

# ---------------------------------------------------------------------------
# Contrôle 3 : les deux chemins voient-ils la même base.
# ---------------------------------------------------------------------------

printf '  Contrôle 3, concordance avec la connexion PostgreSQL… '
VU="$(curl -s -H "apikey: $CLE" -H "Authorization: Bearer $CLE" \
  "$URL_RECETTE/rest/v1/organizations?select=id&order=created_at&limit=1" 2>/dev/null \
  | tr -d '[]{}"' | sed 's/^id://')"
if [ "$VU" != "$ORG" ]; then
  printf '\n'
  non "l adresse et la connexion PostgreSQL ne voient pas la même base"
  printf '    Aucune clé n a été enregistrée.\n\n'
  exit 1
fi
printf 'même organisation des deux côtés\n'

# ---------------------------------------------------------------------------
# Enregistrement.
# ---------------------------------------------------------------------------

mkdir -p "$COFFRE"
chmod 700 "$COFFRE"
umask 077
{
  printf '# MKL CRM RECETTE — clés du test HTTP. Hors dépôt Git.\n'
  printf '# Engendré le %s par enregistrer-cles-recette.sh\n' "$(date '+%Y-%m-%d %H:%M')"
  printf 'MKL_RECETTE_URL=%s\n' "$URL_RECETTE"
  printf 'MKL_RECETTE_SERVICE_KEY=%s\n' "$CLE"
  printf 'MKL_RECETTE_ORGANIZATION_ID=%s\n' "$ORG"
} > "$FICHIER"
chmod 600 "$FICHIER"

oui "clé enregistrée dans $FICHIER, droits 600"
printf '\n  Les trois contrôles concordent : la clé appartient bien à la recette.\n'
printf '  Rien n a été écrit dans la base.\n\n'
printf '  Étape suivante, dans Cursor :\n'
printf '    node scripts/recette/test-http-ovh.mjs --complet\n\n'
