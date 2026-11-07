#!/bin/sh
# Renouvellement de CRM_ACCESS_PIN et GOOGLE_SOLAR_API_KEY, sans coupure.
#
#   sh scripts/mise-en-service/rotation-secrets.sh --etat
#   sh scripts/mise-en-service/rotation-secrets.sh --pin-ouvrir     [--production]
#   sh scripts/mise-en-service/rotation-secrets.sh --pin-refermer   [--production]
#   sh scripts/mise-en-service/rotation-secrets.sh --solar          [--production]
#
# Le principe, en deux temps. « --pin-ouvrir » publie le nouveau code tout en
# déclarant l'ancien comme précédent : les deux fonctionnent, personne n'est
# bloqué. Une fois les équipes prévenues, « --pin-refermer » retire l'ancien.
# Sans cette fenêtre, un renouvellement est une interruption de service.
#
# La cible par défaut est PREVIEW. La production exige « --production » et une
# confirmation tapée à la main : aucun secret de production ne bouge sans un
# geste explicite.
#
# Aucune valeur n'est affichée, ni écrite dans un fichier du dépôt. Les saisies
# se font à l'écran masqué.

set -eu

export PATH="$HOME/.mkl-clis/bin:$PATH"
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
CIBLE="preview"
ACTION=""

arret() { printf '\n  %s\n\n' "$1" >&2; exit 2; }

for ARG in "$@"; do
  case "$ARG" in
    --production) CIBLE="production" ;;
    --etat|--pin-ouvrir|--pin-refermer|--solar) ACTION="$ARG" ;;
    *) arret "Argument inconnu : $ARG" ;;
  esac
done
[ -n "$ACTION" ] || arret "Indiquez --etat, --pin-ouvrir, --pin-refermer ou --solar."

command -v vercel >/dev/null 2>&1 || arret "La commande « vercel » est introuvable."

demander() {
  # $1 = intitulé. La valeur est rendue sur la sortie standard, jamais à l'écran.
  printf '  %s (saisie invisible) : ' "$1" >&2
  stty -echo 2>/dev/null || arret "Pas de terminal : lancez ce script dans le Terminal."
  IFS= read -r REPONSE
  stty echo 2>/dev/null || true
  printf '\n' >&2
  printf '%s' "$REPONSE"
}

confirmer() {
  printf '\n  Cible : %s\n' "$(printf '%s' "$CIBLE" | tr '[:lower:]' '[:upper:]')" >&2
  printf '  %s\n' "$1" >&2
  printf '  Tapez exactement « %s » pour poursuivre : ' "$2" >&2
  IFS= read -r SAISIE
  [ "$SAISIE" = "$2" ] || arret "Confirmation absente : rien n'a été modifié."
}

eprouver_solar() {
  # $1 = clé. Un seul appel, sur les deux points d'entrée réellement utilisés
  # par le CRM. Publier une clé muette échangerait un secret exposé contre une
  # panne de l'étude photovoltaïque : autant le savoir avant.
  CLE_A_TESTER="$1"
  for POINT in \
    "buildingInsights:findClosest?location.latitude=43.2965&location.longitude=5.3698&requiredQuality=BASE" \
    "dataLayers:get?location.latitude=43.2965&location.longitude=5.3698&radiusMeters=50&view=IMAGERY_AND_ANNUAL_FLUX_LAYERS&requiredQuality=BASE&pixelSizeMeters=0.5"
  do
    NOM="${POINT%%:*}"
    # La clé voyage en paramètre, comme l'exige l'API, mais n'apparaît ni à
    # l'écran ni dans un fichier : seul le code de réponse est conservé.
    CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
      "https://solar.googleapis.com/v1/${POINT}&key=${CLE_A_TESTER}" 2>/dev/null || echo 000)"
    case "$CODE" in
      200) printf '  ✓ %s répond\n' "$NOM" >&2 ;;
      403) arret "$NOM refuse la clé (403). L'API Solar est-elle activée, et la restriction d'API l'autorise-t-elle ?" ;;
      400) arret "$NOM renvoie 400 : Google ne reconnaît pas cette clé. Mal copiée, ou issue d'un autre projet ?" ;;
      429) arret "$NOM renvoie 429 : quota épuisé. Clé non publiée." ;;
      000) arret "Aucune réponse de Google. Rien n'a été modifié." ;;
      *)   arret "$NOM renvoie $CODE. Clé non publiée." ;;
    esac
  done
}

poser() {
  # $1 = nom, $2 = valeur. Sans --force : une entrée existante n'est jamais
  # écrasée par accident, il faut la retirer d'abord et le voir.
  printf '%s' "$2" | vercel env add "$1" "$CIBLE" >/dev/null 2>&1 \
    && printf '  ✓ %s posée sur %s\n' "$1" "$CIBLE" \
    || arret "$1 existe déjà sur $CIBLE. Retirez-la d'abord : vercel env rm $1 $CIBLE"
}

# ---------------------------------------------------------------------------
case "$ACTION" in
# ---------------------------------------------------------------------------

--etat)
  printf '\n  État du renouvellement — %s\n' "$CIBLE"
  printf '  ─────────────────────────────────────\n'
  LISTE="$(vercel env ls "$CIBLE" 2>/dev/null || true)"
  for NOM in CRM_ACCESS_PIN CRM_ACCESS_PIN_PRECEDENT CRM_SESSION_SECRET \
             CRM_SESSION_SECRET_PRECEDENT GOOGLE_SOLAR_API_KEY; do
    if printf '%s' "$LISTE" | grep -q "^[[:space:]]*$NOM[[:space:]]"; then
      printf '  %-32s déclarée\n' "$NOM"
    else
      printf '  %-32s absente\n' "$NOM"
    fi
  done
  printf '\n  Aucune valeur n a été lue : seuls les noms sont consultés.\n'
  if printf '%s' "$LISTE" | grep -q "CRM_ACCESS_PIN_PRECEDENT"; then
    printf '  Une fenêtre de tolérance est OUVERTE : pensez à la refermer.\n'
  fi
  printf '\n'
  ;;

--pin-ouvrir)
  printf '\n  Ouverture de la fenêtre sur le code d accès\n'
  printf '  ──────────────────────────────────────────\n'
  printf '  L ancien code reste valable le temps que les équipes basculent.\n'
  printf '  Les sessions en cours ne sont pas touchées : le secret de session\n'
  printf '  est une variable distincte.\n\n'

  ANCIEN="$(demander 'Code actuel, celui qui doit rester valable')"
  NOUVEAU="$(demander 'Nouveau code')"
  REPETE="$(demander 'Nouveau code, à nouveau')"

  [ "$NOUVEAU" = "$REPETE" ] || arret "Les deux saisies du nouveau code diffèrent."
  [ "$NOUVEAU" != "$ANCIEN" ] || arret "Le nouveau code est identique à l'ancien."
  case "$NOUVEAU" in
    *[!0-9]*) arret "Le code doit être numérique." ;;
  esac
  [ "${#NOUVEAU}" -ge 4 ] || arret "Le code doit faire au moins quatre chiffres."
  [ "${#ANCIEN}" -ge 4 ] || arret "L'ancien code semble incomplet."

  confirmer "Le nouveau code sera publié, l'ancien restant accepté." "renouveler"

  poser CRM_ACCESS_PIN_PRECEDENT "$ANCIEN"
  vercel env rm CRM_ACCESS_PIN "$CIBLE" --yes >/dev/null 2>&1 || true
  poser CRM_ACCESS_PIN "$NOUVEAU"

  printf '\n  Les variables sont posées. Elles ne prennent effet qu au prochain\n'
  printf '  déploiement : Vercel fige l environnement à la création de celui-ci.\n'
  printf '  Déploiement à lancer séparément, avec votre accord.\n\n'
  ;;

--pin-refermer)
  printf '\n  Fermeture de la fenêtre\n'
  printf '  ───────────────────────\n'
  printf '  L ancien code sera définitivement révoqué.\n'
  confirmer "CRM_ACCESS_PIN_PRECEDENT va être retirée." "refermer"
  vercel env rm CRM_ACCESS_PIN_PRECEDENT "$CIBLE" --yes >/dev/null 2>&1 \
    && printf '  ✓ ancien code révoqué sur %s\n' "$CIBLE" \
    || printf '  (la variable n était pas déclarée : rien à retirer)\n'
  printf '\n  Effectif au prochain déploiement.\n\n'
  ;;

--solar)
  printf '\n  Renouvellement de la clé Google Solar\n'
  printf '  ────────────────────────────────────\n'
  printf '  Cette clé ne sert que côté serveur : aucun utilisateur ne la détient,\n'
  printf '  donc aucune fenêtre de tolérance n est nécessaire. L ordre suffit :\n'
  printf '  créer la nouvelle, la publier, déployer, vérifier, puis supprimer\n'
  printf '  l ancienne dans la console Google — et pas avant.\n\n'

  CLE="$(demander 'Nouvelle clé Google Solar')"
  [ "${#CLE}" -ge 20 ] || arret "La clé semble trop courte."
  case "$CLE" in
    *[!A-Za-z0-9_-]*) arret "La clé contient un caractère inattendu : ligne copiée en trop ?" ;;
  esac

  printf '\n  Vérification de la clé auprès de Google, avant toute publication :\n'
  eprouver_solar "$CLE"

  confirmer "GOOGLE_SOLAR_API_KEY va être remplacée." "remplacer"
  vercel env rm GOOGLE_SOLAR_API_KEY "$CIBLE" --yes >/dev/null 2>&1 || true
  poser GOOGLE_SOLAR_API_KEY "$CLE"

  printf '\n  Ne supprimez l ancienne clé dans Google Cloud qu APRÈS avoir vérifié\n'
  printf '  le calcul de production photovoltaïque sur le déploiement.\n\n'
  ;;

esac
