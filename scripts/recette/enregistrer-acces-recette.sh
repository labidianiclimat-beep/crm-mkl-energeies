#!/bin/sh
# Enregistre le mot de passe PostgreSQL de MKL CRM RECETTE, hors du dépôt Git.
#
# Le mot de passe est saisi dans ce terminal, jamais dans une conversation, et
# n'est jamais réaffiché. Il part dans ~/.mkl-secrets/, en lecture pour vous
# seul. Ce répertoire est en dehors du dépôt : rien ne peut partir dans Git.
#
# Seul le projet de recette est accepté. Le mot de passe de la production n'a
# aucune raison d'être enregistré ici, et le script refuse son identifiant.

set -eu

REF_RECETTE="xqbjfytrssslnsxxdrou"
REF_PRODUCTION="rzkwmwtjnwnmmcexwoov"
COFFRE="$HOME/.mkl-secrets"
FICHIER="$COFFRE/recette-db.env"
PSQL="$HOME/.mkl-pgtools/bin/psql"

# Journal de diagnostic, sans aucun secret : il note l étape atteinte et les
# messages de PostgreSQL. Indispensable parce que la fenêtre de saisie n est
# pas lisible depuis l extérieur.
JOURNAL="/tmp/mkl-acces-recette.log"
: > "$JOURNAL"
chmod 600 "$JOURNAL"
etape() { printf 'etape: %s\n' "$1" >> "$JOURNAL"; }

oui() { printf '\033[32m  ✓\033[0m %s\n' "$1"; etape "ok — $1"; }
non() { printf '\033[31m  ✗\033[0m %s\n' "$1"; etape "echec — $1"; }

[ -x "$PSQL" ] || { non "psql absent de $PSQL"; exit 1; }
etape "psql trouvé"

printf '\nProjet visé : MKL CRM RECETTE (%s)\n' "$REF_RECETTE"
printf 'Le mot de passe se trouve dans Supabase, Project Settings → Database.\n'
printf 'Si vous ne l avez plus, utilisez « Reset database password » : la recette\n'
printf 'est un projet d essai, aucune application ne s y connecte.\n\n'

# -s coupe l écho du terminal : rien ne s affiche pendant la saisie.
printf 'Mot de passe : '
stty -echo 2>/dev/null || true
IFS= read -r MDP
stty echo 2>/dev/null || true
printf '\n\n'

[ -n "$MDP" ] || { non "aucun mot de passe saisi"; exit 1; }

case "$MDP" in
  *"$REF_PRODUCTION"*) non "cette valeur contient l identifiant de production : refus"; exit 1 ;;
esac

# Le pooler régional est le seul chemin praticable : l hôte direct
# db.<ref>.supabase.co ne publie qu une adresse IPv6, injoignable d ici.
# Les deux terminaisons existent selon l âge du projet ; on essaie les deux.
# Les messages de PostgreSQL rejoignent le journal. Ils distinguent un mot de
# passe erroné d une terminaison de pooler inadaptée, deux échecs qui se
# ressemblent sans ce détail.
RETENU=""
for HOTE in aws-1-eu-west-1.pooler.supabase.com aws-0-eu-west-1.pooler.supabase.com; do
  printf '  essai de %s… ' "$HOTE"
  printf -- '--- %s\n' "$HOTE" >> "$JOURNAL"
  if PGPASSWORD="$MDP" "$PSQL" \
      "postgresql://postgres.$REF_RECETTE@$HOTE:5432/postgres?sslmode=require" \
      -tAc "select 1" >/dev/null 2>>"$JOURNAL"; then
    printf 'accepté\n'
    RETENU="$HOTE"
    break
  fi
  # Ne jamais écrire « refusé » ici : à ce stade l échec porte presque toujours
  # sur l adresse, pas sur le mot de passe, et la confusion est immédiate pour
  # qui regarde la fenêtre. Le motif exact figure dans le journal.
  if grep -q "tenant/user .* not found" "$JOURNAL" 2>/dev/null; then
    printf 'ce serveur n héberge pas ce projet\n'
  else
    printf 'sans réponse utilisable, voir le journal\n'
  fi
done

if [ -z "$RETENU" ]; then
  non "aucune des deux terminaisons n accepte cette connexion"
  printf '\n  Motif rapporté par PostgreSQL :\n'
  sed 's/^/    /' "$JOURNAL"
  printf '\n  Rien n a été enregistré. Journal : %s\n\n' "$JOURNAL"
  exit 1
fi

# Contrôle d identité : la base atteinte doit bien être la recette, et non la
# production. Le nom de base ne suffit pas, les deux s appellent « postgres ».
VU="$(PGPASSWORD="$MDP" "$PSQL" \
  "postgresql://postgres.$REF_RECETTE@$RETENU:5432/postgres?sslmode=require" \
  -tAc "select count(*) from pg_tables where schemaname = 'public'" 2>/dev/null || echo "?")"

printf '\n'
oui "connexion établie par $RETENU"
oui "tables publiques présentes : $VU"

if [ "$VU" != "0" ]; then
  printf '\n'
  non "la recette n est pas vide : $VU tables publiques"
  printf '  Attendu : 0. La production en compte 78. Arrêt, rien n est enregistré.\n\n'
  exit 1
fi

mkdir -p "$COFFRE"
chmod 700 "$COFFRE"
umask 077
printf 'MKL_RECETTE_REF=%s\nMKL_RECETTE_HOTE=%s\nMKL_RECETTE_MDP=%s\n' \
  "$REF_RECETTE" "$RETENU" "$MDP" > "$FICHIER"
chmod 600 "$FICHIER"

oui "enregistré dans $FICHIER, en lecture pour vous seul"
printf '\n  Le socle peut maintenant être appliqué :\n'
printf '    sh scripts/recette/appliquer-socle.sh --verifier\n\n'
