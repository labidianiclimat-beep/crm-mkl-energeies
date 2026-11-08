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

# `data/` n'est PAS déployé, et c'est une décision, pas un oubli.
#
# Une version de ce script y envoyait `data/slots.js` et `data/realisations.js`.
# Or ces deux fichiers n'ont jamais été versionnés : le dépôt n'en contient que
# des bouchons, écrits pour rendre `server.mjs` démarrable pendant les essais, et
# tenus hors de Git précisément pour ne pouvoir jamais être déployés. Les nommer
# ici contournait cette protection. Les déployer aurait remplacé les vrais
# créneaux de rendez-vous par un bouchon de 59 lignes, et les 77 lignes de
# réalisations par 20 — la page de prise de rendez-vous et le portfolio du site.
# Et la simulation ne le montrait pas, parce qu'elle ne couvrait pas cette
# quatrième copie.
#
# La source de vérité de `data/` est le serveur, pas le dépôt. Le seul fichier
# de données que ce script déploie est `site-public/data/catalogue-radiateurs.js`,
# qui est versionné et part avec les pages publiques.
echo_titre() { printf '\n  %s\n\n' "$1"; }
ok()   { printf '    ✓ %-44s %s\n' "$1" "${2:-}"; }
nok()  { printf '    ✗ %-44s %s\n' "$1" "${2:-}"; ANOMALIE=1; }

# ---------------------------------------------------------------------------
# Les transferts, définis une seule fois.
#
# La simulation et le déploiement appelaient chacun leur propre suite de
# `rsync`. Ils avaient divergé : le déploiement écrivait une quatrième copie
# que la simulation ne montrait pas. Une simulation qui ne couvre pas tout ce
# que le déploiement écrit est pire qu'absente, puisqu'elle rassure. Les deux
# passent donc maintenant par ici, et ne peuvent plus différer que par les
# drapeaux passés à rsync.
#
# `-c` compare les empreintes et non les horodatages : un fichier de même
# taille mais de contenu différent serait sinon transféré sans être signalé.
# ---------------------------------------------------------------------------
transferts() {
  DRAPEAUX="$1"
  # shellcheck disable=SC2086
  rsync $DRAPEAUX --no-perms --omit-dir-times --exclude 'LISEZ-MOI.md' -e "$SSH" \
    "$RACINE/site-public/" "$HOTE:$DISTANT/"
  # shellcheck disable=SC2086
  (cd "$RACINE" && rsync $DRAPEAUX --no-perms --omit-dir-times -e "$SSH" \
    $FICHIERS_SERVEUR "$HOTE:$DISTANT/")
  # shellcheck disable=SC2086
  rsync $DRAPEAUX --no-perms --omit-dir-times -e "$SSH" \
    "$RACINE/lib/" "$HOTE:$DISTANT/lib/" | sed 's|^\(......... \)|\1lib/|'
}

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

  # Ce contrôle porte sur l'environnement LOCAL, et son intitulé doit le dire.
  # Tant qu'il annonçait « interrupteur coupé » tout court, il laissait croire
  # qu'il avait regardé le serveur — ce qu'il ne fait pas, et ne peut pas faire
  # ici : `--controles` est documenté comme n'ouvrant aucune connexion SSH. Il a
  # donc affirmé « coupé » le 7 novembre 2026 alors que la liaison venait
  # d'être ouverte en production. L'état réel du serveur se lit par
  # `ouvrir-liaison-crm.sh --controles`, qui, lui, va le chercher.
  if [ "${CRM_SYNC_ENABLED:-}" = "1" ]; then
    nok "aucun envoi depuis ce poste" "CRM_SYNC_ENABLED=1 dans cet environnement local"
  else
    ok "aucun envoi depuis ce poste" "variable locale absente"
  fi

  # Le contrôle le plus important, et celui qui a servi. Le dépôt n'est pas
  # seulement d'une disposition différente : pour trois fichiers, il est d'une
  # génération ANTÉRIEURE à la production. Relevé le 7 novembre 2026 :
  # `server.mjs` du dépôt supprimerait 272 lignes vivantes, dont les routes
  # `/api/admin/forgot-password` et `/api/admin/change-password`, leurs deux
  # gestionnaires, `destroyAllSessions` et le courriel de réinitialisation.
  # `admin.js` en perdrait 159. Ces fonctionnalités ont été déployées
  # directement sur le serveur les 3 et 4 novembre et ne sont jamais revenues
  # au dépôt. Les écraser serait une régression de sécurité silencieuse.
  #
  # Le contrôle compare fichier par fichier, en lecture seule par SSH.
  #
  # Il compare les CAPACITÉS, non les lignes. Une première version comptait les
  # lignes retirées : elle a bien arrêté la régression du 7 novembre, mais elle
  # condamnait aussi tout remaniement. Le report de l attribution remplace par
  # exemple un `serveStatic` écrit à la main par un appel au module durci, et
  # trois écritures non verrouillées par le stockage à verrou : soixante-six
  # lignes de moins, pas une capacité perdue. Compter les lignes aurait forcé à
  # désarmer le garde-fou pour déployer — c est-à-dire à le perdre le jour où
  # il sert.
  #
  # Sont donc relevés les noms de fonctions et les chemins de routes présents
  # en production. Si l un manque au dépôt, le déploiement est refusé : c est
  # exactement ce qui se serait produit le 7 novembre, où
  # `handleAdminForgotPassword`, `handleAdminChangePassword` et
  # `destroyAllSessions` auraient disparu avec leurs deux routes.
  # Retraits délibérés. Une fonction ne disparaît jamais par accident sans
  # laisser son nom ici, avec sa raison. C est volontairement pénible : le prix
  # d un retrait est une ligne écrite à la main, et une route ne s exempte
  # jamais — une route est une capacité visible par l utilisateur.
  EXEMPTEES=$(cat <<'FIN'
fonction safePath
fonction writeJsonArray
FIN
)
  # safePath       : remplacée par `lib/public-static.mjs`, qui refuse en plus
  #                  les chemins privés au lieu de les servir.
  # writeJsonArray : remplacée par le stockage à verrou de `lib/json-store.mjs`.
  #                  Sa dernière écriture non verrouillée pouvait perdre une
  #                  demande arrivée pendant une mise à jour de statut.

  capacites() {
    # Deux familles : `function nom(` sous toutes ses formes, et les chemins
    # littéraux comparés ou testés dans le routage.
    {
      grep -oE '^\s*(export +)?(async +)?function +[A-Za-z_$][A-Za-z0-9_$]*' "$1" \
        | grep -oE '[A-Za-z_$][A-Za-z0-9_$]*$' | sed 's/^/fonction /'
      grep -oE '"/api/[A-Za-z0-9_/-]*"' "$1" | tr -d '"' | sed 's/^/route /'
    } | sort -u
  }
  TEMPO=$(mktemp -d)
  PERTES=0
  for COUPLE in "server.mjs:server.mjs" "admin.js:admin.js" "lib/admin-auth.mjs:lib/admin-auth.mjs"; do
    LOCAL="${COUPLE%%:*}"
    REMOTE="${COUPLE##*:}"
    if scp -q -o BatchMode=yes -o IdentitiesOnly=yes ${CLE:+-i "$CLE"} \
         "$HOTE:$DISTANT/$REMOTE" "$TEMPO/ref" 2>/dev/null; then
      capacites "$TEMPO/ref" > "$TEMPO/avant"
      capacites "$RACINE/$LOCAL" > "$TEMPO/apres"
      # `comm -23` : présent en production, absent du dépôt. Les retraits
      # déclarés sont écartés ensuite, jamais avant : ainsi la liste
      # d exemptions ne peut pas masquer une route.
      printf '%s\n' "$EXEMPTEES" | grep . | sort -u > "$TEMPO/exemptees"
      comm -23 "$TEMPO/avant" "$TEMPO/apres" | grep . | sort -u > "$TEMPO/brutes"
      MANQUANTES=$(comm -23 "$TEMPO/brutes" "$TEMPO/exemptees")
      DECLAREES=$(comm -12 "$TEMPO/brutes" "$TEMPO/exemptees" | grep -c . || true)
      NB=$(printf '%s' "$MANQUANTES" | grep -c . || true)
      if [ "${NB:-0}" -gt 0 ]; then
        nok "$LOCAL garde tout ce que la production sert" "$NB capacite(s) PERDUE(S)"
        printf '%s\n' "$MANQUANTES" | sed 's/^/           perdue : /'
        PERTES=$((PERTES + 1))
      else
        AJOUTS=$(comm -13 "$TEMPO/avant" "$TEMPO/apres" | grep -c . || true)
        DETAIL="+${AJOUTS:-0} nouvelle(s)"
        [ "${DECLAREES:-0}" -eq 0 ] || DETAIL="$DETAIL, $DECLAREES retrait(s) declare(s)"
        ok "$LOCAL garde tout ce que la production sert" "$DETAIL"
      fi
    else
      nok "$LOCAL comparé à la production" "lecture impossible"
    fi
  done
  rm -rf "$TEMPO"
  if [ "$PERTES" -gt 0 ]; then
    printf '\n  Le dépôt est, pour ces fichiers, antérieur à la production : il ne\n'
    printf '  sait plus faire quelque chose que le serveur fait aujourd hui. Il faut\n'
    printf '  d abord y rapatrier les versions en service, puis y reporter\n'
    printf '  l attribution. Déployer en l état perdrait du travail.\n'
  fi

  # Un fichier qui se déclare non déployable ne doit pas pouvoir partir. Les
  # bouchons de `data/` portaient cette mention en tête et ont failli être
  # déployés quand même, parce qu'ils étaient nommés explicitement. Le contrôle
  # porte donc sur ce qui part réellement, et non sur une liste tenue à la main.
  INTERDITS=$(
    { find "$RACINE/site-public" "$RACINE/lib" -type f 2>/dev/null
      for F in $FICHIERS_SERVEUR; do printf '%s\n' "$RACINE/$F"; done
    } | xargs grep -l 'NE PAS DÉPLOYER' 2>/dev/null || true
  )
  if [ -n "$INTERDITS" ]; then
    nok "aucun fichier marqué non déployable" "$(printf '%s\n' "$INTERDITS" | grep -c .) trouvé(s)"
    printf '%s\n' "$INTERDITS" | sed "s|$RACINE/|           |"
  else
    ok "aucun fichier marqué non déployable"
  fi

  echo
  [ "$ANOMALIE" = "0" ] || { printf '  Un contrôle a échoué. Rien ne sera déployé.\n\n'; return 1; }
  printf '  Contrôles réunis.\n\n'
}

# ---------------------------------------------------------------------------
# Simulation. Montre les écritures et, surtout, les suppressions qu'un
# `--delete` ferait — sans en faire aucune.
#
# `-c` compare les empreintes et non les horodatages. Sans lui, la simulation
# annonçait une trentaine de fichiers « à transférer » qui n'étaient que des
# dates à rafraîchir, et noyait les trois vrais changements. Pire, un fichier
# de même taille mais de contenu différent aurait été transféré sans être
# signalé comme modifié : on aurait écrasé en croyant ne rien faire. C'est
# précisément le piège qui a caché pendant quatre jours que le dépôt était en
# retard sur la production. Le déploiement l'emploie aussi, pour n'écrire que
# ce qui change réellement.
# ---------------------------------------------------------------------------
simuler() {
  echo_titre "Simulation — aucune écriture"

  # Résumé en clair avant le détail. Les codes de rsync — `<fcst....`,
  # `<f+++++++`, `.f..t....` — ne se lisent pas sans mode d emploi : un `<` en
  # tête annonce un transfert, un point annonce qu il n y en aura pas. Qui lit
  # cette sortie avant de déployer doit voir d abord combien de fichiers
  # changent, et lesquels.
  resume() {
    printf '  Ce que le déploiement écrirait réellement :\n'
    CHANGES=$(transferts "-naizc" | grep '^<f' || true)
    NOUVEAUX=$(printf '%s\n' "$CHANGES" | grep -c '^<f+++' || true)
    MODIFIES=$(printf '%s\n' "$CHANGES" | grep '^<f' | grep -vc '^<f+++' || true)
    printf '%s\n' "$CHANGES" | grep '^<f+++' | awk '{print "    nouveau  " $2}' || true
    printf '%s\n' "$CHANGES" | grep '^<f' | grep -v '^<f+++' | awk '{print "    modifié  " $2}' || true
    printf '    soit %s nouveau(x) et %s modifié(s). Aucune suppression.\n\n' \
      "${NOUVEAUX:-0}" "${MODIFIES:-0}"
  }
  resume

  printf '  Détail, au format de rsync. Un « < » en tête annonce un transfert,\n'
  printf '  un « . » annonce qu il n y en aura pas — seule la date change.\n\n'
  transferts "-naizc" | sed 's/^/    /'
  printf '\n  Rien d autre ne part : ni data/, ni assets/, ni les dépendances.\n'

  # Orphelins : fichiers encore servis par le serveur que le dépôt ne connaît
  # plus. Une page retirée du site, un module renommé.
  #
  # La comparaison est restreinte aux surfaces que le déploiement gère. Une
  # première version comparait `site-public/` à toute la racine distante : elle
  # annonçait plus de mille orphelins, dont `server.mjs`, `lib/`, `assets/`,
  # `data/leads.json` et `.env`, en invitant à « décider vous-même ». C était
  # faux et dangereux — suivre cette liste aurait effacé le site et les
  # demandes des clients. Le dépôt n est pas un miroir du serveur : les images,
  # les dépendances, les fichiers d infrastructure et les données vivantes
  # n ont jamais vocation à y figurer, et ne sont donc pas des orphelins.
  printf '\n  Fichiers encore servis que le dépôt ne connaît plus.\n'
  printf '  AUCUN n est supprimé par ce script. La comparaison ne porte que sur\n'
  printf '  ce que le déploiement gère : pages publiques et modules de lib/.\n'
  ORPHELINS=0

  # Pages publiques, à la racine distante. Tout ce que le dépôt ne mirroite
  # pas délibérément est écarté : données vivantes, images, dépendances,
  # fichiers d infrastructure, et les fichiers serveur poussés nommément.
  PAGES=$(rsync -naizc --delete --no-perms --omit-dir-times -e "$SSH" \
    --exclude 'LISEZ-MOI.md' \
    --exclude 'data/' --exclude 'assets/' --exclude 'node_modules/' \
    --exclude 'lib/' --exclude 'proofs/' --exclude '.well-known/' \
    --exclude 'server.mjs' --exclude 'admin.js' \
    --exclude 'admin.html' --exclude 'admin.css' \
    --exclude 'package.json' --exclude 'package-lock.json' \
    --exclude 'Dockerfile' --exclude 'Procfile' --exclude 'render.yaml' \
    --exclude 'vite.config.ts' --exclude 'tsconfig*.json' \
    --exclude '.env' --exclude '.env.example' \
    --exclude '.dockerignore' --exclude '.gitignore' --exclude 'README.md' \
    "$RACINE/site-public/" "$HOTE:$DISTANT/" \
    | grep '^\*deleting' | sed 's/^\*deleting /pages : /' || true)

  # `lib/` est, lui, un vrai miroir : le dépôt y est la référence.
  MODULES=$(rsync -naizc --delete --no-perms --omit-dir-times -e "$SSH" \
    "$RACINE/lib/" "$HOTE:$DISTANT/lib/" \
    | grep '^\*deleting' | sed 's/^\*deleting /lib   : /' || true)

  TOUS=$(printf '%s\n%s\n' "$PAGES" "$MODULES" | grep . || true)
  if [ -n "$TOUS" ]; then
    printf '%s\n' "$TOUS" | sed 's/^/    /'
    ORPHELINS=$(printf '%s\n' "$TOUS" | grep -c .)
    printf '\n  %s orphelin(s). À vous de décider : ce script n y touche pas.\n' "$ORPHELINS"
  else
    printf '    (aucun)\n'
  fi
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
  # Ce script ne touche pas à l'interrupteur, ni pour l'ouvrir ni pour le
  # fermer : il ne déploie que du code, et le redémarrage relit le fichier de
  # variables tel qu'il est. Il affirmait « interrupteur coupé » — vrai jusqu au
  # 7 novembre 2026, faux dès l'ouverture, et ce genre de phrase est pire
  # qu'absente : on déploierait en croyant le robinet fermé.
  printf '  Ce passage ne met en place que du code. Il ne touche pas à\n'
  printf '  l interrupteur : le redémarrage le laisse tel qu il est, ouvert ou\n'
  printf '  fermé. Son état se lit par ouvrir-liaison-crm.sh --controles.\n\n'
  printf '  Tapez « deployer le site » pour continuer : '
  read -r REPONSE
  [ "$REPONSE" = "deployer le site" ] || { printf '\n  Abandon. Rien n a été déployé.\n\n'; exit 1; }

  printf '\n  Sauvegarde…\n'
  $SSH "$HOTE" "sudo cp -a '$DISTANT' '$SAUVEGARDE' && sudo test -f '$SAUVEGARDE/index.html' && echo '    copie faite'"

  # Exactement les mêmes transferts que la simulation, à un drapeau près.
  # `LISEZ-MOI.md` est exclu dans `transferts` : c'est une note de travail qui,
  # déployée, serait servie publiquement — aucun refus nginx ne la couvre, seul
  # « README.md » est nommé.
  printf '\n  Envoi…\n'
  transferts "-azci" | sed 's/^/    /'

  printf '\n  Redémarrage…\n'
  $SSH "$HOTE" "sudo systemctl restart mkl-energies && sudo systemctl --no-pager is-active mkl-energies" | sed 's/^/    /'

  printf '\n'
  eprouver apres
}

# ---------------------------------------------------------------------------
# Épreuve. Uniquement en HTTPS : ce que voit un visiteur.
# ---------------------------------------------------------------------------
eprouver() {
  ANOMALIE=0
  # Le module de capture n'est attendu qu'après le déploiement. Avant, son
  # absence est l'état normal, et la signaler comme une anomalie ferait crier
  # au loup : l'épreuve perdrait toute valeur d'alerte.
  ATTENDU_APRES="${1:-}"
  echo_titre "Épreuve du site"
  for CHEMIN in / /rdv.html /photovoltaique.html /pompe-a-chaleur.html /app.js /styles.css /admin.html; do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE$CHEMIN" || echo 000)
    if [ "$CODE" = "200" ]; then ok "$CHEMIN" "code $CODE"; else nok "$CHEMIN" "code $CODE"; fi
  done

  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE/lib/attribution-capture.mjs" || echo 000)
  if [ "$ATTENDU_APRES" = "apres" ]; then
    if [ "$CODE" = "200" ]; then ok "/lib/attribution-capture.mjs" "code $CODE"
    else nok "/lib/attribution-capture.mjs" "code $CODE"; fi
  else
    printf '    · %-44s %s\n' "/lib/attribution-capture.mjs" "code $CODE — pas encore déployé, normal"
  fi
  # Chaque import statique de `app.js` doit se résoudre.
  #
  # C'est le contrôle qui manquait. Après le déploiement, `app.js` répondait
  # 200 et chaque page aussi, mais `/lib/attribution-capture.mjs` répondait 404
  # parce qu'une règle nginx antérieure n'autorisait dans `/lib/` que les deux
  # modules publics de l'époque. Un import statique en échec fait échouer tout
  # le module : le JavaScript du site était mort, sans qu'aucun code HTTP ne le
  # dise. Les imports sont relevés dans le fichier lui-même, et non recopiés
  # ici, pour qu'un import ajouté demain soit contrôlé sans qu'on y pense.
  for IMPORT in $(grep -oE 'from "\./[A-Za-z0-9._/-]+"' "$RACINE/site-public/app.js" \
                    | sed 's|from "\./||; s|"$||' | sort -u); do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE/$IMPORT" || echo 000)
    if [ "$CODE" = "200" ]; then ok "app.js importe /$IMPORT" "code $CODE"
    else nok "app.js importe /$IMPORT" "code $CODE — le JS du site serait mort"; fi
  done

  for CHEMIN in /server.mjs /data/leads.json /lib/crm-sync.mjs /.env \
                /deploy/ovh/deploy.sh /scripts/hash-admin-password.mjs; do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE$CHEMIN" || echo 000)
    if [ "$CODE" = "404" ]; then ok "$CHEMIN refusé" "code $CODE"; else nok "$CHEMIN refusé" "code $CODE"; fi
  done
  echo
  if [ "$ANOMALIE" = "0" ]; then
    printf '  Site conforme. L interrupteur n a pas été touché : il est resté\n'
    printf '  tel qu il était avant ce passage.\n\n'
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
  # Le module de capture est maintenant en service : son absence est une
  # anomalie, plus un état d'attente. Seul le retour arrière, qui remet la
  # version d'avant, l'attend absent.
  --eprouver)  eprouver apres ;;
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
