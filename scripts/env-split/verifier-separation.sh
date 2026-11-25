#!/bin/bash
#
# Contrôle, en lecture seule, que la séparation des environnements est
# correcte et que la production est intacte.
#
# Ce script n'écrit rien, ni chez Vercel, ni chez Supabase. Il peut être
# lancé avant comme après l'opération. Il n'affiche aucune valeur de clé.

set -uo pipefail

PROD_REF="rzkwmwtjnwnmmcexwoov"
RECETTE_REF="xqbjfytrssslnsxxdrou"

# Ciblage explicite par identifiants, comme dans le script de séparation.
PROJET_ID="prj_LbcjhVUVPn97zZ5jU0p2jvFwkLwp"
EQUIPE_ID="team_Cba3kVpKIW2jTjKoqtdw8BGL"
PROJET_NOM="crm-mkl-energeies"

export PATH="${MKL_CLIS:-$HOME/.mkl-clis}/bin:$PATH"

# Deux enveloppes, car les deux familles de commandes ne se ciblent pas de la
# même façon. `vercel env` accepte `--project <id>`. `vercel ls` ne le
# connaît pas : le projet y est un argument positionnel, et `-p` y désigne
# `--policy`. Confondre les deux ferait passer un identifiant de projet pour
# une politique de rétention.
vc()  { vercel "$@" -S "$EQUIPE_ID" --project "$PROJET_ID"; }
vcls() { vercel ls "$PROJET_NOM" "$@" -S "$EQUIPE_ID"; }

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
non()  { printf '  \033[31m✗\033[0m %s\n' "$1"; ECHECS=$((ECHECS + 1)); }
avert(){ printf '  \033[33m!\033[0m %s\n' "$1"; }
ECHECS=0

ETAT="$(vc env ls 2>/dev/null)" || { echo "Vercel inaccessible." >&2; exit 1; }

portee() {
  printf '%s\n' "$ETAT" | awk -v n="$1" '
    $1 == n { $1=""; $2=""; $3=""; sub(/^[ \t]+/, ""); sub(/[ \t]+[0-9]+[a-z]+ ago[ \t]*$/, ""); print }'
}
type_de() {
  printf '%s\n' "$ETAT" | awk -v n="$1" '$1 == n { print $3 }'
}
# Une variable peut désormais exister en deux entrées, une par environnement.
compte() {
  printf '%s\n' "$ETAT" | awk -v n="$1" '$1 == n' | wc -l | tr -d ' '
}

printf '\n\033[1mPortées déclarées\033[0m\n'
for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
         SUPABASE_SERVICE_ROLE_KEY SUPABASE_PRODUCTION_REF; do
  n="$(compte "$v")"
  printf '    %-38s %s entrée(s)\n' "$v" "$n"
  printf '%s\n' "$ETAT" | awk -v n="$v" '$1 == n { printf "      %-8s %s\n", $3, substr($0, index($0, $4)) }' \
    | sed -E 's/[ \t]+[0-9]+[a-z]+ ago[ \t]*$//'
done

printf '\n\033[1m1. La production est intacte\033[0m\n'
for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY; do
  if printf '%s\n' "$ETAT" | awk -v n="$v" '$1 == n' | grep -q "Production"; then
    ok "$v couvre toujours Production"
  else
    non "$v NE couvre plus Production"
  fi
done

printf '\n\033[1m2. Preview est séparée\033[0m\n'
for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY; do
  entrees="$(printf '%s\n' "$ETAT" | awk -v n="$v" '$1 == n')"
  partagee="$(printf '%s\n' "$entrees" | grep -c "Production.*Preview" || true)"
  if [ "$partagee" -gt 0 ]; then
    non "$v partage encore une entrée entre Production et Preview"
  elif printf '%s\n' "$entrees" | grep -q "Preview"; then
    ok "$v a une entrée Preview distincte"
  else
    avert "$v n'a aucune entrée Preview (la prévisualisation sera inerte)"
  fi
done

printf '\n\033[1m3. Le garde-fou de cloisonnement est armé\033[0m\n'
if [ "$(compte SUPABASE_PRODUCTION_REF)" -gt 0 ]; then
  ok "SUPABASE_PRODUCTION_REF est posée"
  if [ "$(type_de SUPABASE_PRODUCTION_REF)" = "Config" ]; then
    ok "type Config : sa valeur reste relisible, ce qui est voulu"
  else
    avert "type $(type_de SUPABASE_PRODUCTION_REF) : fonctionnel, mais illisible au tableau de bord"
  fi
else
  non "SUPABASE_PRODUCTION_REF absente : le garde-fou reste inactif"
fi

printf '\n\033[1m4. Preview vise bien la recette\033[0m\n'
# La valeur n'est lisible que si le type est Config. Vérifié : une variable
# typée Secret revient masquée même par `env pull`, sous la forme d'un court
# marqueur. C'est la raison opérationnelle de préférer Config pour les deux
# variables publiques, dont la valeur part de toute façon au navigateur.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
if vc env pull "$TMP/.env.preview" --environment preview --yes >/dev/null 2>&1; then
  lu="$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$TMP/.env.preview" 2>/dev/null | head -n 1 | cut -d= -f2- | tr -d '"')"
  case "$lu" in
    *"$RECETTE_REF"*) ok "Preview pointe vers le projet de recette" ;;
    *"$PROD_REF"*)    non "Preview pointe ENCORE vers la production" ;;
    "")               avert "aucune URL en Preview" ;;
    *supabase.co*)    avert "Preview pointe vers un projet tiers" ;;
    *)
      avert "valeur masquée par le type Secret : contrôle impossible"
      printf '      Après séparation, la nouvelle entrée Preview est de type\n'
      printf '      Config et redevient donc vérifiable ici.\n'
      ;;
  esac
  if grep -qE '^SUPABASE_SERVICE_ROLE_KEY=' "$TMP/.env.preview" 2>/dev/null; then
    ok "une clé service est présente en Preview"
  else
    avert "aucune clé service en Preview"
  fi
else
  avert "env pull indisponible : contrôle 4 non concluant"
fi

printf '\n\033[1m5. Prévisualisations déjà construites\033[0m\n'
# Piège principal : les valeurs NEXT_PUBLIC_* sont gravées à la compilation.
# Un déploiement Preview antérieur continue donc de viser la production.
anciennes="$(vcls --environment preview 2>/dev/null | grep -cE "https://" || true)"
if [ "${anciennes:-0}" -gt 0 ]; then
  avert "$anciennes prévisualisation(s) existante(s) visent encore la production"
  printf '      Elles portent l ancienne valeur dans leur code compilé.\n'
  printf '      À supprimer ou à reconstruire :  vercel ls --environment preview\n'
else
  ok "aucune prévisualisation résiduelle"
fi

printf '\n'
if [ "$ECHECS" -eq 0 ]; then
  printf '\033[32mAucun défaut bloquant.\033[0m\n\n'
  exit 0
fi
printf '\033[31m%s défaut(s) bloquant(s).\033[0m\n\n' "$ECHECS"
exit 1
