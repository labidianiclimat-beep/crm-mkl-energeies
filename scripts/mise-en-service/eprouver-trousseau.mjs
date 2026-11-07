/**
 * Épreuve du trousseau signé, en production, sans créer de prospect.
 *
 * Pourquoi cette épreuve existe. Les variables posées sur Vercel sont de type
 * « Secret » : leur valeur ne peut plus être relue, même par la ligne de
 * commande. `vercel env pull` ne rend qu'un marqueur `[SENSITIVE]`. Comparer
 * ce qui a été posé avec ce que l'on voulait poser est donc impossible par
 * lecture, et une altération d'un seul caractère ferait refuser toutes les
 * demandes du site — silencieusement, puisque le site n'émet pas encore.
 *
 * Comment elle s'en sort. La route de réception contrôle dans cet ordre : le
 * trousseau, puis la signature, puis le contenu. Un contenu volontairement
 * invalide, mais correctement signé, ne peut donc obtenir un 400 qu'après que
 * la signature a été vérifiée. Le 400 est la preuve, et comme le contenu est
 * refusé, aucune demande n'entre en file et aucun prospect n'est créé.
 *
 * Les trois cas distinguent les trois pannes possibles :
 *
 *   - 503 : le trousseau est absent du déploiement ;
 *   - 401 sur une signature juste : le trousseau posé diffère du nôtre ;
 *   - 400 : le trousseau posé est exactement le nôtre.
 *
 * Le secret est lu depuis le coffre en 0600, jamais affiché, jamais écrit.
 *
 *   node scripts/mise-en-service/eprouver-trousseau.mjs
 */

import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const COFFRE = join(homedir(), ".mkl-secrets/vercel-production.env");
const BASE = "https://crm-mkl-energeies.vercel.app";
const CHEMIN = "/api/web-leads";

function coffre() {
  let brut;
  try {
    brut = readFileSync(COFFRE, "utf8");
  } catch {
    console.error(`Coffre introuvable : ${COFFRE}`);
    process.exit(1);
  }
  const valeurs = {};
  for (const ligne of brut.split("\n")) {
    const coupe = ligne.indexOf("=");
    if (coupe <= 0 || ligne.startsWith("#")) continue;
    valeurs[ligne.slice(0, coupe).trim()] = ligne.slice(coupe + 1).trim();
  }
  return valeurs;
}

/** Reprise exacte de `canonicalString` de app/lib/web-lead-hmac.js. */
function signer({ secret, keyId, corps }) {
  const horodatage = String(Date.now());
  const alea = randomBytes(16).toString("base64url");
  const canonique = [
    "v1",
    "POST",
    CHEMIN,
    horodatage,
    alea,
    createHash("sha256").update(corps, "utf8").digest("hex"),
  ].join("\n");
  return {
    "content-type": "application/json",
    "x-mkl-key-id": keyId,
    "x-mkl-timestamp": horodatage,
    "x-mkl-nonce": alea,
    "x-mkl-signature": `v1=${createHmac("sha256", secret).update(canonique, "utf8").digest("hex")}`,
  };
}

async function envoyer(entetes, corps) {
  const reponse = await fetch(`${BASE}${CHEMIN}`, { method: "POST", headers: entetes, body: corps });
  let charge = null;
  try {
    charge = await reponse.json();
  } catch {
    /* une réponse sans corps JSON reste exploitable par son code */
  }
  return { code: reponse.status, charge };
}

const valeurs = coffre();
const trousseau = String(valeurs.WEB_LEAD_KEYRING || "");
const coupe = trousseau.indexOf(":");
if (coupe < 1) {
  console.error("Le trousseau du coffre n'est pas de la forme « identifiant:secret ».");
  process.exit(1);
}
const keyId = trousseau.slice(0, coupe).trim();
const secret = trousseau.slice(coupe + 1).trim();

// Contenu dont le refus est certain : sans `submissionId`, la validation
// s'arrête sur « identifiant_de_soumission_absent ». Rien n'entre en file.
const CORPS = JSON.stringify({});

console.log("\n  Épreuve du trousseau signé en production\n");

let verdict = 0;

const sansEntete = await envoyer({ "content-type": "application/json" }, CORPS);
console.log(
  `    ${sansEntete.code === 401 ? "✓" : "✗"} sans signature                     code ${sansEntete.code}` +
    `${sansEntete.code === 503 ? "  ← trousseau absent du déploiement" : ""}`
);
if (sansEntete.code !== 401) verdict = 1;

const fausse = await envoyer(
  signer({ secret: `${secret}x`, keyId, corps: CORPS }),
  CORPS
);
console.log(`    ${fausse.code === 401 ? "✓" : "✗"} signature fausse                   code ${fausse.code}`);
if (fausse.code !== 401) verdict = 1;

const juste = await envoyer(signer({ secret, keyId, corps: CORPS }), CORPS);
const motif = juste.charge?.reason || "";
const reussi = juste.code === 400 && motif === "identifiant_de_soumission_absent";
console.log(
  `    ${reussi ? "✓" : "✗"} signature juste, contenu refusé    code ${juste.code}` +
    `${motif ? ` « ${motif} »` : ""}`
);
if (!reussi) verdict = 1;

console.log("");
if (verdict === 0) {
  console.log(`  Le trousseau posé sur Vercel est exactement celui du coffre, sous « ${keyId} ».`);
  console.log("  La signature est vérifiée avant le contenu : aucune demande n'est entrée en file.");
} else if (juste.code === 503) {
  console.log("  Le trousseau est absent du déploiement. Les variables ne prennent effet");
  console.log("  qu'au déploiement suivant : redéployez avant de conclure.");
} else if (juste.code === 401) {
  console.log("  Le trousseau posé sur Vercel DIFFÈRE de celui du coffre. Reposez-le avant");
  console.log("  de configurer le VPS, sinon toutes les demandes du site seront refusées.");
} else {
  console.log("  Résultat inattendu. Ne configurez pas le VPS avant d'avoir compris.");
}
console.log("");
process.exit(verdict);
