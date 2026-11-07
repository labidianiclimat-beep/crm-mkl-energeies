#!/bin/sh
# Applique les cinq migrations du module marketing sur MKL CRM RECETTE.
#
# L'ordre n'est pas celui des noms de fichiers : `web_lead_idempotence`
# précède `lead_attribution` parce qu'elle pose les tables de file que
# l'attribution référence, et `search_path_hardening` vient en dernier pour
# durcir tout ce qui a été créé avant.
#
# Chaque migration est appliquée en tout ou rien, suivie d'une vérification.
# Le premier échec arrête la série : les migrations déjà passées restent en
# place, et rien n'est défait automatiquement.

set -eu

cd "$(dirname "$0")/../.." || exit 1
. scripts/recette/cible.sh

MIGRATIONS="20261102_google_oauth_states
20261102_web_lead_ingest
20261105_web_lead_idempotence
20261102_lead_attribution
20261105_search_path_hardening"

titre "Vérification de la cible"
garde_cible
oui "cluster conforme à la recette, et différent de celui de production"
oui "serveur à l adresse publiée pour la recette"
printf '    projet %s, PostgreSQL %s\n' "$MKL_RECETTE_REF" "$(q "select current_setting('server_version')")"

AVANT="$(etat_complet)"
printf '    état initial : %s\n' "$AVANT"

RANG=0
for NOM in $MIGRATIONS; do
  RANG=$((RANG + 1))
  FICHIER="supabase/migrations/$NOM.sql"
  titre "Migration $RANG sur 5 — $NOM"

  [ -r "$FICHIER" ] || { non "fichier introuvable : $FICHIER"; exit 1; }

  # La cible est revérifiée avant chaque écriture, et non une seule fois au
  # début : rien ne garantit qu'un fichier d'accès ne change pas entre-temps.
  garde_cible

  DEBUT="$(etat_complet)"
  if ecrire "$FICHIER" 2>&1 | grep -vE "NOTICE|already exists|does not exist" | sed 's/^/    /'; then
    :
  fi
  oui "appliquée"

  FIN="$(etat_complet)"
  echo "$DEBUT|$FIN" | awk -F'|' '{
    split("tables fonctions index politiques déclencheurs", lbl, " ");
    ligne = "";
    for (i = 1; i <= 5; i++) {
      d = $(i + 6) - $i;
      if (d != 0) ligne = ligne sprintf("%s %+d   ", lbl[i], d);
    }
    printf "    apport : %s\n", (ligne == "" ? "aucun objet nouveau" : ligne);
  }'

  SANS_RLS="$(q "select count(*) from pg_tables where schemaname='public' and not rowsecurity")"
  if [ "$SANS_RLS" = "0" ]; then
    oui "toutes les tables ont RLS activée"
  else
    non "$SANS_RLS table(s) sans RLS"
    q "select tablename from pg_tables where schemaname='public' and not rowsecurity" | sed 's/^/      /'
    exit 1
  fi
done

titre "État final"
printf '    avant les cinq : %s\n' "$AVANT"
printf '    après les cinq : %s\n' "$(etat_complet)"
printf '    (tables|fonctions|index|politiques|déclencheurs|sans RLS)\n\n'
