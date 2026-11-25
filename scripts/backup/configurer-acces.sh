#!/usr/bin/env bash
#
# Enregistre l'accès à Supabase Production sans qu'il transite par le terminal.
#
# Trois précautions, chacune pour une fuite précise :
#
#   1. Le mot de passe va dans un fichier `.pgpass`, lu automatiquement par
#      pg_dump. Il n'apparaît donc jamais dans la ligne de commande, que
#      n'importe quel processus du Mac peut lire avec `ps`.
#   2. La saisie se fait sans écho et le script ne réaffiche jamais la valeur,
#      pour qu'elle ne reste ni dans le défilement du terminal, ni dans une
#      capture d'écran.
#   3. Tout est écrit hors du dépôt, en 0600 dans un dossier 0700. Pas
#      seulement ignoré par Git : hors de sa portée, car une règle d'ignorance
#      s'annule d'un `git add -f`.
#
#   bash scripts/backup/configurer-acces.sh
#
set -euo pipefail

DOSSIER="${MKL_SECRETS_HOME:-$HOME/.mkl-secrets}"
PGPASS="$DOSSIER/pgpass-supabase"
CONFIG="$DOSSIER/supabase-prod.conf"

mkdir -p "$DOSSIER"
chmod 700 "$DOSSIER"

if [ -f "$CONFIG" ]; then
  echo "Un accès est déjà enregistré : $CONFIG"
  echo "Pour le remplacer : rm \"$CONFIG\" \"$PGPASS\""
  exit 0
fi

cat <<'TEXTE'
Accès à Supabase Production
───────────────────────────

Dans Supabase : bouton « Connect », en haut du tableau de bord.

Deux modes conviennent, et le script essaiera les deux dans cet ordre :

  • Connexion directe    db.<REF>.supabase.co:5432, utilisateur « postgres »
                         Recommandée par Supabase pour pg_dump, mais en IPv6
                         seul sur le plan Pro, sauf option IPv4.

  • Session pooler       aws-<N>-<REGION>.pooler.supabase.com:5432
                         utilisateur « postgres.<REF> », en IPv4.
                         Le repli si l'IPv6 ne sort pas de votre réseau.

N'utilisez pas le « Transaction pooler », port 6543 : il ne convient pas à
pg_dump, qui a besoin d'une session complète.

Il suffit de renseigner la référence du projet et le mot de passe de la base.

TEXTE

read -r -p "Référence du projet (la partie <REF>) : " REF
if [ -z "${REF:-}" ]; then echo "Référence vide, abandon." >&2; exit 1; fi

read -r -p "Hôte du Session pooler (aws-...pooler.supabase.com) : " POOLER
if [ -z "${POOLER:-}" ]; then echo "Hôte vide, abandon." >&2; exit 1; fi

# -s : saisie sans écho. Le mot de passe n'est jamais réaffiché ensuite.
read -r -s -p "Mot de passe de la base (invisible) : " MOTDEPASSE
echo
if [ -z "${MOTDEPASSE:-}" ]; then echo "Mot de passe vide, abandon." >&2; exit 1; fi

DIRECT_HOTE="db.$REF.supabase.co"
POOLER_UTILISATEUR="postgres.$REF"

# Le format de .pgpass est hote:port:base:utilisateur:motdepasse. Deux lignes,
# une par mode de connexion, pour que le repli n'ait pas à ressaisir quoi que
# ce soit. Un « \ » devant « : » serait nécessaire si le mot de passe en
# contenait ; on le traite.
ECHAPPE="$(printf '%s' "$MOTDEPASSE" | sed 's/[\\:]/\\&/g')"
umask 077
printf '%s:5432:postgres:postgres:%s\n' "$DIRECT_HOTE" "$ECHAPPE" > "$PGPASS"
printf '%s:5432:postgres:%s:%s\n' "$POOLER" "$POOLER_UTILISATEUR" "$ECHAPPE" >> "$PGPASS"
chmod 600 "$PGPASS"
unset MOTDEPASSE ECHAPPE

# Le fichier de configuration ne contient aucun secret : seulement de quoi
# savoir où se connecter. Il reste tout de même en 0600, la référence du projet
# n'ayant pas à circuler.
cat > "$CONFIG" <<CONF
# Accès à Supabase Production. Aucun mot de passe ici : il est dans
# $PGPASS, lu automatiquement par pg_dump via PGPASSFILE.
MKL_PROJET_REF=$REF
MKL_DIRECT_HOTE=$DIRECT_HOTE
MKL_DIRECT_UTILISATEUR=postgres
MKL_POOLER_HOTE=$POOLER
MKL_POOLER_UTILISATEUR=$POOLER_UTILISATEUR
MKL_PORT=5432
MKL_BASE=postgres
CONF
chmod 600 "$CONFIG"

echo
echo "Accès enregistré. Deux fichiers, tous deux en 0600 :"
ls -l "$CONFIG" "$PGPASS" | awk '{print "  ", $1, $NF}'
echo
echo "Aucun mot de passe n'a été affiché ni conservé dans l'historique."
echo "Étape suivante : bash scripts/backup/sauvegarder-production.sh"
