/**
 * Génère `CRON_SECRET` et `WEB_LEAD_KEYRING` sans jamais les afficher.
 *
 * Les valeurs sont écrites dans un fichier hors du dépôt, en 0600. Rien n'est
 * imprimé : un secret affiché dans un terminal se retrouve dans l'historique
 * du shell, dans le tampon de défilement, et parfois dans une capture d'écran.
 *
 * Le fichier est délibérément placé en dehors du projet. `.gitignore` couvre
 * déjà `.env*`, mais une protection qui repose sur une règle d'ignorance reste
 * une protection qu'une commande `git add -f` annule.
 *
 *   node scripts/generer-secrets.mjs
 *
 * Puis, pour recopier une valeur dans Vercel sans la faire apparaître :
 *
 *   node scripts/generer-secrets.mjs --copier CRON_SECRET
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const DOSSIER = join(homedir(), ".mkl-secrets");
const FICHIER = join(DOSSIER, "vercel-production.env");

/**
 * Le trousseau accepte plusieurs clés, sous la forme `identifiant:secret`.
 * Commencer à `k1` laisse la rotation possible sans interruption : on ajoute
 * `k2`, on bascule le VPS, puis on retire `k1`.
 */
function trousseau() {
  return `k1:${randomBytes(32).toString("base64url")}`;
}

function generer() {
  return {
    CRON_SECRET: randomBytes(32).toString("base64url"),
    WEB_LEAD_KEYRING: trousseau(),
  };
}

function lire() {
  if (!existsSync(FICHIER)) return null;
  const valeurs = {};
  for (const ligne of readFileSync(FICHIER, "utf8").split("\n")) {
    const separation = ligne.indexOf("=");
    if (separation <= 0 || ligne.startsWith("#")) continue;
    valeurs[ligne.slice(0, separation).trim()] = ligne.slice(separation + 1).trim();
  }
  return valeurs;
}

const demande = process.argv.indexOf("--copier");
if (demande !== -1) {
  const nom = process.argv[demande + 1];
  const valeurs = lire();
  if (!valeurs) {
    console.error(`Aucun secret généré. Lancez d'abord : node ${process.argv[1].split("/").pop()}`);
    process.exit(1);
  }
  if (!valeurs[nom]) {
    console.error(`Variable inconnue : ${nom}. Disponibles : ${Object.keys(valeurs).join(", ")}`);
    process.exit(1);
  }
  execFileSync("pbcopy", { input: valeurs[nom] });
  console.log(`${nom} est dans le presse-papiers. Collez-la dans Vercel, puis copiez autre chose.`);
  process.exit(0);
}

if (existsSync(FICHIER)) {
  console.log(`Des secrets existent déjà : ${FICHIER}`);
  console.log("Pour les remplacer, supprimez ce fichier d'abord. Les régénérer");
  console.log("sans prévenir couperait le lien avec le VPS s'il est déjà configuré.");
  process.exit(0);
}

mkdirSync(DOSSIER, { recursive: true, mode: 0o700 });
const valeurs = generer();
writeFileSync(
  FICHIER,
  [
    "# Secrets de production MKL CRM. Hors du dépôt, et qui doivent y rester.",
    "# CRON_SECRET       : exigé par les quatre tâches planifiées Vercel.",
    "# WEB_LEAD_KEYRING  : trousseau du lien signé entre le VPS et le CRM.",
    "#                     Le VPS reçoit le même secret, sous l'identifiant k1.",
    "",
    ...Object.entries(valeurs).map(([nom, valeur]) => `${nom}=${valeur}`),
    "",
  ].join("\n"),
  { mode: 0o600 }
);

console.log(`Deux secrets générés dans ${FICHIER} (0600).`);
console.log("");
console.log("Aucune valeur n'est affichée. Longueurs, pour contrôle :");
for (const [nom, valeur] of Object.entries(valeurs)) {
  console.log(`  ${nom.padEnd(18)} ${valeur.length} caractères`);
}
console.log("");
console.log("Pour les poser dans Vercel, une par une :");
console.log("  node scripts/generer-secrets.mjs --copier CRON_SECRET");
console.log("  node scripts/generer-secrets.mjs --copier WEB_LEAD_KEYRING");
