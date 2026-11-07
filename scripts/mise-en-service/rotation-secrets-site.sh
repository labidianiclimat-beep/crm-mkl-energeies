#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Rotation de SESSION_SECRET et ADMIN_PASSWORD_HASH sur mkl-energies.fr
#
# Pourquoi. Ces deux secrets ont été exposés publiquement du 31 octobre au
# 7 novembre 2026, par le dossier `deploy/` servi dans la racine web. Les
# journaux nginx, qui couvrent toute la période, montrent qu'aucune adresse
# extérieure ne les a obtenus : les six robots qui ont cherché n'ont demandé
# que `/deploy/.env` et `/scripts/.env`, qui n'existaient pas. La rotation
# n'est donc pas une urgence, mais elle coûte peu au regard de ce qu'elle
# écarte définitivement.
#
# Ce que la rotation fait, et ce qu'elle casse. `SESSION_SECRET` signe les
# cookies d'administration : le changer **déconnecte les sessions ouvertes**.
# `ADMIN_PASSWORD_HASH` est votre mot de passe d'administration du site : le
# changer le remplace. Rien d'autre n'est touché — ni le CRM, ni les données
# clients, ni les formulaires, ni Google.
#
# Le mot de passe ne traverse jamais ni l'historique du shell, ni la liste des
# processus, ni un fichier. Le script existant, `hash-admin-password.mjs`, le
# prenait en argument de ligne de commande : il atterrissait donc dans les
# deux premiers. Ici il est lu à l'aveugle, puis transmis par l'entrée
# standard d'une session SSH chiffrée, et hachée sur place.
#
#   sh rotation-secrets-site.sh --controles   état actuel, sans rien changer
#   sh rotation-secrets-site.sh --tourner     sauvegarde, rotation, épreuve
#   sh rotation-secrets-site.sh --retour      remet la sauvegarde précédente
# ---------------------------------------------------------------------------
set -eu

HOTE="${OVH_HOST:-ubuntu@148.113.149.139}"
DISTANT="${OVH_DIR:-/var/www/mkl-energies}"
ARCHIVE="${OVH_ENV_ARCHIVE:-/home/ubuntu/archives-env}"
CLE="${OVH_SSH_KEY:-$HOME/.ssh/mkl_ovh}"
SITE="https://mkl-energies.fr"

distant() {
  ssh -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=20 -i "$CLE" "$HOTE" "$@"
}

ok()  { printf '    ✓ %-46s %s\n' "$1" "${2:-}"; }
nok() { printf '    ✗ %-46s %s\n' "$1" "${2:-}"; ANOMALIE=1; }

controles() {
  ANOMALIE=0
  printf '\n  État avant rotation\n\n'

  ETAT=$(distant "systemctl is-active mkl-energies" 2>/dev/null || echo inconnu)
  [ "$ETAT" = "active" ] && ok "le service tourne" "$ETAT" || nok "le service tourne" "$ETAT"

  # Seuls les NOMS des variables sont relevés. Aucune valeur n'est lue.
  NOMS=$(distant "sudo cut -d= -f1 '$DISTANT/.env' 2>/dev/null | grep -E '^[A-Z_]+$' | sort | tr '\n' ' '" || echo "")
  case "$NOMS" in
    *SESSION_SECRET*ADMIN_PASSWORD_HASH*|*ADMIN_PASSWORD_HASH*SESSION_SECRET*)
      ok "les deux secrets sont présents" "$(echo "$NOMS" | wc -w | tr -d ' ') variables" ;;
    *) nok "les deux secrets sont présents" "relevé : $NOMS" ;;
  esac

  DROITS=$(distant "stat -c %a '$DISTANT/.env'" 2>/dev/null || echo "?")
  [ "$DROITS" = "600" ] && ok "le fichier reste privé" "droits $DROITS" \
                        || nok "le fichier reste privé" "droits $DROITS"

  HACHE=$(distant "sudo grep -c '^ADMIN_PASSWORD_HASH=scrypt\\\$' '$DISTANT/.env'" 2>/dev/null || echo 0)
  [ "$HACHE" = "1" ] && ok "le mot de passe est haché en scrypt" \
                     || nok "le mot de passe est haché en scrypt" "motif inattendu"

  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE/admin.html" || echo 000)
  [ "$CODE" = "200" ] && ok "la page d administration répond" "code $CODE" \
                      || nok "la page d administration répond" "code $CODE"

  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE/.env" || echo 000)
  [ "$CODE" = "404" ] && ok "le fichier n est pas servi" "code $CODE" \
                      || nok "le fichier n est pas servi" "code $CODE — ARRÊTEZ TOUT"

  printf '\n'
  [ "$ANOMALIE" = "0" ] || { printf '  Un contrôle a échoué. Rien ne sera changé.\n\n'; return 1; }
  printf '  Contrôles réunis.\n\n'
}

tourner() {
  controles || exit 1

  printf '  La rotation va :\n'
  printf '    · déconnecter les sessions d administration ouvertes ;\n'
  printf '    · remplacer le mot de passe d administration du site.\n'
  printf '  Elle ne touche ni au CRM, ni aux données clients, ni aux formulaires.\n\n'

  # Lecture à l'aveugle, deux fois. Jamais affiché, jamais en argument.
  printf '  Nouveau mot de passe d administration (invisible) : '
  stty -echo 2>/dev/null || true
  read -r MDP
  stty echo 2>/dev/null || true
  printf '\n  Répétez-le : '
  stty -echo 2>/dev/null || true
  read -r MDP2
  stty echo 2>/dev/null || true
  printf '\n\n'

  [ "$MDP" = "$MDP2" ] || { printf '  Les deux saisies diffèrent. Rien n a changé.\n\n'; exit 1; }
  if [ "${#MDP}" -lt 12 ]; then
    printf '  Trop court : douze caractères au moins. Rien n a changé.\n\n'
    exit 1
  fi
  unset MDP2

  printf '  Sauvegarde et rotation…\n'
  # Le mot de passe part par l'entrée standard. Le programme distant le lit,
  # le hache, et réécrit le fichier de façon atomique en ne remplaçant que les
  # deux lignes concernées : tout le reste, commentaires compris, est conservé.
  printf '%s' "$MDP" | distant "sudo -n true 2>/dev/null; bash -s" <<PROGRAMME
set -eu
mkdir -p '$ARCHIVE' && chmod 700 '$ARCHIVE'
HORO=\$(date -u +%Y%m%dT%H%M%SZ)
sudo cp -a '$DISTANT/.env' '$ARCHIVE/env-avant-rotation-\$HORO'
sudo chown ubuntu:ubuntu '$ARCHIVE/env-avant-rotation-'\$HORO
sudo chmod 600 '$ARCHIVE/env-avant-rotation-'\$HORO
echo "    sauvegarde : $ARCHIVE/env-avant-rotation-\$HORO"

cd '$DISTANT'
sudo -u ubuntu node --input-type=module -e '
import { readFileSync, writeFileSync, renameSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { hashPassword } from "/var/www/mkl-energies/lib/admin-auth.mjs";

const mdp = readFileSync(0, "utf8");
if (!mdp || mdp.length < 12) { console.error("    mot de passe illisible"); process.exit(1); }

const hache = hashPassword(mdp);
const secret = randomBytes(32).toString("base64url");
const chemin = "/var/www/mkl-energies/.env";
const lignes = readFileSync(chemin, "utf8").split("\n");

let vuHache = 0, vuSecret = 0;
const sortie = lignes.map(l => {
  if (l.startsWith("ADMIN_PASSWORD_HASH=")) { vuHache++; return "ADMIN_PASSWORD_HASH=" + hache; }
  if (l.startsWith("SESSION_SECRET="))      { vuSecret++; return "SESSION_SECRET=" + secret; }
  return l;
});
if (vuHache !== 1 || vuSecret !== 1) {
  console.error("    attendu une ligne de chaque, trouvé " + vuHache + " et " + vuSecret + ". Rien n a été écrit.");
  process.exit(1);
}
writeFileSync(chemin + ".nouveau", sortie.join("\n"), { mode: 0o600 });
chmodSync(chemin + ".nouveau", 0o600);
renameSync(chemin + ".nouveau", chemin);
console.log("    deux lignes remplacées, " + (sortie.length - 1) + " lignes conservées");
'

sudo systemctl restart mkl-energies
sleep 2
echo "    service : \$(systemctl is-active mkl-energies)"
PROGRAMME

  printf '\n  Épreuve — le nouveau mot de passe est-il accepté ?\n'
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
    -X POST -H 'content-type: application/json' \
    --data-binary @- "$SITE/api/admin/login" <<CORPS || echo 000
{"password": $(printf '%s' "$MDP" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}
CORPS
  )
  unset MDP
  if [ "$CODE" = "200" ]; then
    printf '    ✓ connexion acceptée                             code %s\n' "$CODE"
  else
    printf '    ✗ connexion REFUSÉE                              code %s\n' "$CODE"
    printf '\n  Retour arrière :\n    sh %s --retour\n\n' "$(basename "$0")"
    exit 1
  fi

  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE/" || echo 000)
  printf '    %s le site répond                                 code %s\n' \
    "$([ "$CODE" = 200 ] && echo ✓ || echo ✗)" "$CODE"
  printf '\n  Rotation faite. Les sessions d administration ouvertes sont closes.\n\n'
}

retour() {
  printf '\n  Sauvegardes disponibles :\n'
  distant "sudo ls -1t '$ARCHIVE'/env-avant-rotation-* 2>/dev/null | head -5" | sed 's/^/    /'
  printf '\n  Tapez « revenir en arriere » pour remettre la plus récente : '
  read -r REPONSE
  [ "$REPONSE" = "revenir en arriere" ] || { printf '\n  Abandon.\n\n'; exit 1; }
  distant "bash -s" <<PROGRAMME
set -eu
DERNIERE=\$(sudo ls -1t '$ARCHIVE'/env-avant-rotation-* | head -1)
sudo cp -a "\$DERNIERE" '$DISTANT/.env'
sudo chown ubuntu:ubuntu '$DISTANT/.env'
sudo chmod 600 '$DISTANT/.env'
sudo systemctl restart mkl-energies
sleep 2
echo "    remis : \$DERNIERE"
echo "    service : \$(systemctl is-active mkl-energies)"
PROGRAMME
  printf '\n'
  controles || true
}

case "${1:-}" in
  --controles) controles ;;
  --tourner)   tourner ;;
  --retour)    retour ;;
  *)
    printf '\n  Usage :\n'
    printf '    %s --controles   état actuel, sans rien changer\n' "$(basename "$0")"
    printf '    %s --tourner     sauvegarde, rotation, épreuve\n' "$(basename "$0")"
    printf '    %s --retour      remet la sauvegarde précédente\n\n' "$(basename "$0")"
    exit 1 ;;
esac
