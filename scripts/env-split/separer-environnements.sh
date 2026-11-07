#!/bin/bash
#
# Sépare les environnements Vercel du CRM MKL ÉNERGIES.
#
#   Production → Supabase MKL Energies CRM   (rzkwmwtjnwnmmcexwoov)
#   Preview    → Supabase MKL CRM RECETTE    (xqbjfytrssslnsxxdrou)
#
# Trois modes :
#   --verifier   (défaut) n'écrit rien, montre l'état et le plan
#   --sonde      prouve sur une variable jetable qu'un retrait de portée
#                Preview ne supprime pas l'entrée de Production
#   --appliquer  exécute, après une confirmation tapée à la main
#
# Invariants tenus par ce script :
#
#   - Aucun `vercel env remove` n'est lancé sans `--environment preview`.
#     Sans ce drapeau, le CLI retirerait la variable de TOUS ses
#     environnements, Production comprise.
#   - Aucune valeur de Production n'est lue, réécrite ni affichée. Les
#     entrées Production ne sont jamais touchées, donc le CRM en service
#     n'est pas concerné et aucun redéploiement n'est nécessaire.
#   - Les valeurs transitent par l'entrée standard, jamais par la ligne de
#     commande, que `ps` laisse lire aux autres processus de la machine.
#   - Les clés ne sont jamais affichées : seules leurs longueurs le sont.
#   - Le script s'arrête si l'état constaté ne correspond pas à l'état attendu.

set -euo pipefail

PROD_REF="rzkwmwtjnwnmmcexwoov"
RECETTE_REF="xqbjfytrssslnsxxdrou"

# Ciblage explicite, par identifiants plutôt que par noms. Un nom peut être
# réattribué ou exister en double sous un autre compte ; un identifiant non.
# Aucune commande de ce script ne s'appuie sur le projet « lié » implicite.
PROJET_ID="prj_LbcjhVUVPn97zZ5jU0p2jvFwkLwp"
EQUIPE_ID="team_Cba3kVpKIW2jTjKoqtdw8BGL"
PROJET_NOM="crm-mkl-energeies"

export PATH="${MKL_CLIS:-$HOME/.mkl-clis}/bin:$PATH"

# Toute commande sur les variables passe par ici, donc aucune ne peut oublier
# sa cible. La forme longue `--project` est obligatoire : sur `vercel ls`,
# `-p` est l'abréviation dépréciée de `--policy`, pas de `--project`. Une
# enveloppe unique qui injecterait `-p` partout passerait donc un identifiant
# de projet en guise de politique de rétention.
vc() { vercel "$@" -S "$EQUIPE_ID" --project "$PROJET_ID"; }

MODE="verifier"
case "${1:-}" in
  --appliquer) MODE="appliquer" ;;
  --sonde) MODE="sonde" ;;
  --verifier|"") MODE="verifier" ;;
  *) echo "Usage : $0 [--verifier|--sonde|--appliquer]" >&2; exit 2 ;;
esac

titre() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$1"; }
non()   { printf '  \033[31m✗\033[0m %s\n' "$1"; }
info()  { printf '    %s\n' "$1"; }

# ---------------------------------------------------------------------------
# 1. Conditions préalables
# ---------------------------------------------------------------------------

titre "1. Conditions préalables"

for outil in vercel supabase; do
  command -v "$outil" >/dev/null 2>&1 || {
    non "$outil introuvable. Lancez scripts/env-split/installer-clis.sh"
    exit 1
  }
done
ok "les deux CLI officiels sont installés"

QUI="$(vercel whoami 2>/dev/null | tail -n 1 || true)"
[ -n "$QUI" ] || { non "Vercel n'est pas authentifié. Lancez : vercel login"; exit 1; }
ok "Vercel authentifié : $QUI"

# La sonde ne touche que Vercel : exiger Supabase ici l'empêcherait sans
# raison, alors que c'est justement le contrôle à passer en premier.
SUPABASE_PRET=1
if ! supabase projects api-keys --remote="$RECETTE_REF" >/dev/null 2>&1; then
  SUPABASE_PRET=0
  if [ "$MODE" = "appliquer" ]; then
    non "Supabase n'est pas authentifié."
    info "C'est la seule authentification manquante. Lancez : supabase login"
    info "Le script lira alors lui-même les clés de recette, sans que vous"
    info "ayez à les copier ni à les transmettre."
    exit 1
  fi
  avert() { printf '  \033[33m!\033[0m %s\n' "$1"; }
  avert "Supabase non authentifié : les clés de recette ne seront pas lues"
  info "Sans incidence pour --verifier et --sonde. Avant --appliquer,"
  info "lancez : supabase login"
else
  ok "Supabase authentifié, projet de recette accessible"
fi

# ---------------------------------------------------------------------------
# 2. État actuel des variables, lu chez Vercel
# ---------------------------------------------------------------------------

titre "2. État actuel chez Vercel"

# Le projet visé est nommé avant toute lecture, pour qu'une erreur de cible
# se voie dans la sortie plutôt que de passer inaperçue.
info "équipe  $EQUIPE_ID"
info "projet  $PROJET_ID ($PROJET_NOM)"

# L'accessibilité est éprouvée avec la commande même qui sera employée
# ensuite. `project ls` n'accepte pas `-p` et ne prouverait donc rien du
# ciblage réel.
ETAT="$(vc env ls 2>/dev/null)" || { non "projet inaccessible avec ce ciblage"; exit 1; }
[ -n "$ETAT" ] || { non "aucune variable lue : ciblage douteux, arrêt"; exit 1; }
ok "cible accessible, $(printf '%s\n' "$ETAT" | grep -cE "Production|Preview") entrée(s) lue(s)"

portee() {
  # Renvoie la liste d'environnements déclarée pour une variable, ou vide.
  printf '%s\n' "$ETAT" | awk -v n="$1" '
    $1 == n {
      $1 = ""; $2 = ""; $3 = "";
      sub(/^[ \t]+/, "");
      sub(/[ \t]+[0-9]+[a-z]+ ago[ \t]*$/, "");
      print
    }'
}

for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY; do
  p="$(portee "$v")"
  info "$(printf '%-38s %s' "$v" "${p:-<absente>}")"
done

URL_PORTEE="$(portee NEXT_PUBLIC_SUPABASE_URL)"
CLE_PORTEE="$(portee NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)"

# Le script ne doit agir que sur l'état qu'il a été conçu pour transformer.
for p in "$URL_PORTEE" "$CLE_PORTEE"; do
  case "$p" in
    *Production*Preview*) ;;
    *Production*)
      ok "portée déjà restreinte à Production : rien à retirer"
      ;;
    *)
      non "état inattendu : « $p »"
      info "Le script s'arrête plutôt que d'agir sur une configuration"
      info "qu'il ne reconnaît pas."
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# 3. Valeurs de recette, lues chez Supabase
# ---------------------------------------------------------------------------

titre "3. Valeurs de recette, lues chez Supabase"

RECETTE_URL="https://$RECETTE_REF.supabase.co"

if [ "$SUPABASE_PRET" -eq 0 ]; then
  info "étape non jouée : Supabase n'est pas authentifié"
  info "URL de recette qui sera posée : $RECETTE_URL"
  SAUTER_PLAN=1
fi

if [ "${SAUTER_PLAN:-0}" -eq 0 ]; then

CLES="$(supabase projects api-keys --remote="$RECETTE_REF" --reveal -o json 2>/dev/null \
  || supabase projects api-keys --remote="$RECETTE_REF" --reveal 2>/dev/null)"

extraire() {
  printf '%s' "$CLES" | /usr/bin/python3 -c '
import json, sys, re
brut = sys.stdin.read()
vise = sys.argv[1]
try:
    donnees = json.loads(brut)
except json.JSONDecodeError:
    # Repli sur la sortie tabulaire si -o json n est pas accepte.
    for ligne in brut.splitlines():
        if vise in ligne:
            parts = [p.strip() for p in re.split(r"\s{2,}|\|", ligne) if p.strip()]
            if len(parts) >= 2:
                print(parts[-1]); break
    sys.exit(0)
if isinstance(donnees, dict):
    donnees = donnees.get("keys", donnees.get("data", []))
for item in donnees or []:
    if item.get("name") == vise or item.get("type") == vise:
        print(item.get("api_key") or item.get("apiKey") or "")
        break
' "$1"
}

RECETTE_PUB="$(extraire anon)"
[ -n "$RECETTE_PUB" ] || RECETTE_PUB="$(extraire publishable)"
RECETTE_SERVICE="$(extraire service_role)"
[ -n "$RECETTE_SERVICE" ] || RECETTE_SERVICE="$(extraire secret)"

[ -n "$RECETTE_PUB" ] || { non "clé publique de recette introuvable"; exit 1; }
[ -n "$RECETTE_SERVICE" ] || { non "clé service de recette introuvable"; exit 1; }

# Contrôle d'appartenance : une clé historique porte la référence du projet.
# Mieux vaut refuser que de poser par erreur une clé de production en Preview.
for paire in "publique:$RECETTE_PUB" "service:$RECETTE_SERVICE"; do
  nom="${paire%%:*}"; val="${paire#*:}"
  if printf '%s' "$val" | grep -q '^eyJ'; then
    ref="$(printf '%s' "$val" | cut -d. -f2 | tr '_-' '/+' \
      | /usr/bin/python3 -c 'import base64,json,sys; d=sys.stdin.read().strip(); d+="="*(-len(d)%4); print(json.loads(base64.b64decode(d)).get("ref",""))' 2>/dev/null || true)"
    if [ -n "$ref" ] && [ "$ref" != "$RECETTE_REF" ]; then
      non "la clé $nom désigne le projet $ref, pas la recette"
      exit 1
    fi
    [ -n "$ref" ] && ok "clé $nom : rattachée au projet de recette (${#val} caractères)"
  else
    ok "clé $nom : format récent, non vérifiable par référence (${#val} caractères)"
  fi
done

ok "URL de recette : $RECETTE_URL"

fi

# ---------------------------------------------------------------------------
# 4. Plan
# ---------------------------------------------------------------------------

titre "4. Plan"

cat <<PLAN
    a. retirer la portée Preview de NEXT_PUBLIC_SUPABASE_URL
    b. retirer la portée Preview de NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    c. créer NEXT_PUBLIC_SUPABASE_URL             Preview, type config
    d. créer NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY Preview, type config
    e. créer SUPABASE_SERVICE_ROLE_KEY            Preview, type secret
    f. créer SUPABASE_PRODUCTION_REF              les trois, type config

  En a et b, l'enregistrement partagé entre Production et Preview voit sa
  portée réduite à Production. Sa valeur et son type restent intacts, et sa
  couverture de Production est préservée : c'est ce que la sonde a prouvé.
  Aucune valeur de production n'est lue, réécrite ni affichée, et aucun
  déploiement n'est lancé.
PLAN

# ---------------------------------------------------------------------------
# 5. Sonde : le retrait de portée épargne-t-il la Production ?
# ---------------------------------------------------------------------------

if [ "$MODE" = "sonde" ]; then
  titre "5. Sonde sur une variable jetable"
  SONDE="MKL_SONDE_PORTEE"
  info "Cette variable n'est lue par aucun code. Elle est créée, observée,"
  info "puis supprimée. Aucun déploiement ne la verra."

  # Nettoyage préalable, au cas où une sonde précédente aurait laissé une
  # trace. La suppression se fait environnement par environnement : vérifié,
  # un `remove` sans `--environment` ne retire pas fiablement un nom porté
  # par plusieurs entrées distinctes.
  nettoyer_sonde() {
    for e in production preview development; do
      vc env remove "$SONDE" --environment "$e" --yes >/dev/null 2>&1 || true
    done
  }
  nettoyer_sonde

  printf 'jetable' | vc env add "$SONDE" --environment production,preview --type config >/dev/null 2>&1
  avant="$(vc env ls 2>/dev/null | awk -v n="$SONDE" '$1==n')"
  info "après création : $(printf '%s' "$avant" | sed -E 's/.*(Production.*) +[0-9].*/\1/')"

  vc env remove "$SONDE" --environment preview --yes >/dev/null 2>&1
  apres="$(vc env ls 2>/dev/null | awk -v n="$SONDE" '$1==n')"

  if printf '%s' "$apres" | grep -q "Production"; then
    ok "Production conservée après retrait de Preview"
  else
    non "Production PERDUE : ne pas appliquer ce script"
    nettoyer_sonde
    exit 1
  fi
  if printf '%s' "$apres" | grep -q "Preview"; then
    non "Preview toujours présente : le retrait n'a pas fonctionné"
    exit 1
  fi
  ok "Preview bien retirée"

  nettoyer_sonde
  ok "variable jetable supprimée"
  echo
  echo "Sonde concluante. Vous pouvez lancer : $0 --appliquer"
  exit 0
fi

# ---------------------------------------------------------------------------
# 6. Application
# ---------------------------------------------------------------------------

if [ "$MODE" = "verifier" ]; then
  titre "Vérification seule"
  info "Rien n'a été modifié."
  info "Pour prouver d'abord l'innocuité du retrait : $0 --sonde"
  info "Pour appliquer ensuite                      : $0 --appliquer"
  exit 0
fi

titre "6. Confirmation"
echo "  Tapez exactement SEPARER pour appliquer, autre chose pour renoncer."
printf '  > '
read -r reponse
[ "$reponse" = "SEPARER" ] || { non "renoncé, rien n'a été modifié"; exit 1; }

titre "7. Application"

# En cas d'échec, on s'arrête où l'on est. Aucun retour arrière automatique :
# un script qui « répare » tout seul après une erreur qu'il n'a pas comprise
# peut aggraver l'état. L'état exact est affiché, et la décision revient à
# l'humain.
sur_echec() {
  code=$?
  [ "$code" -eq 0 ] && exit 0
  printf '\n\033[31mARRÊT à l étape « %s » (code %s).\033[0m\n' "${ETAPE:-inconnue}" "$code"
  printf 'Aucun retour arrière n a été tenté. État exact constaté :\n\n'
  vc env ls 2>/dev/null | grep -E "name|SUPABASE" || true
  printf '\nRien d autre n a été modifié. Transmettez cet état avant de reprendre.\n'
  exit "$code"
}
trap sur_echec EXIT

# Sauvegarde du constat initial, pour prouver après coup que la production
# conserve exactement le même nombre d'entrées la couvrant.
PROD_AVANT="$(printf '%s\n' "$ETAT" | grep -c "Production" || true)"
info "entrées couvrant Production avant opération : $PROD_AVANT"

retirer_preview() {
  ETAPE="retrait Preview de $1"
  if portee "$1" | grep -q "Preview"; then
    vc env remove "$1" --environment preview --yes >/dev/null
    ok "$1 : portée Preview retirée"
  else
    ok "$1 : aucune portée Preview, rien à faire"
  fi
}

retirer_preview NEXT_PUBLIC_SUPABASE_URL
retirer_preview NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

poser() {
  nom="$1"; envs="$2"; valeur="$3"; type="$4"
  ETAPE="création de $nom sur $envs"

  # `--force` est volontairement absent : sans lui, le CLI refuse d'écraser
  # une entrée déjà présente pour le même environnement. Vérifié sur une
  # variable jetable : l'ajout est accepté quand le nom n'existe que pour un
  # autre environnement, et refusé quand il existe déjà pour celui-ci.
  #
  # On contrôle quand même avant d'écrire, pour donner un message clair
  # plutôt que de laisser remonter une erreur d'API.
  actuel="$(vc env ls 2>/dev/null | awk -v n="$nom" '$1 == n')"
  for e in $(printf '%s' "$envs" | tr ',' ' '); do
    etiquette="$(printf '%s' "$e" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')"
    if printf '%s\n' "$actuel" | grep -q "$etiquette"; then
      non "$nom couvre déjà $etiquette : arrêt sans rien écraser"
      return 1
    fi
  done

  # La valeur passe par l'entrée standard, jamais par argv, que `ps` laisse
  # lire aux autres processus de la machine.
  printf '%s' "$valeur" | vc env add "$nom" --environment "$envs" --type "$type" >/dev/null
  ok "$nom : posée sur $envs, type $type"
}

poser NEXT_PUBLIC_SUPABASE_URL             preview "$RECETTE_URL"     config
poser NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY preview "$RECETTE_PUB"     config
poser SUPABASE_SERVICE_ROLE_KEY            preview "$RECETTE_SERVICE" secret
poser SUPABASE_PRODUCTION_REF              production,preview,development "$PROD_REF" config

titre "8. La production a-t-elle perdu une couverture ?"
PROD_APRES="$(vc env ls 2>/dev/null | grep -c "Production" || true)"
# Trois entrées Production apparaissent : les deux publiques conservées plus
# la nouvelle référence de projet. Le total ne doit donc pas diminuer.
if [ "$PROD_APRES" -ge "$PROD_AVANT" ]; then
  ok "$PROD_AVANT entrées avant, $PROD_APRES après : aucune perte"
else
  non "$PROD_AVANT entrées avant, $PROD_APRES après : PERTE"
  exit 1
fi

trap - EXIT
titre "9. Contrôle final"
exec "$(dirname "$0")/verifier-separation.sh"
