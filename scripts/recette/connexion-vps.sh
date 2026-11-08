#!/bin/sh
# Diagnostic de connexion au VPS OVH, puis enchaînement du test réseau.
#
#   sh scripts/recette/connexion-vps.sh "ubuntu debian root" <adresse-recette>
#
# À quoi cela sert : un refus « Permission denied » ne dit pas si le mot de
# passe est faux ou si le compte visé n'est pas le bon. Ce script essaie les
# comptes plausibles, un seul essai chacun, et s'arrête au premier qui ouvre.
#
# Le serveur n'accorde qu'une tentative de mot de passe par connexion, et une
# protection anti-intrusion bannit généralement l'adresse après quelques
# échecs. Le nombre d'essais est donc volontairement plafonné : mieux vaut
# passer par le mode secours d'OVH que se faire bloquer l'accès réseau.
#
# Rien n'est écrit sur le serveur, et aucun mot de passe ne transite par ce
# script : c'est SSH lui-même qui le demande, à chaque tentative.

set -u

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
IP="${OVH_IP:-148.113.149.139}"
COMPTES="${1:-ubuntu debian root admin}"
URL="${2:-}"
PLAFOND="${MKL_ESSAIS_MAX:-4}"

DOSSIER="$(mktemp -d "${TMPDIR:-/tmp}/mkl-ssh.XXXXXX")"
PRISE="$DOSSIER/prise"
HOTE=""

fermer() {
  [ -n "$HOTE" ] && ssh -o ControlPath="$PRISE" -O exit "$HOTE" >/dev/null 2>&1
  rm -rf "$DOSSIER"
}
trap fermer EXIT INT TERM

printf '\n  Recherche du bon compte sur %s\n' "$IP"
printf '  ───────────────────────────────────────────────\n'
printf '  Le serveur n accorde qu un seul essai de mot de passe par connexion.\n'
printf '  Un essai par compte, %s au plus, pour ne pas risquer un bannissement.\n' "$PLAFOND"
printf '  Le même mot de passe est à saisir à chaque invite.\n\n'

ESSAIS=0
for COMPTE in $COMPTES; do
  if [ "$ESSAIS" -ge "$PLAFOND" ]; then
    printf '  Plafond d essais atteint : arrêt volontaire.\n'
    break
  fi
  ESSAIS=$((ESSAIS + 1))
  printf '  Essai %s — compte « %s » :\n' "$ESSAIS" "$COMPTE"

  # Les clés publiques sont écartées : il n'y en a aucune, et la tentative
  # consommerait l'unique essai que le serveur accorde. La sortie de SSH n'est
  # pas redirigée : l'invite de mot de passe doit rester sur le terminal.
  ssh -M -N -f \
      -o ControlPath="$PRISE" \
      -o PubkeyAuthentication=no \
      -o PreferredAuthentications=password \
      -o NumberOfPasswordPrompts=1 \
      -o ConnectTimeout=20 \
      -o StrictHostKeyChecking=accept-new \
      "$COMPTE@$IP"

  if ssh -o ControlPath="$PRISE" -O check "$COMPTE@$IP" >/dev/null 2>&1; then
    HOTE="$COMPTE@$IP"
    printf '\n  ✓ Connexion ouverte avec le compte « %s ».\n' "$COMPTE"
    break
  fi
  printf '      refusé\n\n'
done

if [ -z "$HOTE" ]; then
  printf '\n  Aucun des comptes essayés n accepte ce mot de passe.\n'
  printf '  Deux lectures possibles, et une seule façon de trancher :\n'
  printf '    — le mot de passe retrouvé ne correspond pas à ce serveur ;\n'
  printf '    — ou le compte réel porte un autre nom.\n'
  printf '  N insistez pas davantage : au-delà de quelques échecs, la protection\n'
  printf '  anti-intrusion du serveur bannit cette adresse réseau.\n'
  printf '  La voie sûre reste le mode secours d OVH, décrit dans Cursor.\n\n'
  exit 3
fi

printf '  Compte identifié : %s\n' "$HOTE"

if [ -z "$URL" ]; then
  printf '\n  Aucune adresse de test fournie : rien d autre ne sera fait.\n'
  printf '  Relancez avec l adresse du déploiement RECETTE en second argument.\n\n'
  exit 0
fi

printf '\n  Enchaînement du test réseau, sur cette même connexion.\n'
OVH_HOST="$HOTE" MKL_SSH_PRISE="$PRISE" sh "$RACINE/scripts/recette/test-depuis-vps.sh" "$URL"
