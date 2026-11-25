/**
 * Exécution de toutes les migrations sur une base PostgreSQL réelle.
 *
 * Jusqu'ici les migrations n'avaient jamais été exécutées nulle part : leur
 * syntaxe n'était validée que par relecture et par des contrôles structurels
 * de texte. Ce script les joue réellement, dans l'ordre des noms de fichiers,
 * sur une base jetable.
 *
 *   bash scripts/pg-test/install.sh
 *   node scripts/pg-test/01-migrations.mjs
 *
 * Chaque migration est jouée dans sa propre transaction. Une erreur n'arrête
 * pas la suite : le but est de dresser la liste complète de ce qui passe et de
 * ce qui ne passe pas, pas de s'arrêter au premier problème.
 */

import { appliquerMigrations, fichierSql, journal, migrations, recreerBase } from "./lib.mjs";

const BASE = process.env.PG_TEST_DB || "mkl_test";
if (BASE !== "mkl_test") {
  console.error(`Cible refusée : la base demandée est « ${BASE} », seule mkl_test est autorisée pour cette répétition.`);
  process.exit(1);
}

const log = journal();
log.titre(`Migrations du CRM sur une base PostgreSQL réelle — base « ${BASE} »`);

const sql = await recreerBase(BASE);
const version = (await sql`select version()`)[0].version;
log.info(version.split(" on ")[0]);

log.titre("Environnement Supabase simulé");
try {
  await sql.unsafe(fichierSql("scripts/pg-test/supabase-shim.sql"));
  log.ok("rôles, schéma auth, schéma storage et privilèges par défaut en place");
} catch (error) {
  log.ko("environnement Supabase impossible à créer", error.message);
  await sql.end();
  process.exit(1);
}

log.titre("Historique des migrations");
const fichiers = migrations();
log.info(`${fichiers.length} fichiers à jouer`);

const resultat = await appliquerMigrations(sql, fichiers);
if (resultat.preparation) log.ok("préparation de catalogue appliquée avant les trois fichiers dépendants");
else log.ko("préparation de catalogue non appliquée");

let appliquees = 0;
resultat.passes.forEach((passe, index) => {
  appliquees += passe.reussis.length;
  log.info(`passe ${index + 1} : ${passe.reussis.length} migration(s) appliquée(s), ${passe.echecs.length} restante(s)`);
  for (const echec of passe.echecs) log.info(`  échec ${echec.nom} — ${echec.message}`);
});

if (resultat.restants.length === 0 && appliquees === fichiers.length) {
  log.ok(`${fichiers.length} migrations appliquées sur ${fichiers.length}`);
} else {
  log.ko(`${resultat.restants.length} migration(s) en échec sur ${fichiers.length}`);
  for (const echec of resultat.restants) {
    console.log(`\n    ${echec.nom}`);
    console.log(`      ${echec.motif}`);
  }
}

// ---------------------------------------------------------------------------
// Ce que les migrations ont réellement produit
// ---------------------------------------------------------------------------

log.titre("Objets attendus par le module marketing");

const tables = (
  await sql`
    select table_name
      from information_schema.tables
     where table_schema = 'public'
     order by 1
  `
).map(row => row.table_name);

for (const attendue of [
  "commercial_opportunities",
  "commercial_appointments",
  "lead_attribution",
  "web_lead_submissions",
  "web_lead_events",
  "profiles",
]) {
  if (tables.includes(attendue)) log.ok(`table ${attendue}`);
  else log.ko(`table ${attendue} absente`);
}

log.titre("Index uniques anti-doublons");

const index = await sql`
  select indexname, indexdef
    from pg_indexes
   where schemaname = 'public'
     and indexname in (
       'commercial_opportunities_web_lead_idx',
       'commercial_appointments_web_lead_idx',
       'lead_attribution_submission_idx',
       'web_lead_submissions_submission_idx'
     )
   order by 1
`;

for (const attendu of [
  "commercial_opportunities_web_lead_idx",
  "commercial_appointments_web_lead_idx",
  "lead_attribution_submission_idx",
  "web_lead_submissions_submission_idx",
]) {
  const trouve = index.find(row => row.indexname === attendu);
  if (!trouve) {
    log.ko(`index ${attendu} absent`);
    continue;
  }
  if (!/UNIQUE/i.test(trouve.indexdef)) {
    log.ko(`index ${attendu} existe mais n'est pas unique`);
    continue;
  }
  log.ok(`index unique ${attendu}`);
  log.info(trouve.indexdef.replace(/^CREATE UNIQUE INDEX /, ""));
}

// Le piège PostgreSQL que la contrainte doit éviter : NULL n'est jamais égal à
// NULL, donc un index sur `touch_role` brut ne dédoublonnerait pas les lignes
// à rôle absent. La présence de `coalesce` dans la définition est vérifiable.
const attribution = index.find(row => row.indexname === "lead_attribution_submission_idx");
if (attribution && /COALESCE\(touch_role/i.test(attribution.indexdef)) {
  log.ok("la clé des contacts neutralise le piège des valeurs NULL");
} else {
  log.ko("la clé des contacts ne neutralise pas les valeurs NULL");
}

log.titre("Fonctions du module");

const fonctions = (
  await sql`
    select p.proname,
           p.prosecdef as definer,
           coalesce(p.proconfig, '{}'::text[]) as config
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
     order by 1
  `
);

for (const attendue of [
  "enqueue_web_lead",
  "reserve_web_leads",
  "settle_web_lead",
  "requeue_web_lead",
  "attach_web_lead_opportunity",
  "link_web_lead_to_opportunity",
  "discard_web_lead",
  "web_lead_retention_scan",
  "purge_web_lead_payloads",
]) {
  const trouvee = fonctions.find(row => row.proname === attendue);
  if (trouvee) log.ok(`fonction ${attendue}${trouvee.definer ? " (security definer)" : ""}`);
  else log.ko(`fonction ${attendue} absente`);
}

// L'ancienne purge sans paramètre doit avoir disparu : la laisser rendrait
// l'appel `purge_web_lead_payloads()` ambigu.
const purges = fonctions.filter(row => row.proname === "purge_web_lead_payloads");
if (purges.length === 1) log.ok("une seule version de purge_web_lead_payloads, l'appel reste non ambigu");
else log.ko(`${purges.length} versions de purge_web_lead_payloads coexistent`);

log.titre("Catalogue Aquarea et Zubadan");

const referencesAttendues = [
  "wh-wxg09me5",
  "wh-wxg12me5",
  "wh-wxg09me8",
  "wh-wxg12me8",
  "wh-wxg16me8",
  "wh-wxg20me8",
  "wh-wxg25me8",
  "wh-wxg30me8",
  "wh-adc0316m3e52",
  "wh-adc0316m6e52",
  "wh-adc0316m9e82",
  "wh-cme5",
  "wh-cme8",
  "wh-cme8l",
  "cz-rtw2taw1c",
  "puhz-shw230yka2",
];
const articlesCatalogue = await sql`
  select lower(reference) as reference, fiche_nom
    from public.articles
   where lower(reference) = any(${referencesAttendues})
`;
const presentes = new Set(articlesCatalogue.map(row => row.reference));
for (const reference of referencesAttendues) {
  if (presentes.has(reference)) log.ok(`article ${reference}`);
  else log.ko(`article ${reference} absent`);
}
const avecBrochure = articlesCatalogue.filter(row => row.fiche_nom === "A2W-Aquarea-M_FR.pdf");
if (avecBrochure.length > 0) log.ok(`${avecBrochure.length} article(s) Aquarea portent la brochure`);
else log.ko("aucun article Aquarea ne porte la brochure");

const tableTempo = await sql`select to_regclass('public._aquarea_brochure_part') as reg`;
if (tableTempo[0].reg) log.ko("la table temporaire de brochure est encore présente");
else log.ok("aucune table temporaire de brochure");

log.titre("Dette search_path");

const sansChemin = fonctions.filter(
  row => !row.config.some(option => option.startsWith("search_path="))
);
log.info(`${sansChemin.length} fonction(s) sans search_path fixé`);
if (sansChemin.filter(row => row.definer).length === 0) {
  log.ok("aucune fonction SECURITY DEFINER n'est sans search_path");
} else {
  log.ko("une fonction SECURITY DEFINER est sans search_path");
}

await sql.end();
process.exitCode = log.bilan() ? 0 : 1;
