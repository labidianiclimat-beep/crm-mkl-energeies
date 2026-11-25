/**
 * Vérifie, après compilation, quel projet Supabase est gravé dans le build.
 *
 * Le contrôle d'avant-build lit les variables. Celui-ci lit le résultat, ce
 * qui n'est pas la même chose : Next.js remplace les `NEXT_PUBLIC_*` par leur
 * valeur dans le code livré, y compris côté serveur, et c'est cette valeur
 * figée qui décidera de la base appelée pendant toute la vie du déploiement.
 * Entre les deux contrôles il reste de la place pour une erreur : une variable
 * posée sur le mauvais environnement, un cache de build réutilisé, une
 * compilation lancée à la main avec un environnement d'essai.
 *
 * Le test est simple et ne demande aucun secret. On relève tous les
 * identifiants de projet Supabase présents dans les fichiers compilés, puis on
 * vérifie qu'il n'y en a qu'un, et que c'est celui attendu pour cet
 * environnement.
 *
 *   node scripts/verifier-build-grave.mjs
 *
 * Le code de sortie vaut 1 en cas d'anomalie, de quoi arrêter un build.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const DOSSIERS = [".next/server", ".next/static"];
const MOTIF = /\b([a-z]{20})\.supabase\.(?:co|in|net)\b/g;

function fichiersJs(racine) {
  const trouves = [];
  if (!existsSync(racine)) return trouves;
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    let infos;
    try { infos = statSync(chemin); } catch { continue; }
    if (infos.isDirectory()) {
      // `.next/standalone` recopie le build entier : l'explorer reviendrait à
      // compter deux fois les mêmes fichiers.
      if (entree === "standalone") continue;
      trouves.push(...fichiersJs(chemin));
    } else if (entree.endsWith(".js") || entree.endsWith(".mjs")) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

const refProduction = String(process.env.SUPABASE_PRODUCTION_REF || "").trim().toLowerCase();
const environnement = String(process.env.VERCEL_ENV || "").trim().toLowerCase();

// L'identifiant attendu se déduit de la variable, qui n'est pas figée, et non
// d'une liste écrite en dur : la recette peut changer de projet.
const attendu = (() => {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const trouve = /^https?:\/\/([a-z0-9]{16,})\.supabase\.(?:co|in|net)/i.exec(url);
  return trouve ? trouve[1].toLowerCase() : "";
})();

const fichiers = [...new Set(DOSSIERS.flatMap(fichiersJs))];
const graves = new Map();
for (const fichier of fichiers) {
  let contenu;
  try { contenu = readFileSync(fichier, "utf8"); } catch { continue; }
  for (const trouve of contenu.matchAll(MOTIF)) {
    const ref = trouve[1].toLowerCase();
    if (!graves.has(ref)) graves.set(ref, []);
    const liste = graves.get(ref);
    if (liste.length < 3) liste.push(fichier);
  }
}

const nom = ref => (ref === refProduction ? `${ref} (PRODUCTION)` : ref);

console.log(`Build : ${fichiers.length} fichier(s) compilé(s) examiné(s).`);
console.log(`Environnement : ${environnement || "local"}.`);
console.log(`Projet attendu : ${attendu ? nom(attendu) : "inconnu, variable absente"}.`);

if (!graves.size) {
  // Rien de gravé veut dire que le code n'atteint jamais Supabase, ce qui
  // n'arrive pas avec ce CRM : c'est le signe d'un build incomplet.
  console.error("Anomalie : aucun identifiant de projet Supabase gravé dans le build.");
  process.exit(1);
}

for (const [ref, exemples] of graves) {
  console.log(`  gravé : ${nom(ref)} — ${exemples.map(f => f.replace(/^\.next\//, "")).join(", ")}`);
}

let anomalies = 0;

if (graves.size > 1) {
  console.error("Anomalie : plusieurs projets Supabase sont gravés dans le même build.");
  anomalies += 1;
}

if (attendu && !graves.has(attendu)) {
  console.error(`Anomalie : le projet attendu ${attendu} n'est pas celui gravé.`);
  anomalies += 1;
}

if (environnement === "production" && refProduction && !graves.has(refProduction)) {
  console.error(
    "Anomalie : build de production ne portant pas l'identifiant déclaré par " +
      "SUPABASE_PRODUCTION_REF. Un déploiement promu depuis Preview écrirait " +
      "dans la base de recette."
  );
  anomalies += 1;
}

if (environnement && environnement !== "production" && refProduction && graves.has(refProduction)) {
  console.error(
    `Anomalie : build « ${environnement} » portant l'identifiant de production. ` +
      "Restreignez NEXT_PUBLIC_SUPABASE_URL à l'environnement Production."
  );
  anomalies += 1;
}

if (anomalies) {
  console.error(`${anomalies} anomalie(s) : build refusé.`);
  process.exit(1);
}

console.log("Conforme : un seul projet gravé, et c'est celui attendu.");
process.exit(0);
