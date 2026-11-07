#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Déploiement de la capture de provenance vers mkl-energies.fr
#
# Pourquoi ce script existe à côté de `deploy.sh`.
#
# `deploy.sh` ne peut plus servir, et c'est heureux : son garde-fou exige
# `ovh-site/index.html`, qui n'existe plus depuis que les pages ont été
# rassemblées dans `site-public/`. Il refuse donc de partir. S'il partait —
# si quelqu'un « corrigeait » le garde-fou sans regarder plus loin — son
# `rsync --delete` depuis `ovh-site/` ferait trois dégâts d'un coup :
#
#   1. il enverrait les pages dans un sous-dossier `site-public/` du serveur,
#      alors que le serveur Node les sert à côté de `server.mjs` ;
#   2. `--delete` effacerait donc `index.html`, `app.js` et toutes les pages
#      à la racine, celles que nginx sert réellement ;
#   3. il effacerait aussi `package.json` et `package-lock.json`, qui vivent
#      sur le serveur mais ne sont pas dans le dépôt et ne figurent pas dans
#      ses exclusions — après quoi le `npm install` du script lui-même
#      n'aurait plus rien à installer.
#
# Le site serait hors ligne, et pas trivialement récupérable.
#
# Ce script part donc du constat inverse : le dépôt n'est pas un miroir du
# serveur. Il ne synchronise que ce qu'il connaît, nommément, et n'efface
# jamais rien sans l'avoir montré d'abord.
#
#   sh deployer-attribution.sh --controles   contrôles, sans aucun accès SSH
#   sh deployer-attribution.sh --simuler     montre ce qui changerait, sans écrire
#   sh deployer-attribution.sh --deployer    sauvegarde, puis déploie, interrupteur coupé
#   sh deployer-attribution.sh --retour      remet la sauvegarde en place
# ---------------------------------------------------------------------------
set -eu

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
HOTE="${OVH_HOST:-ubuntu@148.113.149.139}"
DISTANT="${OVH_DIR:-/var/www/mkl-energies}"
SAUVEGARDE="${OVH_BACKUP:-/var/www/mkl-energies.avant-attribution}"
CLE="${OVH_SSH_KEY:-$HOME/.ssh/mkl_ovh}"
SITE="https://mkl-energies.fr"

SSH="ssh -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=10"
[ -f "$CLE" ] && SSH="$SSH -i $CLE"

# Les pages publiques vivent dans `site-public/` au dépôt et à la racine sur
# le serveur. Le reste garde le même chemin de part et d'autre.
FICHIERS_SERVEUR="server.mjs admin.js"
DOSSIERS_SERVEUR="lib"
DONNEES_PUBLIQUES="data/slots.js data/realisations.js"

echo_titre() { printf '\n  %s\n\n' "$1"; }
ok()   { printf '    ✓ %-44s %s\n' "$1" "${2:-}"; }
nok()  { printf '    ✗ %-44s %s\n' "$1" "${2:-}"; ANOMALIE=1; }

# ---------------------------------------------------------------------------
# Contrôles. Aucun accès SSH : uniquement le dépôt et le site en HTTPS.
# ---------------------------------------------------------------------------
controles() {
  ANOMALIE=0
  echo_titre "Contrôles avant déploiement"

  if [ -f "$RACINE/site-public/index.html" ] && [ -f "$RACINE/site-public/app.js" ]; then
    ok "la copie du site est complète" "site-public/"
  else
    nok "la copie du site est complète" "site-public/index.html ou app.js manque"
  fi

  if [ -f "$RACINE/lib/attribution-capture.mjs" ]; then
    ok "le module de capture est présent"
  else
    nok "le module de capture est présent" "lib/attribution-capture.mjs manque"
  fi

  # Le site doit déjà répondre : on ne déploie pas sur un service à l'arrêt.
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE/" || echo 000)
  if [ "$CODE" = "200" ]; then ok "le site répond" "code $CODE"
  else nok "le site répond" "code $CODE"; fi

  # Ce que la mise à jour de nginx doit corriger. Tant que ces deux lignes
  # sont là, le script de déploiement et la configuration nginx sont
  # téléchargeables par n'importe qui : l'utilisateur SSH, l'adresse du VPS,
  # le chemin distant et l'emplacement de la clé sont donnés en clair.
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE/deploy/ovh/deploy.sh" || echo 000)
  if [ "$CODE" = "404" ]; then ok "/deploy/ est refusé par nginx" "code $CODE"
  else nok "/deploy/ est refusé par nginx" "code $CODE — EXPOSÉ, voir l étape nginx"; fi

  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE/data/leads.json" || echo 000)
  if [ "$CODE" = "404" ]; then ok "les demandes restent privées" "code $CODE"
  else nok "les demandes restent privées" "code $CODE"; fi

  # L'interrupteur doit être coupé au moment du déploiement : on met le code
  # en place d'abord, on ouvre le robinet ensuite, séparément.
  if [ "${CRM_SYNC_ENABLED:-}" = "1" ]; then
    nok "interrupteur coupé pour ce passage" "CRM_SYNC_ENABLED=1 dans cet environnement"
  else
    ok "interrupteur coupé pour ce passage"
  fi

  echo
  [ "$ANOMALIE" = "0" ] || { printf '  Un contrôle a échoué. Rien ne sera déployé.\n\n'; return 1; }
  printf '  Contrôles réunis.\n\n'
}

# ---------------------------------------------------------------------------
# Simulation. Montre les écritures et, surtout, les suppressions qu'un
# `--delete` ferait — sans en faire aucune.
# ---------------------------------------------------------------------------
simuler() {
  echo_titre "Simulation — aucune écriture"
  printf '  Pages publiques, de site-public/ vers la racine distante :\n'
  rsync -naiz --no-perms --omit-dir-times -e "$SSH" \
    "$RACINE/site-public/" "$HOTE:$DISTANT/" | sed 's/^/    /'

  printf '\n  Serveur et bibliothèques :\n'
  # shellcheck disable=SC2086
  rsync -naiz --no-perms --omit-dir-times -e "$SSH" \
    $(cd "$RACINE" && printf "%s " $FICHIERS_SERVEUR) "$HOTE:$DISTANT/" 2>/dev/null \
    | sed 's/^/    /' || true
  rsync -naiz --no-perms --omit-dir-times -e "$SSH" \
    "$RACINE/lib/" "$HOTE:$DISTANT/lib/" | sed 's/^/    /'

  printf '\n  Fichiers présents sur le serveur et absents du dépôt.\n'
  printf '  AUCUN n est supprimé par ce script. Ils sont listés pour que vous\n'
  printf '  décidiez vous-même, le dépôt n étant pas un miroir du serveur :\n'
  rsync -naiz --delete --no-perms --omit-dir-times -e "$SSH" \
    "$RACINE/site-public/" "$HOTE:$DISTANT/" \
    | rg '^\*deleting' | sed 's/^/    /' || printf '    (aucun)\n'
  printf '\n'
}

# ---------------------------------------------------------------------------
# Déploiement. Sauvegarde d abord, interrupteur coupé, aucune suppression.
# ---------------------------------------------------------------------------
deployer() {
  controles || exit 1

  printf '  Une copie de %s sera faite dans %s.\n' "$DISTANT" "$SAUVEGARDE"
  printf '  Le retour arrière se fera par :\n'
  printf '    sh %s --retour\n\n' "$(basename "$0")"
  printf '  Ce passage met le code en place, interrupteur coupé : le site ne\n'
  printf '  transmettra encore rien au CRM. L ouverture est une étape séparée.\n\n'
  printf '  Tapez « deployer le site » pour continuer : '
  read -r REPONSE
  [ "$REPONSE" = "deployer le site" ] || { printf '\n  Abandon. Rien n a été déployé.\n\n'; exit 1; }

  printf '\n  Sauvegarde…\n'
  $SSH "$HOTE" "sudo cp -a '$DISTANT' '$SAUVEGARDE' && sudo test -f '$SAUVEGARDE/index.html' && echo '    copie faite'"

  printf '\n  Envoi des pages publiques…\n'
  rsync -az --no-perms --omit-dir-times -e "$SSH" "$RACINE/site-public/" "$HOTE:$DISTANT/"

  printf '  Envoi du serveur et des bibliothèques…\n'
  # shellcheck disable=SC2086
  (cd "$RACINE" && rsync -az --no-perms --omit-dir-times -e "$SSH" $FICHIERS_SERVEUR "$HOTE:$DISTANT/")
  rsync -az --no-perms --omit-dir-times -e "$SSH" "$RACINE/lib/" "$HOTE:$DISTANT/lib/"
  # shellcheck disable=SC2086
  (cd "$RACINE" && rsync -az --no-perms --omit-dir-times -e "$SSH" $DONNEES_PUBLIQUES "$HOTE:$DISTANT/data/")

  printf '\n  Redémarrage…\n'
  $SSH "$HOTE" "sudo systemctl restart mkl-energies && sudo systemctl --no-pager is-active mkl-energies" | sed 's/^/    /'

  printf '\n'
  eprouver
}

# ---------------------------------------------------------------------------
# Épreuve. Uniquement en HTTPS : ce que voit un visiteur.
# ---------------------------------------------------------------------------
eprouver() {
  ANOMALIE=0
  echo_titre "Épreuve du site"
  for CHEMIN in / /rdv.html /photovoltaique.html /app.js /lib/attribution-capture.mjs; do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE$CHEMIN" || echo 000)
    if [ "$CODE" = "200" ]; then ok "$CHEMIN" "code $CODE"; else nok "$CHEMIN" "code $CODE"; fi
  done
  for CHEMIN in /server.mjs /data/leads.json /lib/crm-sync.mjs /.env; do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE$CHEMIN" || echo 000)
    if [ "$CODE" = "404" ]; then ok "$CHEMIN refusé" "code $CODE"; else nok "$CHEMIN refusé" "code $CODE"; fi
  done
  echo
  if [ "$ANOMALIE" = "0" ]; then
    printf '  Site conforme. Interrupteur toujours coupé : rien ne part vers le CRM.\n\n'
  else
    printf '  ANOMALIE. Retour arrière :\n    sh %s --retour\n\n' "$(basename "$0")"
    return 1
  fi
}

retour() {
  printf '\n  Remise en place de %s.\n' "$SAUVEGARDE"
  printf '  Tapez « revenir en arriere » pour continuer : '
  read -r REPONSE
  [ "$REPONSE" = "revenir en arriere" ] || { printf '\n  Abandon.\n\n'; exit 1; }
  $SSH "$HOTE" "sudo test -f '$SAUVEGARDE/index.html' \
    && sudo rsync -a --delete '$SAUVEGARDE/' '$DISTANT/' \
    && sudo systemctl restart mkl-energies \
    && sudo systemctl --no-pager is-active mkl-energies" | sed 's/^/    /'
  eprouver
}

case "${1:-}" in
  --controles) controles ;;
  --simuler)   controles || true; simuler ;;
  --deployer)  deployer ;;
  --eprouver)  eprouver ;;
  --retour)    retour ;;
  *)
    printf '\n  Usage :\n'
    printf '    %s --controles   contrôles, sans aucun accès SSH\n' "$(basename "$0")"
    printf '    %s --simuler     montre ce qui changerait, sans écrire\n' "$(basename "$0")"
    printf '    %s --deployer    sauvegarde, puis déploie, interrupteur coupé\n' "$(basename "$0")"
    printf '    %s --eprouver    épreuve du site en HTTPS seul\n' "$(basename "$0")"
    printf '    %s --retour      remet la sauvegarde en place\n\n' "$(basename "$0")"
    exit 1 ;;
esac
