/**
 * Retour arrière, tel qu'il est écrit dans la procédure de production.
 *
 * Ce script exécute littéralement les instructions du tableau de retour
 * arrière de `docs/PROCEDURE-MISE-EN-PRODUCTION.md`, puis vérifie qu'il ne
 * reste rien du module et que la saisie fonctionne de nouveau.
 *
 * Une procédure de retour arrière qui n'a jamais été jouée n'est pas une
 * procédure : c'est une intention. Deux erreurs y avaient déjà été prises de
 * cette façon, une signature de fonction inexacte et deux déclencheurs posés
 * sur une table en service que la suppression des tables du module n'emporte
 * pas.
 *
 *   bash scripts/pg-test/install.sh
 *   node scripts/pg-test/06-retour-arriere.mjs
 */

import { ORG, journal, preparerBase } from "./lib.mjs";

const log = journal();
const { sql } = await preparerBase(process.env.PG_TEST_DB_RA || "mkl_retour");
await sql`insert into public.organizations (id, name) values (${ORG}, 'MKL Essai') on conflict (id) do nothing`;

log.titre("Désinstallation de la migration 4, la seule à toucher l'existant");

// Une fiche créée avant la désinstallation : elle doit survivre.
const [avant] = await sql`
  insert into public.commercial_opportunities (organization_id, name, phone, stage, source)
  values (${ORG}, 'Fiche antérieure', '0612345678', 'Qualifié', 'Prospection')
  returning id
`;

await sql.unsafe(`
  drop trigger commercial_opportunities_origin_guard on public.commercial_opportunities;
  drop trigger commercial_opportunities_source_guard on public.commercial_opportunities;
  drop table public.lead_attribution, public.lead_origin_history cascade;
  alter table public.commercial_opportunities
    drop column origin_channel, drop column origin_category,
    drop column origin_subtype, drop column origin_set_at;
`);
log.ok("les instructions de la procédure passent toutes, sans adaptation");

const [{ n }] = await sql`
  select count(*)::int as n from pg_trigger
   where tgrelid = 'public.commercial_opportunities'::regclass and not tgisinternal
     and tgname like 'commercial_opportunities_%guard'
`;
if (n === 0) log.ok("aucun garde-fou du module ne subsiste sur la table en service");
else log.ko(`${n} garde-fou(s) résiduel(s) : la saisie resterait contrainte par un module absent`);

const [{ c }] = await sql`
  select count(*)::int as c from information_schema.columns
   where table_schema = 'public' and table_name = 'commercial_opportunities'
     and column_name like 'origin_%'
`;
if (c === 0) log.ok("les quatre colonnes d'origine sont retirées");
else log.ko(`${c} colonne(s) résiduelle(s)`);

const [{ k }] = await sql`
  select count(*)::int as k from pg_constraint
   where conrelid = 'public.commercial_opportunities'::regclass
     and conname = 'commercial_opportunities_origin_chk'
`;
if (k === 0) log.ok("la contrainte de cohérence part avec les colonnes");
else log.ko("la contrainte de cohérence subsiste sans ses colonnes");

const [survivante] = await sql`
  select name, stage, source from public.commercial_opportunities where id = ${avant.id}
`;
if (survivante?.source === "Prospection" && survivante.stage === "Qualifié") {
  log.ok("la fiche créée avant la désinstallation est intacte");
} else {
  log.ko("une fiche commerciale a été altérée par le retour arrière");
}

try {
  await sql`
    insert into public.commercial_opportunities (organization_id, name, phone, stage, source)
    values (${ORG}, 'Après retour arrière', '0698765432', 'Nouveau', 'Prospection')
  `;
  log.ok("la saisie d'un prospect « Prospection » fonctionne après désinstallation");
} catch (error) {
  log.ko("la saisie est cassée après le retour arrière", error.message);
}

log.titre("Signatures citées dans la procédure");

// Une signature inexacte fait échouer le retour arrière au pire moment.
for (const signature of [
  "public.purge_web_lead_payloads(integer)",
  "public.purge_google_oauth_states(integer)",
  "public.enqueue_web_lead(uuid, text, text, jsonb, timestamptz, integer)",
]) {
  const [{ existe }] = await sql`select to_regprocedure(${signature}) is not null as existe`;
  if (existe) log.ok(`${signature} existe telle quelle`);
  else log.ko(`${signature} n'existe pas : la procédure cite une mauvaise signature`);
}

log.titre("Désinstallation des migrations 1 à 3");

await sql.unsafe(`
  drop index public.commercial_opportunities_web_lead_idx;
  drop index public.commercial_appointments_web_lead_idx;
  drop index public.web_lead_submissions_submission_idx;
  drop function public.purge_web_lead_payloads(integer);
  drop table public.web_lead_events, public.web_lead_submissions cascade;
  drop table public.google_oauth_states cascade;
`);
log.ok("les migrations 1 à 3 se désinstallent sans toucher aux tables du CRM");

// `lead_attribution_submission_idx` est déjà parti avec sa table : le citer de
// nouveau échouerait. C'est pourquoi la procédure l'énumère au palier 3 mais
// que l'ordre inverse le rend sans objet.
const [{ restant }] = await sql`
  select count(*)::int as restant from pg_tables
   where schemaname = 'public'
     and tablename in ('lead_attribution', 'lead_origin_history',
                       'web_lead_submissions', 'web_lead_events', 'google_oauth_states')
`;
if (restant === 0) log.ok("aucune table du module ne subsiste");
else log.ko(`${restant} table(s) du module subsistent`);

const [{ crm }] = await sql`
  select count(*)::int as crm from pg_tables
   where schemaname = 'public'
     and tablename in ('commercial_opportunities', 'commercial_appointments', 'clients', 'devis')
`;
if (crm === 4) log.ok("les quatre tables commerciales du CRM sont toujours là");
else log.ko(`${crm} table(s) commerciale(s) sur 4`);

await sql.end();
process.exitCode = log.bilan() ? 0 : 1;
