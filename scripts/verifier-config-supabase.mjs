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
if (manquantes.length) {
  console.error("Build arrêté : configuration Supabase incomplète.");
  console.error(`Variables absentes : ${manquantes.join(", ")}.`);
  console.error("Renseignez-les dans l'environnement de build. Aucune base de production n'est utilisée par défaut.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Cloisonnement des environnements
//
// Le contrôle ci-dessus exige les variables publiques partout, y compris en
// Preview. La pente naturelle est donc de les poser pour les trois
// environnements, ce qui donne à Preview les identifiants de la production.
//
// Refuser ici fait échouer la compilation : le déploiement Preview n'existe
// alors jamais, et ne peut donc rien écrire. Le même verdict est réévalué à
// l'exécution, pour le cas où les variables changeraient après un build.
// ---------------------------------------------------------------------------

const { currentEnvironmentVerdict, environmentRejectionMessage } = await import(
  "../app/lib/supabase-environment.js"
);

const verdict = currentEnvironmentVerdict();
if (!verdict.ok) {
  console.error(`Build arrêté : ${verdict.reason}.`);
  console.error(environmentRejectionMessage(verdict));
  console.error(`Environnement : ${verdict.deploymentEnv}.`);
  process.exit(1);
}

// Une anomalie sans refus existe aussi, en production uniquement. Elle doit
// se voir dans le journal de build sans empêcher la mise en ligne.
if (verdict.warning) {
  console.warn(`Avertissement : ${verdict.warning}.`);
  console.warn(environmentRejectionMessage(verdict));
}

// `SUPABASE_PRODUCTION_REF` n'est pas un secret : elle figure déjà dans l'URL
// publique. Son absence n'arrête pas le build, mais elle laisse le second
// contrôle sans effet, ce qui doit se voir plutôt que de passer en silence.
if (!verdict.productionRef) {
  console.warn(
    "Avertissement : SUPABASE_PRODUCTION_REF n'est pas renseignée. " +
      "Un déploiement Preview visant la production ne sera pas détecté."
  );
}

process.exit(0);
