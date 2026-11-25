# Connexion à MKL CRM RECETTE, et vérification de la cible.
# Fichier destiné à être inclus par `.`, jamais exécuté seul.
#
# L'identité n'est pas déduite de la présence d'une table : elle repose sur
# l'identifiant unique du cluster PostgreSQL, que `pg_control_system()` lit
# dans le fichier de contrôle du serveur. Il est tiré au hasard à
# l'initialisation du cluster et ne peut pas coïncider entre deux projets.
#
# Trois contrôles indépendants, tous interrogés auprès du serveur atteint :
#   1. l'identifiant du cluster doit être celui de la recette ;
#   2. il ne doit jamais être celui de la production, nommé explicitement ;
#   3. l'adresse du serveur doit être celle que le DNS publie pour la recette.

CLUSTER_RECETTE="7703759698107299042"
CLUSTER_PRODUCTION="7662760187650847164"
ADRESSE_RECETTE="2a05:d018:d40:d201:9e41:18e:c35e:53fc"
REF_RECETTE="xqbjfytrssslnsxxdrou"
REF_PRODUCTION="rzkwmwtjnwnmmcexwoov"

FICHIER_ACCES="$HOME/.mkl-secrets/recette-db.env"
PSQL="$HOME/.mkl-pgtools/bin/psql"

oui()   { printf '\033[32m  ✓\033[0m %s\n' "$1"; }
non()   { printf '\033[31m  ✗\033[0m %s\n' "$1"; }
avert() { printf '\033[33m  !\033[0m %s\n' "$1"; }
titre() { printf '\n\033[1m%s\033[0m\n' "$1"; }

[ -x "$PSQL" ] || { non "psql absent de $PSQL"; exit 1; }
[ -r "$FICHIER_ACCES" ] || {
  non "accès recette non enregistré"
  printf '  Lancez : sh scripts/recette/enregistrer-acces-recette.sh\n\n'
  exit 1
}

# shellcheck disable=SC1090
. "$FICHIER_ACCES"

[ "${MKL_RECETTE_REF:-}" = "$REF_RECETTE" ] || {
  non "le fichier d accès ne vise pas la recette"; exit 1; }
case "${MKL_RECETTE_HOTE:-}" in
  *"$REF_PRODUCTION"*) non "l hôte enregistré cite la production : arrêt"; exit 1 ;;
esac

URL="postgresql://postgres.$MKL_RECETTE_REF@$MKL_RECETTE_HOTE:5432/postgres?sslmode=require"

q()      { PGPASSWORD="$MKL_RECETTE_MDP" "$PSQL" "$URL" -tAc "$1"; }
ecrire() { PGPASSWORD="$MKL_RECETTE_MDP" "$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -f "$1"; }

garde_cible() {
  vu="$(q "select system_identifier::text from pg_control_system()" 2>/dev/null || echo "")"
  [ -n "$vu" ] || { non "impossible de lire l identifiant du cluster"; exit 1; }

  if [ "$vu" = "$CLUSTER_PRODUCTION" ]; then
    non "cluster de PRODUCTION reconnu : arrêt immédiat, aucune écriture"
    exit 1
  fi
  if [ "$vu" != "$CLUSTER_RECETTE" ]; then
    non "cluster inconnu : ce n est ni la recette ni la production"
    printf '    Arrêt par précaution, aucune écriture.\n\n'
    exit 1
  fi

  adresse="$(q "select coalesce(host(inet_server_addr()), '-')" 2>/dev/null || echo "-")"
  if [ "$adresse" != "$ADRESSE_RECETTE" ]; then
    non "le serveur atteint n est pas à l adresse publiée pour la recette"
    printf '    Arrêt par précaution, aucune écriture.\n\n'
    exit 1
  fi
}

etat_complet() {
  q "select
      (select count(*) from pg_tables where schemaname='public') || '|' ||
      (select count(*) from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
         where ns.nspname='public') || '|' ||
      (select count(*) from pg_indexes where schemaname='public') || '|' ||
      (select count(*) from pg_policies where schemaname='public') || '|' ||
      (select count(*) from pg_trigger tg join pg_class c on c.oid=tg.tgrelid
         join pg_namespace ns on ns.oid=c.relnamespace
         where ns.nspname='public' and not tg.tgisinternal) || '|' ||
      (select count(*) from pg_tables where schemaname='public' and not rowsecurity)"
}
