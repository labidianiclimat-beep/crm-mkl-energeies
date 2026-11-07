/**
 * Découpe le socle en lots applicables, et vérifie chaque lot en local.
 *
 * Le socle complet pèse 2,6 Mo. L'appliquer en un seul envoi marche en local
 * mais expose à une limite de taille côté service distant, et surtout ne dit
 * rien sur l'endroit où ça a cassé en cas d'échec. Découpé en lots, un échec
 * nomme son lot et laisse les précédents en place.
 *
 * Les coupures tombent entre migrations, jamais à l'intérieur de l'une
 * d'elles : chaque lot est donc un ensemble cohérent de migrations entières.
 *
 * Chaque lot est ensuite éprouvé en séquence sur une base locale neuve, dans
 * l'ordre, pour garantir que le découpage n'a pas cassé une dépendance.
 *
 * Rien n'est appliqué à Supabase par ce script.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { RACINE, fichierSql, migrations, recreerBase } from "../pg-test/lib.mjs";

const ORDRE = resolve(RACINE, "scripts/recette/ordre-applique.txt");
const LOTS = resolve(RACINE, "scripts/recette/lots");
const TAILLE_CIBLE = 400 * 1024;

const CINQ = [
  "20261102_google_oauth_states.sql",
  "20261102_web_lead_ingest.sql",
  "20261105_web_lead_idempotence.sql",
  "20261102_lead_attribution.sql",
  "20261105_search_path_hardening.sql",
];

const noms = readFileSync(ORDRE, "utf8")
  .split("\n")
  .map(ligne => ligne.trim())
  .filter(ligne => ligne && !ligne.startsWith("#"))
  .filter(nom => !CINQ.includes(nom));

const sources = new Map(migrations().map(item => [item.nom, item.sql]));

// Regroupement glouton, en respectant l'ordre et les frontières de fichiers.
const lots = [];
let courant = [];
let poids = 0;
for (const nom of noms) {
  const sql = sources.get(nom);
  if (courant.length > 0 && poids + sql.length > TAILLE_CIBLE) {
    lots.push(courant);
    courant = [];
    poids = 0;
  }
  courant.push(nom);
  poids += sql.length;
}
if (courant.length) lots.push(courant);

rmSync(LOTS, { recursive: true, force: true });
mkdirSync(LOTS, { recursive: true });

const fiches = lots.map((lot, index) => {
  const numero = String(index + 1).padStart(2, "0");
  const nom = `socle_${numero}`;
  const corps = [
    `-- ${nom} : ${lot.length} migration(s) du socle MKL CRM.`,
    "-- Lot assemblé par scripts/recette/decouper-socle.mjs.",
    ...lot.map(item => `--   ${item}`),
    "",
    ...lot.map(item => `\n-- ${"-".repeat(70)}\n-- ${item}\n-- ${"-".repeat(70)}\n\n${sources.get(item).trimEnd()}\n`),
  ].join("\n");
  writeFileSync(resolve(LOTS, `${nom}.sql`), `${corps}\n`);
  return { nom, migrations: lot, octets: corps.length };
});

console.log(`${noms.length} migrations réparties en ${fiches.length} lots :`);
for (const fiche of fiches) {
  console.log(`  ${fiche.nom}  ${String(fiche.migrations.length).padStart(2)} migration(s)  ${String(Math.round(fiche.octets / 1024)).padStart(4)} Ko`);
}

// --------------------------------------------------------------------------
// Vérification : les lots s'appliquent dans l'ordre sur une base neuve.
// --------------------------------------------------------------------------

const sql = await recreerBase("mkl_lots");
await sql.unsafe(fichierSql("scripts/pg-test/supabase-shim.sql"));

console.log("\nApplication des lots en séquence :");
for (const fiche of fiches) {
  const contenu = readFileSync(resolve(LOTS, `${fiche.nom}.sql`), "utf8");
  try {
    await sql.unsafe(contenu);
    console.log(`  ${fiche.nom}  appliqué`);
  } catch (error) {
    console.error(`  ${fiche.nom}  ÉCHEC : ${error.message.split("\n")[0]}`);
    await sql.end();
    process.exit(1);
  }
}

const [etat] = await sql`
  select
    (select count(*)::int from pg_tables where schemaname = 'public') as tables,
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public') as fonctions
`;
console.log(`\n  ${etat.tables} tables, ${etat.fonctions} fonctions`);

// La production compte 78 tables publiques et n'a pas encore le module
// marketing. Le socle doit donc tomber sur le même nombre : c'est le contrôle
// de fidélité le plus parlant dont nous disposions.
const ATTENDU_PRODUCTION = 78;
if (etat.tables === ATTENDU_PRODUCTION) {
  console.log(`  conforme aux ${ATTENDU_PRODUCTION} tables de la production`);
} else {
  console.log(`  ÉCART : la production en compte ${ATTENDU_PRODUCTION}`);
}

await sql.end();
process.exit(etat.tables === ATTENDU_PRODUCTION ? 0 : 1);
