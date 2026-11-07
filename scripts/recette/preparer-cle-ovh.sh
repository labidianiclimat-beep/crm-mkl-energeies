#!/bin/sh
# Crée la paire de clés SSH du VPS OVH, à l'emplacement que le script de
# déploiement du site attend déjà : ~/.ssh/mkl_ovh
#
#   sh scripts/recette/preparer-cle-ovh.sh
#
# La clé privée ne quitte jamais ce poste. Seule la clé publique, affichée à
# la fin, sera copiée sur le serveur. Une phrase de passe est exigée : sans
# elle, la simple copie du fichier suffirait à prendre la main sur le VPS.
#
# Rien n'est envoyé sur le réseau, et le serveur n'est pas contacté.

set -eu

CLE="$HOME/.ssh/mkl_ovh"

arret() { printf '\n  %s\n\n' "$1" >&2; exit 2; }

if [ -e "$CLE" ] || [ -e "$CLE.pub" ]; then
  arret "Une clé existe déjà en $CLE : rien n'a été touché."
fi

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

printf '\n  Création de la clé SSH du VPS OVH\n'
printf '  ─────────────────────────────────\n'
printf '  Choisissez une phrase de passe. Elle protège la clé sur ce disque ;\n'
printf '  elle ne sera demandée qu une fois par session grâce au trousseau.\n'
printf '  La saisie reste invisible.\n\n'

# Ed25519 : clé courte, rapide, et sans les réglages de taille qu'un RSA
# impose de ne pas se tromper.
ssh-keygen -t ed25519 -a 100 -f "$CLE" -C "mkl-ovh-$(date +%Y%m%d)"

chmod 600 "$CLE"
chmod 644 "$CLE.pub"

# Le trousseau macOS retient la phrase de passe : les déploiements suivants
# n'auront plus à la demander.
ssh-add --apple-use-keychain "$CLE" 2>/dev/null || ssh-add -K "$CLE" 2>/dev/null || true

printf '\n  ✓ Clé créée. Empreinte :\n'
ssh-keygen -lf "$CLE.pub" | sed 's/^/      /'

printf '\n  Clé PUBLIQUE à copier sur le serveur — cette ligne n est pas un secret :\n'
printf '  ─────────────────────────────────────────────────────────────────────\n'
cat "$CLE.pub"
printf '  ─────────────────────────────────────────────────────────────────────\n'
printf '\n  La clé privée reste dans %s, en droits 600.\n' "$CLE"
printf '  Ne la copiez nulle part, et ne la collez jamais dans une conversation.\n\n'
