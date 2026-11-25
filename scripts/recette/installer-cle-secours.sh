#!/bin/sh
# Installe la clé publique du poste de travail sur le VPS, depuis le système
# de secours d'OVH.
#
#   sh scripts/recette/installer-cle-secours.sh
#
# Le mot de passe temporaire du secours est demandé par SSH lui-même, une
# seule fois, et ne transite pas par ce script.
#
# Trois principes :
#   — le disque est identifié par son CONTENU, jamais par son nom. Un
#     /dev/sdb1 supposé serait une supposition ; la présence de etc/passwd et
#     de var/www/mkl-energies est une preuve.
#   — il est d'abord monté en LECTURE SEULE. Le passage en écriture n'a lieu
#     qu'après identification du bon disque et du bon compte.
#   — un seul fichier est écrit : authorized_keys. En cas d'ambiguïté sur le
#     compte, le script s'arrête et rend compte, plutôt que de deviner.

set -eu

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
IP="${OVH_IP:-148.113.149.139}"
CLE_PUB="$HOME/.ssh/mkl_ovh.pub"

arret() { printf '\n  %s\n\n' "$1" >&2; exit 2; }

[ -f "$CLE_PUB" ] || arret "Clé publique absente : $CLE_PUB"
CLE="$(cat "$CLE_PUB")"
case "$CLE" in
  ssh-ed25519\ *) ;;
  *) arret "Le fichier ne contient pas une clé publique ed25519." ;;
esac

DOSSIER="$(mktemp -d "${TMPDIR:-/tmp}/mkl-secours.XXXXXX")"
PRISE="$DOSSIER/prise"
fermer() {
  ssh -o ControlPath="$PRISE" -O exit "root@$IP" >/dev/null 2>&1 || true
  rm -rf "$DOSSIER"
}
trap fermer EXIT INT TERM

printf '\n  Installation de la clé SSH depuis le mode secours\n'
printf '  ────────────────────────────────────────────────\n'
printf '  Empreinte de la clé qui sera installée :\n'
ssh-keygen -lf "$CLE_PUB" | sed 's/^/      /'
printf '\n  Saisissez le mot de passe temporaire reçu d OVH (invisible).\n\n'

# Le système de secours est un autre système, avec une autre identité : le
# contrôle d'empreinte est désactivé pour cette session temporaire, et aucune
# empreinte n'est enregistrée.
ssh -M -N -f \
    -o ControlPath="$PRISE" \
    -o UserKnownHostsFile=/dev/null \
    -o StrictHostKeyChecking=no \
    -o NumberOfPasswordPrompts=2 \
    -o ConnectTimeout=20 \
    "root@$IP" \
  || arret "Connexion au système de secours refusée. Rien n'a été tenté."

printf '\n  ✓ Connecté au système de secours.\n'

ssh -o ControlPath="$PRISE" "root@$IP" "sh -s '$CLE'" \
  < "$RACINE/scripts/recette/secours-distant.sh"
