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
// Une fois les brochures allégées, le socle tient en 276 Ko. Des lots de
// 60 Ko en donnent cinq : assez petits pour qu'un échec nomme précisément son
// lot, assez gros pour ne pas multiplier les étapes.
const TAILLE_CIBLE = Number(process.env.MKL_TAILLE_LOT || 60 * 1024);

const CINQ = [
  "20261102_google_oauth_states.sql",
  "20261102_web_lead_ingest.sql",
  "20261105_web_lead_idempotence.sql",
  "20261102_lead_attribution.sql",
  "20261105_search_path_hardening.sql",
];

// Les brochures Aquarea pèsent 2,3 Mo des 2,6 Mo du socle, et ce poids est
// entièrement du PDF encodé en base64. Leur seul apport structurel est la
// table ci-dessous : tout le reste est un `truncate` suivi d'inserts de
// morceaux. Pour éprouver des migrations de schéma, la table suffit, et la
// recette n'a aucun besoin du contenu des brochures.
//
// L'allègement est donc volontaire et nommé, pas un oubli : il ramène le
// socle à une taille applicable par l'outil officiel Supabase, sans mot de
// passe de base ni manipulation manuelle. Le compte de tables est préservé.
const BROCHURES = [
  "20261015_aquarea_m_brochure_1.sql",
  "20261015_aquarea_m_brochure_2.sql",
  "20261015_aquarea_m_brochure_3.sql",
  "20261015_aquarea_m_brochure_4.sql",
];

const STRUCTURE_BROCHURES = `-- Structure seule des brochures Aquarea : les morceaux de PDF encodés en
-- base64 sont écartés du socle de recette. Voir decouper-socle.mjs.
create table if not exists public._aquarea_brochure_part (
  n integer primary key,
  part text not null
);`;

const noms = readFileSync(ORDRE, "utf8")
  .split("\n")
  .map(ligne => ligne.trim())
  .filter(ligne => ligne && !ligne.startsWith("#"))
  .filter(nom => !CINQ.includes(nom));

const sources = new Map(migrations().map(item => [item.nom, item.sql]));

// Une seule des quatre brochures porte la table ; les autres disparaissent.
let structurePosee = false;
for (const nom of BROCHURES) {
  if (!sources.has(nom)) continue;
  sources.set(nom, structurePosee ? "" : STRUCTURE_BROCHURES);
  structurePosee = true;
}

// Les brochures vidées de leurs données n'ont plus rien à appliquer.
const retenus = noms.filter(nom => (sources.get(nom) || "").trim().length > 0);

// Regroupement glouton, en respectant l'ordre et les frontières de fichiers.
const lots = [];
let courant = [];
let poids = 0;
for (const nom of retenus) {
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

const allegees = noms.length - retenus.length;
console.log(`${retenus.length} migrations réparties en ${fiches.length} lots${allegees ? `, ${allegees} brochure(s) allégée(s)` : ""} :`);
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
