#!/bin/sh
# Sécurise les anciens déploiements Vercel dont l'archive source contient
# .env.local.
#
#   sh scripts/mise-en-service/securiser-deploiements.sh              # rapport seul
#   sh scripts/mise-en-service/securiser-deploiements.sh --supprimer  # après lecture du rapport
#
# Le problème : jusqu'à la correction de .vercelignore, ce fichier ne listait
# que « ovh-site ». Or Vercel emploie .vercelignore À LA PLACE de .gitignore
# dès qu'il existe. Tout déploiement téléversé avant la correction porte donc
# .env.local dans son archive source, consultable depuis le tableau de bord.
#
# Supprimer le déploiement supprime l'archive. C'est la seule façon de refermer
# l'exposition ; la rotation des secrets en traite l'autre moitié.
#
# Deux refus absolus :
#   — tout déploiement visé par un alias est protégé. En supprimer un couperait
#     le service en ligne.
#   — tout déploiement postérieur à la correction est conservé : son archive est
#     saine, et c'est celui qui sert la recette.

set -eu

export PATH="$HOME/.mkl-clis/bin:$PATH"
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
PROJET="crm-mkl-energeies"
SUPPRIMER=0
NODE="${MKL_NODE:-/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node}"
command -v node >/dev/null 2>&1 && NODE="node"

arret() { printf '\n  %s\n\n' "$1" >&2; exit 2; }

for ARG in "$@"; do
  case "$ARG" in
    --supprimer) SUPPRIMER=1 ;;
    *) arret "Argument inconnu : $ARG" ;;
  esac
done

command -v vercel >/dev/null 2>&1 || arret "La commande « vercel » est introuvable."

# ---------------------------------------------------------------------------
# 1. Depuis quand les archives sont-elles saines ?
# ---------------------------------------------------------------------------

# La question exacte est : à partir de quand `.env.local` a-t-il cessé de
# partir dans l'archive ? Trois dates se présentent, et deux sont des pièges.
#
# La date de modification du fichier a d'abord servi, parce qu'elle précède le
# commit de quelques minutes et que c'est bien le contenu du disque, non
# l'historique Git, que Vercel téléverse. Mais ce fichier est retouché à chaque
# nouvelle exclusion : sa date d'écriture finit par désigner un changement
# étranger à `.env.local`, et condamne alors des déploiements déjà sains.
#
# La date du dernier commit a le même défaut, pour la même raison.
#
# La seule date stable est celle du PREMIER commit ayant introduit `.env.local`
# dans ce fichier : elle ne bouge plus, quoi qu'on ajoute ensuite.
cd "$RACINE"
CORRECTION="$(git log -S".env.local" --format=%ct --reverse -- .vercelignore 2>/dev/null | head -1)"
[ -n "$CORRECTION" ] \
  || arret "Impossible de dater l'entrée de .env.local dans .vercelignore."
ORIGINE="premier commit ayant exclu .env.local"

# Le fichier avait été écrit sur le disque quelques minutes avant d'être
# commité, et un déploiement lancé dans cet intervalle est déjà sain. Faute de
# pouvoir retrouver cette écriture, l'intervalle est traité comme douteux et
# ses déploiements sont conservés : une suppression est définitive, un doute ne
# doit jamais la justifier.
DOUTE=$(( 15 * 60 ))

printf '\n  Sécurisation des archives de déploiement\n'
printf '  ───────────────────────────────────────\n'
printf '  %-38s %s\n' "correction de .vercelignore" \
  "$(date -r "$CORRECTION" '+%d/%m %H:%M:%S' 2>/dev/null || echo "$CORRECTION")"
printf '  %-38s %s\n' "référence retenue" "$ORIGINE"
printf '  %-38s %s\n' "déploiement antérieur" "archive contenant .env.local"

# ---------------------------------------------------------------------------
# 2. Qui est protégé par un alias ?
# ---------------------------------------------------------------------------

# La colonne « source » d'un alias désigne le déploiement qui le sert.
PROTEGES="$(vercel alias ls 2>/dev/null \
  | awk '$1 ~ /\.vercel\.app$/ {print $1}' | sort -u)"
printf '\n  Déploiements protégés par un alias, intouchables :\n'
if [ -n "$PROTEGES" ]; then
  printf '%s\n' "$PROTEGES" | sed 's/^/    /'
else
  arret "Aucun alias lu. Vérifiez la connexion à Vercel avant toute suppression."
fi

# ---------------------------------------------------------------------------
# 3. Classement des déploiements
# ---------------------------------------------------------------------------

# « vercel ls » envoie ses colonnes décorées sur la sortie d'erreur et ne laisse
# sur la sortie standard qu'une adresse par ligne. C'est cette liste-là qui est
# exploitable ; l'âge et la cible sont ensuite lus déploiement par déploiement,
# en clair, plutôt que devinés dans un tableau mis en forme.
ADRESSES="$(vercel ls "$PROJET" 2>/dev/null | grep -oE 'https://[a-z0-9.-]+\.vercel\.app' | sort -u)"
[ -n "$ADRESSES" ] || arret "Aucun déploiement lu."

CORRECTION_MS=$(( CORRECTION * 1000 ))
A_SUPPRIMER=""
NB_GARDES=0
NB_CIBLES=0

printf '\n  %-50s %-11s %-18s %s\n' "déploiement" "cible" "créé le" "décision"
printf '  %s\n' "--------------------------------------------------------------------------------------------------"

for URL in $ADRESSES; do
  COURT="$(printf '%s' "$URL" | sed 's|https://||')"
  # La fiche est du JSON mis en forme : il se lit avec un analyseur, pas avec
  # une expression régulière qui suppose l'absence d'espaces.
  FICHE="$(vercel inspect "$URL" --json 2>/dev/null \
    | "$NODE" -e 'let b="";process.stdin.on("data",c=>b+=c).on("end",()=>{
        try{const d=JSON.parse(b);console.log(`${d.target||"?"}|${d.createdAt||""}`);}
        catch{console.log("|");}
      })' 2>/dev/null || true)"
  CIBLE_D="$(printf '%s' "$FICHE" | cut -d'|' -f1)"
  CREE_MS="$(printf '%s' "$FICHE" | cut -d'|' -f2)"

  if [ -z "$CREE_MS" ]; then
    # Sans date lisible, on ne supprime pas. Une incertitude ne justifie jamais
    # une suppression définitive.
    printf '  %-50s %-11s %-18s %s\n' "$(printf '%s' "$COURT" | cut -c1-48)" \
      "${CIBLE_D:-?}" "illisible" "conservé — date inconnue"
    NB_GARDES=$((NB_GARDES + 1))
    continue
  fi

  CREE_LE="$(date -r $(( CREE_MS / 1000 )) '+%d/%m %H:%M' 2>/dev/null || echo "?")"

  if printf '%s\n' "$PROTEGES" | grep -qx "$COURT"; then
    DECISION="conservé — sert le service en ligne"
    NB_GARDES=$((NB_GARDES + 1))
  elif [ "$CREE_MS" -ge "$CORRECTION_MS" ]; then
    DECISION="conservé — archive saine"
    NB_GARDES=$((NB_GARDES + 1))
  elif [ "$CREE_MS" -ge $(( CORRECTION_MS - DOUTE * 1000 )) ]; then
    # Dans l'intervalle entre l'écriture du fichier et son commit : l'archive
    # est probablement saine, et le doute se tranche en la gardant.
    DECISION="conservé — intervalle douteux, à vérifier"
    NB_GARDES=$((NB_GARDES + 1))
  else
    DECISION="À SUPPRIMER — archive exposée"
    A_SUPPRIMER="$A_SUPPRIMER $URL"
    NB_CIBLES=$((NB_CIBLES + 1))
  fi

  printf '  %-50s %-11s %-18s %s\n' "$(printf '%s' "$COURT" | cut -c1-48)" \
    "${CIBLE_D:-?}" "$CREE_LE" "$DECISION"
done

printf '\n  %s conservé(s), %s à supprimer.\n' "$NB_GARDES" "$NB_CIBLES"

if [ "$NB_CIBLES" = "0" ]; then
  printf '  Rien à faire.\n\n'
  exit 0
fi

if [ "$SUPPRIMER" = "0" ]; then
  printf '\n  Rapport seul : rien n a été supprimé.\n'
  printf '  Relancez avec --supprimer après avoir lu la liste ci-dessus.\n'
  printf '  Rappel : la suppression retire l archive, pas l historique Git.\n\n'
  exit 0
fi

# ---------------------------------------------------------------------------
# 4. Suppression, après confirmation tapée
# ---------------------------------------------------------------------------

printf '\n  %s déploiement(s) vont être supprimés définitivement.\n' "$NB_CIBLES"
printf '  Le déploiement qui sert la production n en fait pas partie.\n'
printf '  Tapez exactement « supprimer » pour poursuivre : '
IFS= read -r SAISIE
[ "$SAISIE" = "supprimer" ] || arret "Confirmation absente : rien n'a été supprimé."

ECHECS=0
for URL in $A_SUPPRIMER; do
  if vercel remove "$URL" --yes >/dev/null 2>&1; then
    printf '  ✓ supprimé  %s\n' "$(printf '%s' "$URL" | sed 's|https://||')"
  else
    printf '  ✗ ÉCHEC     %s\n' "$(printf '%s' "$URL" | sed 's|https://||')"
    ECHECS=$((ECHECS + 1))
  fi
done

printf '\n'
if [ "$ECHECS" != "0" ]; then
  arret "$ECHECS suppression(s) ont échoué. Relevez l'état avant d'aller plus loin."
fi

printf '  Toutes les archives exposées ont été retirées.\n'
printf '  Il reste à renouveler les deux secrets qu elles contenaient :\n'
printf '    sh scripts/mise-en-service/rotation-secrets.sh --etat\n\n'
