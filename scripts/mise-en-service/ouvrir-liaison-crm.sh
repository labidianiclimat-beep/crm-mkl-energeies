#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Ouverture de la liaison site → CRM, avec un premier prospect fictif.
#
# L'interrupteur `CRM_SYNC_ENABLED` est le dernier verrou. Les trois variables
# `CRM_SYNC_*` sont déjà posées et le secret est prouvé conforme au CRM, donc
# l'ouverture ne peut pas échouer sur l'authentification. Ce qu'elle peut
# révéler, en revanche, c'est un défaut dans le format envoyé ou dans
# l'organisation visée — d'où le prospect fictif, immédiatement après.
#
# Tout est réversible : `--fermer` retire l'interrupteur et redémarre. La file
# du site conserve les demandes non transmises, donc rien ne se perd pendant
# une fermeture.
#
#   sh ouvrir-liaison-crm.sh --controles   prérequis, aucune écriture
#   sh ouvrir-liaison-crm.sh --ouvrir      pose l'interrupteur et redémarre
#   sh ouvrir-liaison-crm.sh --eprouver    envoie UN prospect fictif
#   sh ouvrir-liaison-crm.sh --nettoyer    retire le fictif du côté site
#   sh ouvrir-liaison-crm.sh --fermer      retire l'interrupteur
#
# Le nettoyage côté CRM se fait séparément, par l'outil Supabase : il demande
# un rôle que ce script n'a pas, et c'est voulu.
# ---------------------------------------------------------------------------
set -eu

HOTE="${OVH_HOST:-ubuntu@148.113.149.139}"
ENVFILE="${OVH_ENV_FILE:-/etc/mkl-energies/env}"
ARCHIVE="${OVH_ENV_ARCHIVE:-/home/ubuntu/archives-env}"
CLE="${OVH_SSH_KEY:-$HOME/.ssh/mkl_ovh}"
SITE="https://mkl-energies.fr"
DATA="${OVH_DIR:-/var/www/mkl-energies}/data"

# `-n` est indispensable, pas décoratif : sans lui, chaque appel ssh avale
# l'entrée standard, et la confirmation demandée plus bas n'arrive jamais. Le
# `read` échoue alors, et `set -e` fait sortir le script sans un mot — on croit
# avoir ouvert la liaison alors que rien n'a été fait. Aucune commande distante
# d'ici ne lit l'entrée standard, donc la couper ne coûte rien.
SSH="ssh -n -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=10"
[ -f "$CLE" ] && SSH="$SSH -i $CLE"
distant() { $SSH "$HOTE" "$@"; }

# Marqueur du prospect fictif. Reconnaissable sans ambiguïté, pour que le
# nettoyage ne puisse jamais emporter une vraie demande.
MARQUEUR="Essai-Liaison-A-Supprimer"

echo_titre() { printf '\n  %s\n\n' "$1"; }
ok()  { printf '    ✓ %-44s %s\n' "$1" "${2:-}"; }
nok() { printf '    ✗ %-44s %s\n' "$1" "${2:-}"; ANOMALIE=1; }

controles() {
  ANOMALIE=0
  echo_titre "Prérequis avant ouverture"

  ETAT=$(distant "sudo systemctl is-active mkl-energies" 2>/dev/null || echo inactif)
  [ "$ETAT" = "active" ] && ok "le service tourne" "$ETAT" || nok "le service tourne" "$ETAT"

  N=$(distant "sudo grep -c '^CRM_SYNC_\(URL\|KEY_ID\|SECRET\)=' '$ENVFILE'" 2>/dev/null || echo 0)
  [ "$N" = "3" ] && ok "les trois variables sont posées" "$N/3" \
                 || nok "les trois variables sont posées" "$N/3"

  # Le secret doit faire au moins 32 caractères, sinon `crmSyncConfigured`
  # renvoie faux et l'ouverture serait sans effet.
  L=$(distant "sudo awk -F= '/^CRM_SYNC_SECRET=/{print length(substr(\$0,index(\$0,\"=\")+1))}' '$ENVFILE'" 2>/dev/null || echo 0)
  [ "${L:-0}" -ge 32 ] && ok "le secret est assez long" "$L caractères" \
                       || nok "le secret est assez long" "$L caractères"

  I=$(distant "sudo grep -c '^CRM_SYNC_ENABLED=' '$ENVFILE' || true" 2>/dev/null || echo 0)
  [ "${I:-0}" = "0" ] && ok "interrupteur encore coupé" "à poser" \
                      || ok "interrupteur déjà posé" "ouverture déjà faite"

  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST \
    "$(distant "sudo awk -F= '/^CRM_SYNC_URL=/{print substr(\$0,index(\$0,\"=\")+1)}' '$ENVFILE'" 2>/dev/null)" \
    -H 'Content-Type: application/json' --data '{}' || echo 000)
  [ "$CODE" = "401" ] && ok "le CRM refuse une demande non signée" "code $CODE" \
                      || nok "le CRM refuse une demande non signée" "code $CODE"

  # On compte les tâches EN ATTENTE, pas la présence du fichier. Tester
  # l'existence annonçait « file non vide » devant un `[]` parfaitement vide, et
  # surtout l'aurait annoncé vide si le fichier avait disparu — c'est-à-dire au
  # moment où l'on a le plus besoin de le savoir. Ce qui importe avant
  # d'ouvrir, c'est le nombre de demandes qui partiraient d'un coup.
  N=$(distant "sudo test -f '$DATA/crm-outbox.json' \
                 && sudo node -e 'const a=require(\"$DATA/crm-outbox.json\");console.log(a.filter(t=>t&&t.status!==\"sent\").length)' 2>/dev/null \
                 || echo 0")
  case "$N" in
    0) ok "file locale vide" "rien en attente" ;;
    ''|*[!0-9]*) nok "file locale lisible" "compte illisible : « $N »" ;;
    *) ok "file locale non vide" "$N demande(s) partiraient à l ouverture" ;;
  esac

  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE/" || echo 000)
  [ "$CODE" = "200" ] && ok "le site répond" "code $CODE" || nok "le site répond" "code $CODE"

  echo
  [ "$ANOMALIE" = "0" ] || { printf '  Un prérequis manque. Rien ne sera ouvert.\n\n'; return 1; }
  printf '  Prérequis réunis. L ouverture est réversible par --fermer.\n\n'
}

ouvrir() {
  controles || exit 1
  printf '  Tapez « ouvrir la liaison » pour continuer : '
  read -r R
  [ "$R" = "ouvrir la liaison" ] || { printf '\n  Abandon. Interrupteur inchangé.\n\n'; exit 1; }

  HORO=$(date -u +%Y%m%dT%H%M%SZ)
  printf '\n  Sauvegarde puis pose de l interrupteur…\n'
  distant "sudo cp -a '$ENVFILE' '$ARCHIVE/env-avant-ouverture-$HORO' \
    && sudo chmod 600 '$ARCHIVE/env-avant-ouverture-$HORO' \
    && echo '    sauvegarde : $ARCHIVE/env-avant-ouverture-$HORO'"

  # Remplacement ou ajout, sans toucher à aucune autre ligne. Écriture
  # atomique, droits et propriétaire conservés.
  distant "sudo python3 -c \"
import os, tempfile
p = '$ENVFILE'
st = os.stat(p)
lignes = open(p).read().splitlines()
vu = False
for i, l in enumerate(lignes):
    if l.startswith('CRM_SYNC_ENABLED='):
        lignes[i] = 'CRM_SYNC_ENABLED=1'; vu = True
if not vu:
    lignes.append('CRM_SYNC_ENABLED=1')
fd, t = tempfile.mkstemp(dir=os.path.dirname(p))
with os.fdopen(fd, 'w') as f:
    f.write('\\\\n'.join(lignes) + '\\\\n')
os.chmod(t, st.st_mode & 0o777); os.chown(t, st.st_uid, st.st_gid)
os.replace(t, p)
print('    interrupteur pose, ' + str(len(lignes)) + ' lignes au total')
\""

  printf '\n  Redémarrage…\n'
  distant "sudo systemctl restart mkl-energies && sleep 2 \
    && echo '    service : '\$(sudo systemctl is-active mkl-energies)"

  printf '\n  Ce que le serveur en conclut :\n'
  distant "cd ${OVH_DIR:-/var/www/mkl-energies} && sudo env \$(sudo grep -E '^CRM_SYNC_' '$ENVFILE' | xargs) node --input-type=module -e '
import { crmSyncConfigured } from \"./lib/crm-sync.mjs\";
import { crmSyncEnabled } from \"./lib/crm-outbox.mjs\";
console.log(\"    liaison configuree :\", crmSyncConfigured());
console.log(\"    envoi actif        :\", crmSyncEnabled());
'"
  printf '\n  Ouvert. Éprouvez maintenant : sh %s --eprouver\n\n' "$(basename "$0")"
}

eprouver() {
  echo_titre "Un prospect fictif, de bout en bout"
  CORPS=$(cat <<FINJSON
{
  "firstName": "Essai",
  "lastName": "$MARQUEUR",
  "phone": "0600000000",
  "email": "essai.liaison@example.invalid",
  "postalCode": "67000",
  "housing": "maison",
  "intent": "devis",
  "projects": ["photovoltaique"],
  "message": "Prospect fictif d ouverture de liaison. A supprimer.",
  "consent": true,
  "attribution": {
    "gclid": "EssaiLiaison00000000000000000000",
    "utm_source": "google",
    "utm_medium": "cpc",
    "utm_campaign": "essai-ouverture",
    "landingPath": "/photovoltaique.html",
    "referrer": "https://www.google.com/"
  },
  "attributionFirst": {
    "utm_source": "google",
    "utm_medium": "cpc",
    "landingPath": "/photovoltaique.html"
  }
}
FINJSON
)
  printf '  Envoi au formulaire public du site…\n'
  REP=$(curl -s --max-time 25 -X POST "$SITE/api/leads" \
    -H 'Content-Type: application/json' -H 'Referer: https://www.google.com/' \
    --data "$CORPS")
  printf '    réponse : %s\n' "$(printf '%s' "$REP" | head -c 200)"

  printf '\n  La file du site la transmet-elle ? (trois secondes de grâce)\n'
  sleep 3
  distant "if sudo test -f '$DATA/crm-outbox.json'; then
    sudo python3 -c \"
import json
rows = json.load(open('$DATA/crm-outbox.json'))
for r in rows:
    print('    tache', r.get('status'), '- tentatives', r.get('attempts'),
          '-', (r.get('lastError') or 'aucune erreur'))
\"
  else echo '    file absente : tout a ete transmis et retire'; fi"

  printf '\n  Côté CRM, à vérifier par l outil Supabase :\n'
  printf '    une ligne dans web_lead_submissions au marqueur « %s »\n' "$MARQUEUR"
  printf '    et aucune opportunité créée automatiquement.\n\n'
}

nettoyer() {
  echo_titre "Retrait du prospect fictif, côté site"
  distant "sudo python3 -c \"
import json, os, tempfile
MARQ = '$MARQUEUR'

def ecrire(chemin, donnees):
    st = os.stat(chemin)
    fd, t = tempfile.mkstemp(dir=os.path.dirname(chemin))
    with os.fdopen(fd, 'w') as f:
        json.dump(donnees, f, ensure_ascii=False, indent=2); f.write('\\\\n')
    os.chmod(t, st.st_mode & 0o777); os.chown(t, st.st_uid, st.st_gid)
    os.replace(t, chemin)

for nom in ('leads.json', 'appointments.json', 'crm-outbox.json'):
    p = os.path.join('$DATA', nom)
    if not os.path.exists(p):
        print('    ' + nom + ' : absent'); continue
    rows = json.load(open(p))
    garde = [r for r in rows if MARQ not in json.dumps(r, ensure_ascii=False)]
    retires = len(rows) - len(garde)
    if retires == 0:
        print('    ' + nom + ' : rien a retirer')
    elif retires > 1:
        print('    ' + nom + ' : REFUS, ' + str(retires) + ' lignes correspondent, une seule attendue')
    elif garde:
        ecrire(p, garde); print('    ' + nom + ' : 1 ligne fictive retiree')
    else:
        os.remove(p); print('    ' + nom + ' : derniere ligne retiree, fichier supprime')
\""
  printf '\n  Reste à retirer la ligne correspondante du CRM, par l outil Supabase.\n\n'
}

fermer() {
  echo_titre "Fermeture de la liaison"
  printf '  La file du site conservera les demandes non transmises.\n'
  printf '  Tapez « fermer la liaison » pour continuer : '
  read -r R
  [ "$R" = "fermer la liaison" ] || { printf '\n  Abandon.\n\n'; exit 1; }
  distant "sudo python3 -c \"
import os, tempfile
p = '$ENVFILE'
st = os.stat(p)
lignes = [l for l in open(p).read().splitlines() if not l.startswith('CRM_SYNC_ENABLED=')]
fd, t = tempfile.mkstemp(dir=os.path.dirname(p))
with os.fdopen(fd, 'w') as f:
    f.write('\\\\n'.join(lignes) + '\\\\n')
os.chmod(t, st.st_mode & 0o777); os.chown(t, st.st_uid, st.st_gid)
os.replace(t, p)
print('    interrupteur retire')
\" && sudo systemctl restart mkl-energies && sleep 2 \
  && echo '    service : '\$(sudo systemctl is-active mkl-energies)"
  printf '\n  Fermé. Rien ne part plus vers le CRM.\n\n'
}

case "${1:-}" in
  --controles) controles ;;
  --ouvrir)    ouvrir ;;
  --eprouver)  eprouver ;;
  --nettoyer)  nettoyer ;;
  --fermer)    fermer ;;
  *)
    printf '\n  Usage :\n'
    printf '    %s --controles   prérequis, aucune écriture\n' "$(basename "$0")"
    printf '    %s --ouvrir      pose l interrupteur et redémarre\n' "$(basename "$0")"
    printf '    %s --eprouver    envoie UN prospect fictif\n' "$(basename "$0")"
    printf '    %s --nettoyer    retire le fictif du côté site\n' "$(basename "$0")"
    printf '    %s --fermer      retire l interrupteur\n\n' "$(basename "$0")"
    exit 1 ;;
esac
