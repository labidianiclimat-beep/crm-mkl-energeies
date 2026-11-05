/**
 * Arrête un build si la configuration Supabase publique est absente.
 *
 * Next.js fige NEXT_PUBLIC_* dans le navigateur au moment du build. Une
 * variable manquante ne doit pas produire un déploiement : il n'existe plus
 * de valeur de production de repli.
 *
 * Les valeurs ne sont jamais affichées. Sur un poste local, `.env` puis
 * `.env.local` complètent l'environnement, sans remplacer une variable déjà
 * posée par la plateforme.
 */

import { existsSync, readFileSync } from "node:fs";

const REQUIS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

function completerDepuis(chemin) {
  if (!existsSync(chemin)) return;
  for (const ligne of readFileSync(chemin, "utf8").split("\n")) {
    const texte = ligne.trim();
    if (!texte || texte.startsWith("#") || !texte.includes("=")) continue;
    const separation = texte.indexOf("=");
    const nom = texte.slice(0, separation).trim();
    if (process.env[nom] !== undefined) continue;
    process.env[nom] = texte.slice(separation + 1).trim();
  }
}

completerDepuis(".env");
completerDepuis(".env.local");

const manquantes = REQUIS.filter(nom => !String(process.env[nom] || "").trim());
if (!manquantes.length) process.exit(0);

console.error("Build arrêté : configuration Supabase incomplète.");
console.error(`Variables absentes : ${manquantes.join(", ")}.`);
console.error("Renseignez-les dans l'environnement de build. Aucune base de production n'est utilisée par défaut.");
process.exit(1);
