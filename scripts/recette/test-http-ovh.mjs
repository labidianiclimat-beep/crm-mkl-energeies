/**
 * Test HTTP de la chaîne OVH → CRM, sur MKL CRM RECETTE.
 *
 *   node scripts/recette/test-http-ovh.mjs --signature
 *   node scripts/recette/test-http-ovh.mjs --complet
 *
 * Deux modes, parce qu'ils n'ont pas les mêmes besoins.
 *
 * `--signature` éprouve tout l'étage HMAC par de vraies requêtes HTTP, sans
 * aucun secret de production ni de recette. La route exige une clé de service
 * non vide avant de vérifier la signature : une valeur factice suffit donc, et
 * l'adresse Supabase est dirigée vers un port fermé de la machine. Aucune
 * requête ne sort, et aucune base n'est touchée. Une signature invalide rend
 * 401 ; une signature valide va plus loin et échoue en 502 sur la base
 * injoignable. Cette différence suffit à démontrer que la signature est
 * acceptée ou refusée, ce qui est précisément ce que l'on veut mesurer.
 *
 * `--complet` poursuit jusqu'à la création réelle du prospect dans RECETTE et
 * vérifie l'absence de doublon. Il lui faut la clé `service_role` de la
 * recette, lue dans ~/.mkl-secrets/recette-api.env, hors du dépôt.
 *
 * Les données envoyées sont entièrement fictives. Aucun secret n'est affiché.
 */

import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RACINE = resolve(import.meta.dirname, "../..");
const COFFRE = resolve(process.env.HOME, ".mkl-secrets/recette-api.env");
const REF_RECETTE = "xqbjfytrssslnsxxdrou";
const REF_PRODUCTION = "rzkwmwtjnwnmmcexwoov";
const PORT = Number(process.env.MKL_PORT_ESSAI || 3977);
const BASE = `http://127.0.0.1:${PORT}`;

const mode = process.argv.includes("--complet") ? "complet" : "signature";
const resultats = [];

function noter(intitule, attendu, obtenu, detail = "") {
  const ok = attendu === obtenu;
  resultats.push({ intitule, attendu, obtenu, verdict: ok ? "réussi" : "ÉCHOUÉ", detail });
}

// ---------------------------------------------------------------------------
// Signature, reproduite à l'identique de ovh-site/lib/crm-sync.mjs
// ---------------------------------------------------------------------------

function signer({ secret, keyId, method, chemin, corps, horodatage, nonce }) {
  const empreinte = createHash("sha256").update(corps, "utf8").digest("hex");
  const canonique = ["v1", method, chemin, String(horodatage), nonce, empreinte].join("\n");
  const signature = createHmac("sha256", secret).update(canonique, "utf8").digest("hex");
  return {
    "content-type": "application/json",
    "x-mkl-key-id": keyId,
    "x-mkl-timestamp": String(horodatage),
    "x-mkl-nonce": nonce,
    "x-mkl-signature": `v1=${signature}`,
  };
}

async function envoyer(corps, entetes) {
  const reponse = await fetch(`${BASE}/api/web-leads`, {
    method: "POST",
    headers: entetes,
    body: corps,
  });
  let charge = null;
  try { charge = await reponse.json(); } catch { charge = null; }
  return { statut: reponse.status, charge };
}

// ---------------------------------------------------------------------------
// Environnement du serveur d'essai
// ---------------------------------------------------------------------------

function lireCoffre() {
  if (!existsSync(COFFRE)) return null;
  const valeurs = {};
  for (const ligne of readFileSync(COFFRE, "utf8").split("\n")) {
    const i = ligne.indexOf("=");
    if (i > 0) valeurs[ligne.slice(0, i).trim()] = ligne.slice(i + 1).trim();
  }
  return valeurs;
}

function environnement(secretHmac, keyId) {
  const commun = {
    ...process.env,
    PORT: String(PORT),
    APP_PUBLIC_URL: BASE,
    WEB_LEAD_KEYRING: `${keyId}:${secretHmac}`,
    WEB_LEAD_RETENTION_DAYS: "30",
    SUPABASE_PRODUCTION_REF: REF_PRODUCTION,
    NODE_ENV: "production",
  };

  if (mode === "signature") {
    return {
      ...commun,
      // Port fermé : une requête vers la base échoue sans quitter la machine.
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "factice-publiable",
      SUPABASE_SERVICE_ROLE_KEY: "factice-non-vide",
      WEB_LEAD_ORGANIZATION_ID: "00000000-0000-0000-0000-000000000001",
    };
  }

  const coffre = lireCoffre();
  if (!coffre?.MKL_RECETTE_SERVICE_KEY) {
    console.error(`\n  Mode complet : clé de service absente de ${COFFRE}.`);
    console.error("  Lancez d'abord : sh scripts/recette/enregistrer-cles-recette.sh\n");
    process.exit(2);
  }
  if (String(coffre.MKL_RECETTE_SERVICE_KEY).includes(REF_PRODUCTION)) {
    console.error("\n  La clé enregistrée porte l'identifiant de PRODUCTION : arrêt.\n");
    process.exit(2);
  }
  return {
    ...commun,
    NEXT_PUBLIC_SUPABASE_URL: `https://${REF_RECETTE}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: coffre.MKL_RECETTE_PUBLISHABLE_KEY || "",
    SUPABASE_SERVICE_ROLE_KEY: coffre.MKL_RECETTE_SERVICE_KEY,
    WEB_LEAD_ORGANIZATION_ID: coffre.MKL_RECETTE_ORGANIZATION_ID || "",
  };
}

async function attendre(url, essais = 60) {
  for (let i = 0; i < essais; i++) {
    try {
      await fetch(url, { method: "HEAD" });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return false;
}

// ---------------------------------------------------------------------------

const secretHmac = randomBytes(32).toString("hex");
const keyId = "essai-recette";
const env = environnement(secretHmac, keyId);

console.log(`\n  Mode : ${mode}`);
console.log(`  Base Supabase visée : ${env.NEXT_PUBLIC_SUPABASE_URL}`);
console.log(`  Secret HMAC : engendré à l'instant, ${secretHmac.length} caractères, jamais affiché\n`);

// `process.execPath` et non « node » : l'interpréteur n'est pas toujours sur
// le PATH, et c'est de toute façon celui-ci qu'il faut réemployer.
const serveur = spawn(process.execPath, [resolve(RACINE, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], {
  cwd: RACINE, env, stdio: ["ignore", "pipe", "pipe"],
});
serveur.stdout.on("data", () => {});
serveur.stderr.on("data", () => {});

const pret = await attendre(BASE);
if (!pret) {
  console.error("  Le serveur ne répond pas. Avez-vous lancé `npm run build` ?\n");
  serveur.kill("SIGTERM");
  process.exit(1);
}

const soumission = `http-${randomUUID().slice(0, 12)}`;
const corps = JSON.stringify({
  submissionId: soumission,
  kind: "lead",
  // Champs à plat, et non imbriqués : c'est la forme que lit web-lead-ingest.
  name: "Dupont Fictif",
  email: "essai@exemple.test",
  phone: "0600000000",
  message: "Demande d'essai, donnees fictives.",
  gclid: "essai-gclid-fictif",
});
const chemin = "/api/web-leads";

// 1. Signature valide.
{
  const r = await envoyer(corps, signer({
    secret: secretHmac, keyId, method: "POST", chemin, corps,
    horodatage: Date.now(), nonce: randomUUID(),
  }));
  const attendu = mode === "signature" ? 502 : 202;
  noter("signature valide acceptée", attendu, r.statut,
    `${r.charge?.error || ""}${r.charge?.reason ? " — " + r.charge.reason : ""}` ||
      (mode === "signature" ? "signature admise, base injoignable comme prévu" : "prospect mis en file"));
}

// 2. Corps modifié après signature.
{
  const entetes = signer({
    secret: secretHmac, keyId, method: "POST", chemin, corps,
    horodatage: Date.now(), nonce: randomUUID(),
  });
  const r = await envoyer(corps.replace("Dupont Fictif", "Martin Falsifie"), entetes);
  noter("corps modifié après signature refusé", 401, r.statut, r.charge?.error || "");
}

// 3. Secret erroné.
{
  const r = await envoyer(corps, signer({
    secret: randomBytes(32).toString("hex"), keyId, method: "POST", chemin, corps,
    horodatage: Date.now(), nonce: randomUUID(),
  }));
  noter("signature d'un autre secret refusée", 401, r.statut, r.charge?.error || "");
}

// 4. Identifiant de clé inconnu.
{
  const r = await envoyer(corps, signer({
    secret: secretHmac, keyId: "clef-inconnue", method: "POST", chemin, corps,
    horodatage: Date.now(), nonce: randomUUID(),
  }));
  noter("identifiant de clé inconnu refusé", 401, r.statut, r.charge?.error || "");
}

// 5. Horodatage hors fenêtre : la tolérance est de cinq minutes.
{
  const r = await envoyer(corps, signer({
    secret: secretHmac, keyId, method: "POST", chemin, corps,
    horodatage: Date.now() - 10 * 60_000, nonce: randomUUID(),
  }));
  noter("horodatage vieux de dix minutes refusé", 401, r.statut, r.charge?.error || "");
}

// 6. Chemin différent de celui signé.
{
  const r = await envoyer(corps, signer({
    secret: secretHmac, keyId, method: "POST", chemin: "/api/autre", corps,
    horodatage: Date.now(), nonce: randomUUID(),
  }));
  noter("chemin différent de celui signé refusé", 401, r.statut, r.charge?.error || "");
}

// 7. Aucune signature.
{
  const r = await envoyer(corps, { "content-type": "application/json" });
  noter("requête sans signature refusée", 401, r.statut, r.charge?.error || "");
}

// 8. Corps trop volumineux : la limite est de 64 kio.
{
  const gros = JSON.stringify({ submissionId: soumission, kind: "lead", bourrage: "x".repeat(70 * 1024) });
  const r = await envoyer(gros, signer({
    secret: secretHmac, keyId, method: "POST", chemin, corps: gros,
    horodatage: Date.now(), nonce: randomUUID(),
  }));
  noter("corps de 70 kio refusé", 413, r.statut, r.charge?.error || "");
}

// 9. Rejeu : même demande, signature neuve. En mode complet, la file doit
//    reconnaître la demande et ne rien recréer.
if (mode === "complet") {
  const r = await envoyer(corps, signer({
    secret: secretHmac, keyId, method: "POST", chemin, corps,
    horodatage: Date.now(), nonce: randomUUID(),
  }));
  noter("rejeu de la même demande sans doublon", 200, r.statut,
    `duplicate=${r.charge?.duplicate}`);
}

serveur.kill("SIGTERM");
await new Promise(r => setTimeout(r, 500));

console.log("  test                                            attendu  obtenu  verdict");
for (const r of resultats) {
  console.log(`  ${r.intitule.padEnd(46)} ${String(r.attendu).padStart(7)} ${String(r.obtenu).padStart(7)}  ${r.verdict}`);
  if (r.detail) console.log(`    ${r.detail}`);
}
const echecs = resultats.filter(r => r.verdict !== "réussi").length;
console.log(`\n  ${resultats.length - echecs} réussi(s), ${echecs} échoué(s)`);
if (mode === "complet") {
  console.log(`\n  Demande créée : ${soumission}`);
  console.log("  À vérifier et à nettoyer dans RECETTE avec appliquer-socle.sh --controles\n");
}
process.exit(echecs === 0 ? 0 : 1);
