#!/bin/sh
# Déploiement du CRM en PRODUCTION, avec retour arrière immédiat.
#
#   sh scripts/mise-en-service/deployer-production.sh --controles
#   sh scripts/mise-en-service/deployer-production.sh --deployer
#   sh scripts/mise-en-service/deployer-production.sh --retour <identifiant>
#
# « --controles » ne touche à rien : il énumère ce qui doit être vrai avant de
# déployer, et sort en erreur si un seul point manque. « --deployer » refait ces
# contrôles, puis demande une confirmation tapée à la main avant d'agir : aucun
# déploiement ne part d'un lancement distrait.
#
# Le retour arrière est préparé avant le déploiement, pas après. L'identifiant
# du déploiement en place est relevé et affiché d'emblée : si l'épreuve qui suit
# échoue, la commande de retour est déjà connue, et elle est jouée aussitôt.
# C'est l'ordre inverse qui serait imprudent — chercher la cible du retour
# pendant une panne, c'est la chercher au pire moment.
#
# Ce que ce déploiement NE fait pas, et c'est voulu : il ne touche ni au schéma
# Supabase, ni à la branche « main », ni au site OVH. L'attribution publicitaire
# reste inerte en production faute de trousseau, ce qui rend ce passage
# réversible par le seul retour arrière.
set -u

RACINE=$(cd "$(dirname "$0")/../.." && pwd)
cd "$RACINE" || exit 2
export PATH="$HOME/.mkl-clis/bin:$PATH"

BRANCHE_ATTENDUE="etat-reference-20261105"
DOMAINE="https://crm-mkl-energeies.vercel.app"
REF_PRODUCTION="rzkwmwtjnwnmmcexwoov"
REF_RECETTE="xqbjfytrssslnsxxdrou"
NODE=${NODE:-/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node}

ACTION=""
for ARG in "$@"; do
  case "$ARG" in
    --controles|--deployer|--retour) ACTION="$ARG" ;;
    dpl_*) CIBLE_RETOUR="$ARG" ;;
    *) printf '\n  Option inconnue : %s\n\n' "$ARG" >&2; exit 2 ;;
  esac
done
[ -n "$ACTION" ] || { printf '\n  Indiquez --controles, --deployer ou --retour <identifiant>.\n\n' >&2; exit 2; }

ECHECS=0
verdict() { # $1 = 0 si conforme, $2 = libellé, $3 = détail
  if [ "$1" -eq 0 ]; then printf '    ✓ %-52s %s\n' "$2" "$3"
  else printf '    ✗ %-52s %s\n' "$2" "$3"; ECHECS=$((ECHECS + 1)); fi
}

production_en_place() { # identifiant du déploiement de production actuel
  vercel api "/v6/deployments?limit=1&target=production&state=READY" 2>/dev/null \
    | python3 -c 'import json,sys; d=json.load(sys.stdin)["deployments"]; print(d[0]["uid"] if d else "")' 2>/dev/null
}

controles() {
  printf '\n  Contrôles préalables\n\n'

  BRANCHE=$(git branch --show-current)
  [ "$BRANCHE" = "$BRANCHE_ATTENDUE" ] && verdict 0 "branche" "$BRANCHE" \
    || verdict 1 "branche" "$BRANCHE, attendue $BRANCHE_ATTENDUE"

  # Un arbre modifié déploierait du code qui n'est dans aucun commit : c'est
  # exactement ce qui est arrivé le 7 novembre à 15 h 40, et ce qui a rendu la
  # production impossible à reconstituer.
  [ -z "$(git status --porcelain)" ] && verdict 0 "arbre de travail propre" "" \
    || verdict 1 "arbre de travail propre" "$(git status --porcelain | wc -l | tr -d ' ') fichier(s) non enregistré(s)"

  LOCAL=$(git rev-parse HEAD)
  DISTANT=$(git rev-parse "origin/$BRANCHE_ATTENDUE" 2>/dev/null || echo absent)
  [ "$LOCAL" = "$DISTANT" ] && verdict 0 "commit sauvegardé sur GitHub" "$(echo "$LOCAL" | cut -c1-7)" \
    || verdict 1 "commit sauvegardé sur GitHub" "local $(echo "$LOCAL" | cut -c1-7), distant $(echo "$DISTANT" | cut -c1-7)"

  # Le préfixe de Node est le caractère « ℹ », sur plusieurs octets : le motif
  # porte donc sur les mots, et non sur le début de ligne.
  SORTIE=$("$NODE" --test tests/*.test.js 2>&1)
  REUSSIS=$(echo "$SORTIE" | grep -oE 'pass [0-9]+' | head -1 | tr -d 'pas ')
  ECHOUES=$(echo "$SORTIE" | grep -oE 'fail [0-9]+' | head -1 | tr -d 'fail ')
  [ "${ECHOUES:-1}" = "0" ] && [ "${REUSSIS:-0}" -gt 1000 ] \
    && verdict 0 "essais de régression" "${REUSSIS} réussis, 0 en échec" \
    || verdict 1 "essais de régression" "${REUSSIS:-?} réussis, ${ECHOUES:-?} en échec"

  "$NODE" scripts/mise-en-service/verifier-archive-vercel.mjs >/dev/null 2>&1 \
    && verdict 0 "archive conforme" "aucun fichier à retirer" \
    || verdict 1 "archive conforme" "des fichiers indésirables partiraient"

  # Les corrections du catalogue et des devis doivent être dans le commit, et
  # pas seulement sur le disque. Le repli du tarif forfait en est le témoin.
  FORFAIT=$(git show "HEAD:app/lib/article-bundles.js" 2>/dev/null | grep -c pricing_mode)
  [ "${FORFAIT:-0}" -gt 0 ] && verdict 0 "corrections catalogue dans le commit" "$FORFAIT mention(s) du tarif forfait" \
    || verdict 1 "corrections catalogue dans le commit" "introuvables"

  # La promotion d'un libellé de consultation en administration ne doit pas
  # revenir par un retour de branche mal fusionné.
  git show HEAD:app/lib/roles.js | grep -q 'Lecture: "Superadmin"' \
    && verdict 1 "« Lecture » n accorde pas l administration" "l alias est revenu" \
    || verdict 0 "« Lecture » n accorde pas l administration" ""

  git show HEAD:vercel.json | grep -q "\"$BRANCHE_ATTENDUE\": false" \
    && verdict 0 "garde-fou de déploiement par Git" "cette branche reste muette" \
    || verdict 1 "garde-fou de déploiement par Git" "absent du vercel.json"

  CIBLE=$(production_en_place)
  [ -n "$CIBLE" ] && verdict 0 "retour arrière préparé" "$CIBLE" \
    || verdict 1 "retour arrière préparé" "aucun déploiement de production lisible"

  printf '\n'
  [ "$ECHECS" -eq 0 ] || { printf '  %s contrôle(s) en échec. Rien n a été déployé.\n\n' "$ECHECS"; return 1; }
  printf '  Tous les contrôles passent.\n\n'
  return 0
}

epreuve_production() {
  printf '\n  Épreuve de la production\n\n'
  ECHECS=0

  CODE=$(curl -s -o /tmp/mkl-prod.html -w '%{http_code}' -L "$DOMAINE/")
  [ "$CODE" = "200" ] && verdict 0 "la porte d entrée répond" "code $CODE" \
    || verdict 1 "la porte d entrée répond" "code $CODE"

  : > /tmp/mkl-prod.js
  for S in $(grep -o 'src="/_next/static/[^"]*"' /tmp/mkl-prod.html | sed 's/src="//;s/"//' | sort -u); do
    curl -s "$DOMAINE$S" >> /tmp/mkl-prod.js
  done
  TAILLE=$(wc -c < /tmp/mkl-prod.js | tr -d ' ')
  [ "$TAILLE" -gt 100000 ] && verdict 0 "paquet client lisible" "$TAILLE octets" \
    || verdict 1 "paquet client lisible" "$TAILLE octets seulement"

  # La base interrogée est celle de production, et la recette n en est pas.
  grep -q "$REF_PRODUCTION" /tmp/mkl-prod.js \
    && verdict 0 "base interrogée" "production" \
    || verdict 1 "base interrogée" "référence de production absente du paquet"
  grep -q "$REF_RECETTE" /tmp/mkl-prod.js \
    && verdict 1 "cloisonnement" "la référence de RECETTE est présente" \
    || verdict 0 "cloisonnement" "aucune référence de RECETTE"

  grep -q 'Lecture:"Superadmin"' /tmp/mkl-prod.js \
    && verdict 1 "« Lecture » n accorde pas l administration" "l alias est en ligne" \
    || verdict 0 "« Lecture » n accorde pas l administration" ""
  grep -q '"Admin second":"Superadmin"' /tmp/mkl-prod.js \
    && verdict 0 "« Admin second » reste équivalent à Superadmin" "" \
    || verdict 1 "« Admin second » reste équivalent à Superadmin" "l alias a disparu"

  # Le filtre de la gestion des utilisateurs doit se fermer sur un rôle inconnu.
  grep -q 'isAdmin?[a-zA-Z_$]*:[a-zA-Z_$]*\.filter' /tmp/mkl-prod.js \
    && verdict 0 "gestion des utilisateurs fermée par défaut" "" \
    || verdict 1 "gestion des utilisateurs fermée par défaut" "forme attendue absente"

  # Les passages planifiés restent gardés par le secret : sans en-tête, la
  # réponse doit être un refus, et non l état de configuration.
  CRON=$(curl -s -o /dev/null -w '%{http_code}' "$DOMAINE/api/cron/web-leads")
  { [ "$CRON" = "401" ] || [ "$CRON" = "403" ]; } \
    && verdict 0 "passage planifié gardé par le secret" "code $CRON sans en-tête" \
    || verdict 1 "passage planifié gardé par le secret" "code $CRON"

  # La réception des demandes du site refuse la lecture : la route existe, et
  # n accepte que l envoi signé.
  WEB=$(curl -s -o /dev/null -w '%{http_code}' "$DOMAINE/api/web-leads")
  [ "$WEB" = "405" ] && verdict 0 "réception des demandes en place" "code 405 en lecture" \
    || verdict 1 "réception des demandes en place" "code $WEB"

  printf '\n'
  return "$ECHECS"
}

case "$ACTION" in
--controles)
  controles || exit 1
  printf '  Pour déployer :\n    sh scripts/mise-en-service/deployer-production.sh --deployer\n\n'
  ;;

--retour)
  CIBLE=${CIBLE_RETOUR:-}
  [ -n "$CIBLE" ] || { printf '\n  Indiquez l identifiant : --retour dpl_…\n\n' >&2; exit 2; }
  printf '\n  Retour arrière vers %s\n\n' "$CIBLE"
  vercel rollback "$CIBLE" --yes --timeout 5m || exit 1
  epreuve_production
  printf '  Retour arrière terminé. Vérifiez les lignes ci-dessus.\n\n'
  ;;

--deployer)
  controles || exit 1

  CIBLE_AVANT=$(production_en_place)
  printf '  Retour arrière, si besoin, vers le déploiement actuellement en place :\n'
  printf '    sh scripts/mise-en-service/deployer-production.sh --retour %s\n\n' "$CIBLE_AVANT"
  printf '  Ce déploiement met en ligne la nouvelle clé Google Solar, les corrections\n'
  printf '  du catalogue et des devis, la fermeture des droits, et fait taire la tâche\n'
  printf '  de la minute. Il ne touche ni au schéma Supabase, ni à main, ni au site OVH.\n\n'
  printf '  Tapez « deployer en production » pour continuer : '
  read -r REPONSE
  [ "$REPONSE" = "deployer en production" ] || { printf '\n  Abandon. Rien n a été déployé.\n\n'; exit 1; }

  printf '\n  Déploiement…\n\n'
  vercel deploy --prod --yes || { printf '\n  Le déploiement a échoué. La production est restée sur %s.\n\n' "$CIBLE_AVANT"; exit 1; }

  # Le temps que l alias se propage avant d éprouver le résultat.
  sleep 15
  if epreuve_production; then
    printf '  Déploiement conforme. Production sur le commit %s.\n' "$(git rev-parse --short HEAD)"
    printf '  Retour arrière resté disponible :\n    sh scripts/mise-en-service/deployer-production.sh --retour %s\n\n' "$CIBLE_AVANT"
  else
    printf '  ANOMALIE. Retour arrière immédiat vers %s.\n\n' "$CIBLE_AVANT"
    vercel rollback "$CIBLE_AVANT" --yes --timeout 5m
    printf '\n  État après retour arrière :\n'
    epreuve_production
    printf '  La production est revenue à son état antérieur. Présentez ces lignes avant toute reprise.\n\n'
    exit 1
  fi
  ;;
esac
