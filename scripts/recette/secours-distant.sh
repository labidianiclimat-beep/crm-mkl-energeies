#!/bin/sh
# Exécuté SUR le système de secours d'OVH, reçu par l'entrée standard.
# Argument unique : la clé publique à installer.
#
# Ce script ne laisse aucun fichier derrière lui : il n'est jamais écrit sur
# le disque, ni celui du secours, ni celui du VPS.

set -u

CLE="${1:-}"
MP=/mnt/vps

echec() { printf '\n  ARRÊT : %s\n\n' "$1" >&2; mountpoint -q "$MP" && umount "$MP"; exit 2; }
titre() { printf '\n  %s\n' "$1"; }
ligne() { printf '    %-34s %s\n' "$1" "$2"; }

[ -n "$CLE" ] || echec "aucune clé publique reçue."

# ---------------------------------------------------------------------------
titre "1. Où suis-je ?"
# ---------------------------------------------------------------------------

SOURCE_RACINE="$(findmnt -n -o SOURCE / 2>/dev/null || echo inconnu)"
ligne "machine" "$(hostname)"
ligne "racine du système démarré" "$SOURCE_RACINE"

# Si le site est présent sur la racine, nous sommes sur le système normal et
# non sur le secours. Écrire dans un système en fonctionnement n'est pas ce
# qui a été demandé.
if [ -d /var/www/mkl-energies ]; then
  echec "le site est présent sur la racine : ce n'est PAS le système de secours."
fi
ligne "système de secours" "confirmé, le disque du VPS n'est pas la racine"

# ---------------------------------------------------------------------------
titre "2. Quel disque porte le système du VPS ?"
# ---------------------------------------------------------------------------

mkdir -p "$MP"
mountpoint -q "$MP" && umount "$MP"

essayer() {
  candidat="$1"
  [ "$candidat" = "$SOURCE_RACINE" ] && return 1
  mount -o ro "$candidat" "$MP" 2>/dev/null || return 1
  if [ -f "$MP/etc/passwd" ] && [ -d "$MP/var/www/mkl-energies" ]; then
    return 0
  fi
  umount "$MP" 2>/dev/null
  return 1
}

DISQUE=""
for DEV in $(lsblk -rpno NAME,TYPE 2>/dev/null | awk '$2=="part"{print $1}'); do
  ligne "partition examinée" "$DEV"
  if essayer "$DEV"; then DISQUE="$DEV"; break; fi
done

# Un disque en LVM ne présente pas de partition montable directement : les
# volumes doivent d'abord être activés.
if [ -z "$DISQUE" ]; then
  ligne "aucune partition directe" "recherche de volumes LVM"
  vgchange -ay >/dev/null 2>&1
  for DEV in $(lvs --noheadings -o lv_path 2>/dev/null); do
    ligne "volume examiné" "$DEV"
    if essayer "$DEV"; then DISQUE="$DEV"; break; fi
  done
fi

[ -n "$DISQUE" ] || echec "aucun disque ne contient à la fois etc/passwd et var/www/mkl-energies."

ligne "disque identifié" "$DISQUE"
ligne "monté" "en lecture seule, sur $MP"
ligne "preuve" "etc/passwd et var/www/mkl-energies présents"

# ---------------------------------------------------------------------------
titre "3. Quel compte doit recevoir la clé ?"
# ---------------------------------------------------------------------------

ligne "propriétaire du site" "$(stat -c '%u:%g' "$MP/var/www/mkl-energies")"

# Comptes capables d'ouvrir une session : un compte de service sans shell ne
# servirait à rien.
CANDIDATS="$(awk -F: '$3>=1000 && $3<65000 && $7 !~ /(nologin|false)/ {print $1":"$3":"$4":"$6}' "$MP/etc/passwd")"
[ -n "$CANDIDATS" ] || echec "aucun compte de connexion trouvé dans $MP/etc/passwd."

MEILLEUR=""
SCORE_MAX=-1
EX_AEQUO=0

for C in $CANDIDATS; do
  NOM="$(echo "$C" | cut -d: -f1)"
  UID_C="$(echo "$C" | cut -d: -f2)"
  FOYER="$(echo "$C" | cut -d: -f4)"
  SCORE=0
  NOTES=""

  # Appartenance à un groupe d'administration : c'est le compte avec lequel on
  # administre réellement la machine.
  if grep -qE "^(sudo|admin|wheel):.*[:,]$NOM(,|$)" "$MP/etc/group" 2>/dev/null; then
    SCORE=$((SCORE + 4)); NOTES="$NOTES administrateur,"
  fi
  # Des clés déjà autorisées signalent le compte habituellement utilisé.
  if [ -f "$MP$FOYER/.ssh/authorized_keys" ]; then
    SCORE=$((SCORE + 2)); NOTES="$NOTES clés déjà présentes,"
  fi
  if [ "$NOM" = "ubuntu" ]; then
    SCORE=$((SCORE + 1)); NOTES="$NOTES compte par défaut d'Ubuntu,"
  fi

  ligne "candidat $NOM (uid $UID_C)" "score $SCORE —${NOTES:- aucun indice}"

  if [ "$SCORE" -gt "$SCORE_MAX" ]; then
    SCORE_MAX="$SCORE"; MEILLEUR="$C"; EX_AEQUO=0
  elif [ "$SCORE" -eq "$SCORE_MAX" ]; then
    EX_AEQUO=1
  fi
done

if [ "$EX_AEQUO" = "1" ] || [ "$SCORE_MAX" -le 0 ]; then
  echec "le compte à retenir est ambigu. Rien n'a été écrit ; indiquez-le moi."
fi

NOM="$(echo "$MEILLEUR" | cut -d: -f1)"
UID_C="$(echo "$MEILLEUR" | cut -d: -f2)"
GID_C="$(echo "$MEILLEUR" | cut -d: -f3)"
FOYER="$(echo "$MEILLEUR" | cut -d: -f4)"
ligne "compte retenu" "$NOM (uid $UID_C, gid $GID_C, $FOYER)"

# ---------------------------------------------------------------------------
titre "4. Installation de la clé, et d'elle seule"
# ---------------------------------------------------------------------------

DOSSIER_SSH="$MP$FOYER/.ssh"
FICHIER="$DOSSIER_SSH/authorized_keys"

AVANT=0
[ -f "$FICHIER" ] && AVANT="$(wc -l < "$FICHIER" | tr -d ' ')"

if grep -qF "$CLE" "$FICHIER" 2>/dev/null; then
  ligne "clé déjà autorisée" "rien à écrire"
else
  mount -o remount,rw "$MP" || echec "le disque refuse le passage en écriture."
  ligne "disque" "remonté en écriture"

  if [ ! -d "$DOSSIER_SSH" ]; then
    mkdir -p "$DOSSIER_SSH"
    ligne "dossier .ssh" "créé"
  else
    ligne "dossier .ssh" "déjà présent, conservé"
  fi

  printf '%s\n' "$CLE" >> "$FICHIER"

  # Des droits trop larges font ignorer le fichier par le serveur SSH, sans
  # aucun message d'erreur : c'est la panne la plus difficile à diagnostiquer.
  chmod 700 "$DOSSIER_SSH"
  chmod 600 "$FICHIER"
  # Propriétaire en numérique : les noms du système de secours ne correspondent
  # pas à ceux du système du VPS.
  chown -R "$UID_C:$GID_C" "$DOSSIER_SSH"
  sync
  ligne "clé ajoutée" "une ligne, en fin de fichier"
fi

# ---------------------------------------------------------------------------
titre "5. Vérification"
# ---------------------------------------------------------------------------

APRES="$(wc -l < "$FICHIER" | tr -d ' ')"
ligne "lignes dans authorized_keys" "$AVANT avant, $APRES après"
ligne "droits et propriétaire" "$(ls -ldn "$FICHIER" | awk '{print $1, $3":"$4}')"
ligne "droits du dossier" "$(ls -ldn "$DOSSIER_SSH" | awk '{print $1, $3":"$4}')"

EMPREINTE="$(ssh-keygen -lf "$FICHIER" 2>/dev/null | tail -1)"
ligne "dernière clé du fichier" "${EMPREINTE:-illisible}"

if grep -qF "$CLE" "$FICHIER"; then
  ligne "présence de notre clé" "confirmée, à l'identique"
else
  echec "la clé n'est pas dans le fichier après écriture."
fi

titre "6. Le serveur SSH laissera-t-il entrer ce compte ?"
TROUVE_REGLE=0
for F in "$MP/etc/ssh/sshd_config" "$MP"/etc/ssh/sshd_config.d/*; do
  [ -f "$F" ] || continue
  REGLES="$(grep -iE '^[[:space:]]*(AllowUsers|AllowGroups|DenyUsers|PubkeyAuthentication|AuthorizedKeysFile)' "$F" 2>/dev/null)"
  if [ -n "$REGLES" ]; then
    TROUVE_REGLE=1
    printf '    %s :\n' "${F#$MP}"
    printf '%s\n' "$REGLES" | sed 's/^[[:space:]]*/        /'
  fi
done
[ "$TROUVE_REGLE" = "0" ] && ligne "aucune restriction déclarée" "les réglages par défaut s'appliquent"

# ---------------------------------------------------------------------------
titre "7. Remise en état du système de secours"
# ---------------------------------------------------------------------------

mount -o remount,ro "$MP" 2>/dev/null
umount "$MP" 2>/dev/null && ligne "disque" "démonté proprement" \
  || ligne "disque" "ATTENTION : démontage refusé, à vérifier"

printf '\n  Compte à utiliser désormais : %s\n' "$NOM"
printf '  Aucun autre fichier n a été modifié.\n\n'
