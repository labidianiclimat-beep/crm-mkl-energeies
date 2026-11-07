#!/bin/bash
#
# Installe les deux CLI officiels sans gestionnaire de paquets.
#
# Ce Mac n'a ni npm, ni Homebrew, ni Docker. Les deux outils sont donc
# récupérés à leur source officielle et dépliés dans un dossier à part :
#
#   - Vercel CLI : archive du registre npm. Le paquet embarque son propre
#     `dist/vc.js` autonome, qui s'exécute avec Node sans installation.
#   - Supabase CLI : binaire publié par Supabase sur GitHub, déjà compilé
#     pour darwin/arm64.
#
# Rien n'est écrit dans le dépôt Git ni dans /usr/local. Tout vit dans
# ~/.mkl-clis, à côté de ~/.mkl-pgtools installé pour les sauvegardes.
#
# Aucun jeton n'est lu, écrit ni affiché par ce script.

set -euo pipefail

CIBLE="${MKL_CLIS:-$HOME/.mkl-clis}"
NODE="${MKL_NODE:-/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node}"
TRAVAIL="$(mktemp -d)"
trap 'rm -rf "$TRAVAIL"' EXIT

if [ ! -x "$NODE" ]; then
  echo "Node introuvable : $NODE" >&2
  echo "Indiquez-le avec MKL_NODE=/chemin/vers/node." >&2
  exit 1
fi

mkdir -p "$CIBLE/bin"

# --------------------------------------------------------------------------
# Vercel CLI
# --------------------------------------------------------------------------

if [ -x "$CIBLE/bin/vercel" ]; then
  echo "Vercel CLI déjà présent."
else
  echo "Récupération du Vercel CLI depuis le registre npm…"
  URL="$(curl -sSfL https://registry.npmjs.org/vercel/latest \
    | "$NODE" -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).dist.tarball))')"
  curl -sSfL "$URL" -o "$TRAVAIL/vercel.tgz"

  rm -rf "$CIBLE/vercel"
  mkdir -p "$CIBLE/vercel"
  # L'archive npm range tout sous `package/`, que l'on retire.
  tar -xzf "$TRAVAIL/vercel.tgz" -C "$CIBLE/vercel" --strip-components=1

  # Depuis la version 65, `dist/vc.js` n'est qu'un lanceur : il cherche un
  # binaire natif dans `node_modules`, livré par un paquet distinct propre à
  # la plateforme. Sans npm pour résoudre cette dépendance optionnelle, on la
  # récupère et on la dépose à l'emplacement attendu.
  VERSION="$(basename "$URL" | sed -E 's/^vercel-(.*)\.tgz$/\1/')"
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) NATIF="vc-native-darwin-arm64" ;;
    Darwin-x86_64) NATIF="vc-native-darwin-x64" ;;
    Linux-aarch64) NATIF="vc-native-linux-arm64" ;;
    Linux-x86_64) NATIF="vc-native-linux-x64" ;;
    *) echo "Plateforme non gérée pour le binaire Vercel." >&2; exit 1 ;;
  esac
  echo "  binaire natif @vercel/$NATIF@$VERSION…"
  curl -sSfL "https://registry.npmjs.org/@vercel/$NATIF/-/$NATIF-$VERSION.tgz" \
    -o "$TRAVAIL/natif.tgz"
  mkdir -p "$CIBLE/vercel/node_modules/@vercel/$NATIF"
  tar -xzf "$TRAVAIL/natif.tgz" -C "$CIBLE/vercel/node_modules/@vercel/$NATIF" --strip-components=1

  # Un lanceur, pour ne pas dépendre d'un `node` présent dans le PATH.
  cat > "$CIBLE/bin/vercel" <<LANCEUR
#!/bin/bash
exec "$NODE" "$CIBLE/vercel/dist/vc.js" "\$@"
LANCEUR
  chmod +x "$CIBLE/bin/vercel"
fi

# --------------------------------------------------------------------------
# Supabase CLI
# --------------------------------------------------------------------------

if [ -x "$CIBLE/bin/supabase" ]; then
  echo "Supabase CLI déjà présent."
else
  echo "Récupération du Supabase CLI depuis GitHub…"
  ARCH="$(uname -m)"
  case "$ARCH" in
    arm64) ACTIF="supabase_darwin_arm64.tar.gz" ;;
    x86_64) ACTIF="supabase_darwin_amd64.tar.gz" ;;
    *) echo "Architecture non gérée : $ARCH" >&2; exit 1 ;;
  esac
  curl -sSfL "https://github.com/supabase/cli/releases/latest/download/$ACTIF" \
    -o "$TRAVAIL/supabase.tar.gz"
  tar -xzf "$TRAVAIL/supabase.tar.gz" -C "$TRAVAIL"
  mv "$TRAVAIL/supabase" "$CIBLE/bin/supabase"
  chmod +x "$CIBLE/bin/supabase"
fi

# --------------------------------------------------------------------------
# Contrôle
# --------------------------------------------------------------------------

echo
echo "Installé dans $CIBLE/bin :"
printf '  vercel   %s\n' "$("$CIBLE/bin/vercel" --version 2>/dev/null | tail -n 1)"
printf '  supabase %s\n' "$("$CIBLE/bin/supabase" --version 2>/dev/null | tail -n 1)"
echo
echo "Taille : $(du -sh "$CIBLE" | cut -f1)"
