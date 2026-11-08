/**
 * Contrôle de l'archive envoyée à Vercel, avant déploiement.
 *
 *   node scripts/mise-en-service/verifier-archive-vercel.mjs
 *
 * Pourquoi ce contrôle existe. Les déploiements antérieurs au 7 novembre ont
 * emporté `.env.local`, parce que `.vercelignore` ne listait que `ovh-site`.
 * Le piège est que ce fichier, dès qu'il existe, remplace `.gitignore` au lieu
 * de s'y ajouter : tout ce qui n'y figure pas est téléversé, même si Git
 * l'ignore. Un chemin peut donc être invisible dans le dépôt et bien présent
 * dans l'archive.
 *
 * Ce contrôle reconstitue la liste des fichiers que Vercel recevrait, puis
 * refuse l'archive si elle contient un fichier d'environnement, une clé
 * privée, ou une compilation locale. Il signale séparément les fichiers qui
 * citent l'identifiant du projet de production, sans les refuser : les
 * garde-fous doivent le connaître pour pouvoir le rejeter.
 *
 * Aucune valeur n'est affichée : seuls des noms de fichiers et des comptes.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL("../..", import.meta.url));
const REF_PRODUCTION = "rzkwmwtjnwnmmcexwoov";

// Vercel écarte toujours ces chemins, indépendamment de `.vercelignore`.
const TOUJOURS_EXCLUS = [".git", ".vercel"];

function motifs() {
  const fichier = path.join(RACINE, ".vercelignore");
  if (!existsSync(fichier)) return null; // sans ce fichier, c'est .gitignore qui vaut
  return readFileSync(fichier, "utf8")
    .split("\n")
    .map(ligne => ligne.trim())
    .filter(ligne => ligne && !ligne.startsWith("#"))
    .map(ligne => ligne.replace(/^\/+|\/+$/g, ""));
}

function correspond(motif, relatif) {
  // Un motif désigne soit le chemin exact, soit un dossier dont tout le
  // contenu part avec lui.
  if (motif.includes("*")) {
    const regex = new RegExp(`^${motif.split("*").map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`);
    return regex.test(relatif) || regex.test(path.basename(relatif));
  }
  return relatif === motif || relatif.startsWith(`${motif}/`);
}

function archive(exclusions) {
  const retenus = [];
  (function parcourir(dossier) {
    for (const entree of readdirSync(dossier)) {
      const absolu = path.join(dossier, entree);
      const relatif = path.relative(RACINE, absolu);
      if (TOUJOURS_EXCLUS.some(m => correspond(m, relatif))) continue;
      if (exclusions.some(m => correspond(m, relatif))) continue;
      let etat;
      try { etat = statSync(absolu); } catch { continue; }
      if (etat.isDirectory()) parcourir(absolu);
      else retenus.push(relatif);
    }
  })(RACINE);
  return retenus;
}

// ---------------------------------------------------------------------------

const exclusions = motifs();
console.log("\n  Archive envoyée à Vercel\n  ────────────────────────\n");

if (exclusions === null) {
  console.error("  .vercelignore est absent : c'est .gitignore qui s'appliquerait.");
  console.error("  Ce contrôle ne sait pas le reproduire fidèlement : arrêt.\n");
  process.exit(2);
}

const fichiers = archive(exclusions);
console.log(`  ${fichiers.length} fichier(s) seraient téléversés.`);
console.log(`  ${exclusions.length} exclusion(s) déclarée(s).\n`);

const anomalies = [];

// 1. Fichiers d'environnement. `.env.example` est une documentation sans
//    valeur réelle, et sa présence est volontaire.
const environnements = fichiers.filter(f => {
  const nom = path.basename(f);
  return nom.startsWith(".env") && nom !== ".env.example";
});
if (environnements.length) {
  anomalies.push(`fichier(s) d'environnement dans l'archive : ${environnements.join(", ")}`);
} else {
  console.log("  ✓ aucun fichier d'environnement, hormis .env.example");
}

// 2. Clés privées et porte-clés.
const CLES = [/\.pem$/, /\.p12$/, /\.pfx$/, /^id_(rsa|ed25519|ecdsa)$/, /\.key$/];
const cles = fichiers.filter(f => CLES.some(re => re.test(path.basename(f))));
if (cles.length) {
  anomalies.push(`clé(s) privée(s) dans l'archive : ${cles.join(", ")}`);
} else {
  console.log("  ✓ aucune clé privée");
}

// 3. Compilation locale. Elle est fabriquée avec `.env.local`, donc avec
//    l'adresse de production gravée dans le code.
const compilation = fichiers.filter(f => f.startsWith(".next/"));
if (compilation.length) {
  anomalies.push(`compilation locale dans l'archive : ${compilation.length} fichier(s) sous .next/`);
} else {
  console.log("  ✓ aucune compilation locale");
}

// 4. Dépendances installées, qui alourdissent sans servir.
const dependances = fichiers.filter(f => f.startsWith("node_modules/"));
if (dependances.length) {
  anomalies.push(`dépendances installées dans l'archive : ${dependances.length} fichier(s)`);
} else {
  console.log("  ✓ aucune dépendance installée");
}

// 5. Ce dont la compilation a besoin. Exclure trop est aussi une faute, et
//    elle ne se verrait qu'au moment où le déploiement échoue.
const INDISPENSABLES = [
  "package.json",
  "package-lock.json",
  "vercel.json",
  "scripts/verifier-config-supabase.mjs",
  "scripts/verifier-build-grave.mjs",
];
const manquants = INDISPENSABLES.filter(f => existsSync(path.join(RACINE, f)) && !fichiers.includes(f));
if (manquants.length) {
  anomalies.push(`exclu(s) à tort, la compilation en a besoin : ${manquants.join(", ")}`);
} else {
  console.log("  ✓ les fichiers nécessaires à la compilation sont présents");
}

// 6. L'identifiant de production. Signalé, non refusé : les garde-fous le
//    citent nécessairement, puisque leur rôle est de le reconnaître pour le
//    rejeter. Ce qui serait grave, c'est qu'il figure dans une configuration.
const citations = [];
for (const relatif of fichiers) {
  if (/\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip|geotiff|tif)$/i.test(relatif)) continue;
  let contenu;
  try {
    if (statSync(path.join(RACINE, relatif)).size > 2_000_000) continue;
    contenu = readFileSync(path.join(RACINE, relatif), "utf8");
  } catch { continue; }
  if (contenu.includes(REF_PRODUCTION)) citations.push(relatif);
}
if (citations.length) {
  console.log(`\n  ${citations.length} fichier(s) citent l'identifiant de production :`);
  for (const f of citations) console.log(`      ${f}`);
  console.log("  Attendu pour un garde-fou, qui doit le reconnaître pour le refuser.");
  console.log("  À relire si l'un d'eux est une configuration et non un contrôle.");
} else {
  console.log("  ✓ aucune citation de l'identifiant de production");
}

// ---------------------------------------------------------------------------

if (anomalies.length) {
  console.error(`\n  ${anomalies.length} anomalie(s) : archive refusée.`);
  for (const ligne of anomalies) console.error(`      ${ligne}`);
  console.error("");
  process.exit(1);
}

console.log("\n  Archive conforme : rien à retirer avant le déploiement.\n");
