/**
 * Calcule l'ordre d'application réel des migrations du dépôt.
 *
 * L'ordre des noms de fichiers n'est pas l'ordre des dépendances : certaines
 * migrations tardives sont requises par des migrations antérieures. L'outillage
 * local le contourne en repassant plusieurs fois sur la liste jusqu'à ce
 * qu'aucune nouvelle migration ne passe.
 *
 * Ce script joue cette résolution sur le PostgreSQL local, puis écrit l'ordre
 * obtenu dans un fichier. La recette peut alors recevoir le schéma en une
 * seule passe, sans redécouvrir l'ordre contre une base distante.
 *
 * Aucune base distante n'est contactée. Rien n'est appliqué à Supabase.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { RACINE, fichierSql, migrations, recreerBase } from "../pg-test/lib.mjs";

const sql = await recreerBase("mkl_ordre");
await sql.unsafe(fichierSql("scripts/pg-test/supabase-shim.sql"));

const reussies = [];
const echecs = new Map();
let restants = migrations();
let avant = Infinity;
let passe = 0;

while (restants.length > 0 && restants.length < avant) {
  avant = restants.length;
  passe += 1;
  const suivants = [];
  for (const migration of restants) {
    try {
      await sql.begin(tx => tx.unsafe(migration.sql));
      reussies.push({ nom: migration.nom, passe });
      echecs.delete(migration.nom);
    } catch (error) {
      echecs.set(migration.nom, error.message.split("\n")[0]);
      suivants.push(migration);
    }
  }
  restants = suivants;
}

const parPasse = new Map();
for (const item of reussies) parPasse.set(item.passe, (parPasse.get(item.passe) || 0) + 1);

console.log(`Migrations du dépôt      : ${migrations().length}`);
console.log(`Appliquées               : ${reussies.length}`);
console.log(`Passes nécessaires       : ${passe}`);
for (const [n, compte] of [...parPasse].sort((a, b) => a[0] - b[0])) {
  console.log(`  passe ${n} : ${compte} migration(s)`);
}

console.log(`\nJamais appliquées        : ${restants.length}`);
for (const item of restants) {
  console.log(`  ${item.nom}`);
  console.log(`      ${echecs.get(item.nom)}`);
}

const sortie = resolve(RACINE, "scripts/recette/ordre-applique.txt");
writeFileSync(
  sortie,
  [
    "# Ordre d'application résolu sur PostgreSQL 17 local.",
    "# Calculé par scripts/recette/ordre-migrations.mjs, à ne pas éditer à la main.",
    `# ${reussies.length} migrations, ${passe} passes de résolution.`,
    "",
    ...reussies.map(item => item.nom),
    "",
  ].join("\n")
);
console.log(`\nOrdre écrit dans ${sortie.replace(RACINE, ".")}`);

// Les cinq du module marketing doivent figurer dans cet ordre, et dans celui
// que la procédure de mise en production annonce.
const CINQ = [
  "20261102_google_oauth_states.sql",
  "20261102_web_lead_ingest.sql",
  "20261105_web_lead_idempotence.sql",
  "20261102_lead_attribution.sql",
  "20261105_search_path_hardening.sql",
];
const rangs = CINQ.map(nom => ({ nom, rang: reussies.findIndex(item => item.nom === nom) }));
console.log("\nPosition des cinq migrations marketing :");
for (const { nom, rang } of rangs) {
  console.log(`  ${rang === -1 ? "ABSENTE" : String(rang + 1).padStart(3)}  ${nom}`);
}

await sql.end();
