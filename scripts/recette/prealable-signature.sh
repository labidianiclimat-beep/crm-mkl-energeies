#!/bin/sh
# Contrôles préalables du module signature. Lecture seule, recette uniquement.
set -eu
cd "$(dirname "$0")/../.."
. ./scripts/recette/cible.sh
garde_cible

ok=0
ko=0
check() {
  nom="$1"
  attente="$2"
  vu="$(q "$3" | tr -d '[:space:]')"
  if [ "$vu" = "$attente" ]; then
    oui "$nom"
    ok=$((ok + 1))
  else
    non "$nom"
    ko=$((ko + 1))
  fi
}

titre "Contrôles préalables — lecture seule"
check "bucket privé" "false" \
  "select public::text from storage.buckets where id = 'devis-signatures'"
check "PDF limité à 4 Mo" "4000000" \
  "select file_size_limit::text from storage.buckets where id = 'devis-signatures'"
check "aucune écriture storage pour le bucket" "0" \
  "select count(*)::text from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'devis_signatures%' and cmd <> 'SELECT'"
check "RLS sur les deux tables de preuve" "2" \
  "select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('devis_signatures', 'devis_signature_journal') and c.relrowsecurity"
check "authenticated ne peut pas exécuter la transaction" "false" \
  "select has_function_privilege('authenticated', 'public.commit_devis_signature(uuid,text,uuid,text,date,text,text,text,text,uuid)', 'execute')::text"
check "service_role peut exécuter la transaction" "true" \
  "select has_function_privilege('service_role', 'public.commit_devis_signature(uuid,text,uuid,text,date,text,text,text,text,uuid)', 'execute')::text"
check "aucune mise à jour ni suppression directe des preuves" "0" \
  "select count(*)::text from pg_policies where schemaname = 'public' and tablename in ('devis_signatures', 'devis_signature_journal') and cmd in ('UPDATE', 'DELETE')"
check "authenticated ne peut pas insérer de preuve" "false" \
  "select has_table_privilege('authenticated', 'public.devis_signatures', 'INSERT')::text"
check "anon ne peut pas insérer de preuve" "false" \
  "select has_table_privilege('anon', 'public.devis_signatures', 'INSERT')::text"
check "aucune politique d insertion" "0" \
  "select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'devis_signatures' and cmd = 'INSERT'"
check "aucune comparaison d organisation tautologique" "0" \
  "select count(*)::text from pg_policies where ((schemaname = 'public' and tablename in ('devis_signatures', 'devis_signature_journal')) or policyname like 'devis_signatures%') and (coalesce(qual, '') || coalesce(with_check, '') like '%d.organization_id = d.organization_id%' or coalesce(qual, '') || coalesce(with_check, '') like '%actor.organization_id = actor.organization_id%')"
check "le pdf est lié au devis et à l organisation" "1" \
  "select count(*)::text from pg_policies where policyname = 'devis_signatures_storage_select' and qual like '%foldername%' and qual like '%devis_id%' and qual like '%organization_id%'"
check "la transaction ne modifie ni client ni rendez-vous" "true" \
  "select (position('update public.clients' in lower(prosrc)) = 0 and position('update public.commercial_appointments' in lower(prosrc)) = 0)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'commit_devis_signature'"
check "crm_files absent, donc ce n est pas la production" "0" \
  "select case when to_regclass('public.crm_files') is null then 0 else 1 end::text"

printf '\n  %s contrôle(s) réussi(s), %s échec(s). Aucune écriture.\n\n' "$ok" "$ko"
[ "$ko" -eq 0 ]
