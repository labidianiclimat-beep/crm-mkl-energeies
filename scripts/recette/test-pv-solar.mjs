/**
 * Calcul photovoltaïque d'un déploiement de recette, avec la nouvelle clé
 * Google Solar.
 *
 *   node scripts/recette/test-pv-solar.mjs --complet https://<deploiement>/
 *   node scripts/recette/test-pv-solar.mjs --nettoyer
 *
 * Pourquoi un banc d'essai et non un simple appel : la route
 * `/api/pv/install-yield` exige une session authentifiée et un profil
 * « Responsable technique ». L'éprouver suppose donc un compte, ce qui est
 * fabriqué ici de bout en bout dans la recette, puis retiré.
 *
 * Ce que le test démontre, et c'est le seul but : la clé posée sur
 * l'environnement de prévisualisation est bien celle que le code déployé
 * utilise, et Google Solar répond pour une adresse réelle. La clé elle-même
 * n'est ni lue, ni affichée, ni connue de ce script : elle vit dans
 * l'environnement du déploiement.
 *
 * Garde-fous : la base visée doit être RECETTE, le compte est fictif sur le
 * domaine `.test` réservé par la norme, et le nettoyage ne retire que lui.
 */

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL("../..", import.meta.url));
const REF_PRODUCTION = "rzkwmwtjnwnmmcexwoov";
const REF_RECETTE = "xqbjfytrssslnsxxdrou";
const CLUSTER_RECETTE = "7703759698107299042";
const CLUSTER_PRODUCTION = "7662760187650847164";
const MARQUE = "essai-pv-solar";
const COURRIEL = `${MARQUE}@exemple.test`;

// Marseille, cathédrale de la Major : une toiture large, couverte par
// l'imagerie Google Solar, et qui n'appartient à aucun client.
const LIEU = { lat: 43.2965, lon: 5.3698 };

const mode = process.argv.find(a => a.startsWith("--")) || "--complet";

const resultats = [];
function noter(intitule, attendu, obtenu, detail = "") {
  const verdict = String(attendu) === String(obtenu) ? "réussi" : "ÉCHOUÉ";
  resultats.push({ verdict, intitule });
  console.log(`  ${intitule.padEnd(46)} ${String(attendu).padEnd(22)} ${String(obtenu).padEnd(22)} ${verdict}`);
  if (detail) console.log(`      ${detail}`);
}
function info(intitule, valeur) {
  console.log(`  ${intitule.padEnd(46)} ${valeur}`);
}

// ---------------------------------------------------------------------------
// Base de recette
// ---------------------------------------------------------------------------

function sql(requete) {
  const plate = requete.replace(/\s+/g, " ").trim();
  const r = spawnSync("sh", ["-c",
    `. "${RACINE}/scripts/recette/cible.sh" >/dev/null 2>&1; q ${JSON.stringify(plate)}`,
  ], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`requête refusée : ${(r.stderr || "").trim().slice(0, 300)}`);
  return (r.stdout || "").trim();
}

function garderCible() {
  const empreinte = sql("select system_identifier from pg_control_system()");
  if (empreinte === CLUSTER_PRODUCTION) {
    console.error("\n  La connexion désigne le groupe de bases de PRODUCTION : arrêt.\n");
    process.exit(2);
  }
  if (empreinte !== CLUSTER_RECETTE) {
    console.error(`\n  Groupe de bases inattendu (${empreinte}) : arrêt.\n`);
    process.exit(2);
  }
  return empreinte;
}

// ---------------------------------------------------------------------------
// Coffre hors dépôt
// ---------------------------------------------------------------------------

const COFFRE = join(process.env.HOME, ".mkl-secrets", "recette-api.env");
let coffre = {};
try {
  const brut = await readFile(COFFRE, "utf8");
  for (const ligne of brut.split("\n")) {
    const m = ligne.match(/^([A-Z_]+)=(.*)$/);
    if (m) coffre[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  console.error(`\n  Coffre illisible : ${COFFRE}\n`);
  process.exit(2);
}

for (const nom of ["MKL_RECETTE_URL", "MKL_RECETTE_SERVICE_KEY", "MKL_VERCEL_BYPASS"]) {
  if (!coffre[nom]) {
    console.error(`\n  ${nom} absent du coffre : arrêt.\n`);
    process.exit(2);
  }
}
if (!coffre.MKL_RECETTE_URL.includes(REF_RECETTE) || coffre.MKL_RECETTE_URL.includes(REF_PRODUCTION)) {
  console.error("\n  L adresse Supabase du coffre n est pas celle de la recette : arrêt.\n");
  process.exit(2);
}

const SUPABASE = coffre.MKL_RECETTE_URL.replace(/\/+$/, "");

async function supabase(chemin, { method = "GET", body = null, entetes = {} } = {}) {
  const r = await fetch(`${SUPABASE}${chemin}`, {
    method,
    headers: {
      apikey: coffre.MKL_RECETTE_SERVICE_KEY,
      authorization: `Bearer ${coffre.MKL_RECETTE_SERVICE_KEY}`,
      "content-type": "application/json",
      ...entetes,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const texte = await r.text();
  let charge = null;
  try { charge = texte ? JSON.parse(texte) : null; } catch { charge = texte; }
  return { statut: r.status, charge };
}

// ---------------------------------------------------------------------------
// Nettoyage
// ---------------------------------------------------------------------------

async function nettoyer({ bavard = true } = {}) {
  if (bavard) console.log("\n  Nettoyage du compte fictif de ce banc d'essai\n");
  garderCible();

  // Le profil d'abord : il porte l'identifiant de l'utilisateur, et le retirer
  // ensuite deviendrait impossible à retrouver.
  const profils = await supabase(`/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(COURRIEL)}`);
  const ids = Array.isArray(profils.charge) ? profils.charge.map(p => p.id) : [];

  await supabase(`/rest/v1/profiles?email=eq.${encodeURIComponent(COURRIEL)}`, { method: "DELETE" });
  if (bavard) console.log(`      ✓ profil retiré (${ids.length})`);

  for (const id of ids) {
    await supabase(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  }
  if (bavard) console.log(`      ✓ compte d authentification retiré (${ids.length})`);

  const reste = sql(`select count(*) from public.profiles where email = '${COURRIEL}'`);
  if (bavard) {
    console.log(`\n    Restant portant la marque : ${reste} profil(s)`);
    console.log(`    Total en base : ${sql("select count(*) from public.profiles")} profil(s)\n`);
  }
  return Number(reste);
}

if (mode === "--nettoyer") {
  await nettoyer();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Cible du déploiement
// ---------------------------------------------------------------------------

const BASE = (process.argv.find(a => a.startsWith("https://")) || process.env.CRM_PREVIEW_URL || "")
  .replace(/\/+$/, "");
if (!BASE) {
  console.error("\n  Indiquez l adresse du déploiement de recette en argument.\n");
  process.exit(2);
}
if (BASE.includes(REF_PRODUCTION)) {
  console.error("\n  L adresse visée porte l identifiant du projet de PRODUCTION : arrêt.\n");
  process.exit(2);
}
if (!BASE.startsWith("https://")) {
  console.error("\n  Adresse non chiffrée : arrêt.\n");
  process.exit(2);
}

console.log("\n  Calcul photovoltaïque sur la recette, avec la nouvelle clé Google Solar\n");
const empreinte = garderCible();
info("groupe de bases", `${empreinte} — recette`);
info("déploiement visé", new URL(BASE).hostname);
info("lieu d essai", `${LIEU.lat}, ${LIEU.lon} — Marseille, aucun client`);
console.log("");

// Un reliquat d'un essai précédent fausserait la création : on repart propre.
await nettoyer({ bavard: false });

// ---------------------------------------------------------------------------
// Compte fictif, le temps du test
// ---------------------------------------------------------------------------

// Mot de passe jetable, qui ne vit que dans la mémoire de ce processus et
// disparaît avec le compte.
const MOT_DE_PASSE = `${randomUUID()}-Aa1!`;

const creation = await supabase("/auth/v1/admin/users", {
  method: "POST",
  body: { email: COURRIEL, password: MOT_DE_PASSE, email_confirm: true },
});
noter("le compte fictif est créé", 200, creation.statut,
  creation.statut === 200 ? "" : `réponse : ${JSON.stringify(creation.charge).slice(0, 180)}`);
const idUtilisateur = creation.charge?.id;
if (!idUtilisateur) {
  console.error("\n  Sans identifiant d utilisateur, la suite n a pas de sens : arrêt.\n");
  process.exit(1);
}

const organisation = sql("select id from public.organizations order by created_at asc limit 1");

const profil = await supabase("/rest/v1/profiles", {
  method: "POST",
  entetes: { prefer: "return=representation" },
  body: [{
    id: idUtilisateur,
    organization_id: organisation,
    email: COURRIEL,
    full_name: "Essai Fictif Photovoltaïque",
    // Le rôle décide de tout ici : « Responsable technique » est le seul rôle
    // non administrateur que `canCreateCompletePvStudy` accepte, et il reçoit
    // d'office le module « Photovoltaïque administratif ».
    role: "Responsable technique",
    active: true,
    onboarding_completed_at: new Date().toISOString(),
  }],
});
noter("le profil responsable technique est créé", 201, profil.statut,
  profil.statut === 201 ? "" : `réponse : ${JSON.stringify(profil.charge).slice(0, 180)}`);

const session = await supabase("/auth/v1/token?grant_type=password", {
  method: "POST",
  body: { email: COURRIEL, password: MOT_DE_PASSE },
});
const jeton = session.charge?.access_token || "";
noter("la session s ouvre sur la recette", true, Boolean(jeton),
  jeton ? `jeton de ${jeton.length} caractères, jamais affiché` : JSON.stringify(session.charge).slice(0, 180));
if (!jeton) {
  await nettoyer({ bavard: false });
  console.error("\n  Sans jeton, le calcul ne peut pas être demandé : arrêt.\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Le calcul, demandé au déploiement
// ---------------------------------------------------------------------------

console.log("");

async function demander(corps) {
  const debut = Date.now();
  const r = await fetch(`${BASE}/api/pv/install-yield`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${jeton}`,
      // Sans ce jeton, « Vercel Authentication » répond 401 avant la route.
      "x-vercel-protection-bypass": coffre.MKL_VERCEL_BYPASS,
    },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(60_000),
  });
  const texte = await r.text();
  let charge = null;
  try { charge = texte ? JSON.parse(texte) : null; } catch { charge = texte; }
  return { statut: r.status, charge, duree: Date.now() - debut };
}

// `layersOnly` écarte les appels PVGIS, longs et étrangers à la question
// posée : ce qui est éprouvé ici, c'est Google Solar.
const couches = await demander({ ...LIEU, layersOnly: true });
noter("le déploiement accepte la demande", 200, couches.statut,
  couches.statut === 200 ? `${couches.duree} ms` : `réponse : ${JSON.stringify(couches.charge).slice(0, 200)}`);

if (couches.statut !== 200) {
  await nettoyer({ bavard: false });
  console.error("\n  La demande a été refusée : la cause est au-dessus.\n");
  process.exit(1);
}

const d = couches.charge || {};
noter("la source retenue est Google Solar", "google", d.solarProvider || "aucune",
  "« pvgis » signifierait que la clé n a pas répondu et que le repli a joué");
noter("aucune erreur Google n est signalée", "", d.googleError || "",
  d.googleError ? "c est le message que le CRM afficherait au commercial" : "");
noter("les données de toiture sont présentes", true, Boolean(d.google),
  d.google ? `ensoleillement médian et pans renvoyés` : "");
noter("les pans suggérés sont exploitables", true, Array.isArray(d.suggestedPlanes) && d.suggestedPlanes.length > 0,
  Array.isArray(d.suggestedPlanes) ? `${d.suggestedPlanes.length} pan(s)` : "");
noter("la carte d ensoleillement est fabriquée", true, String(d.fluxPng || "").length > 1000,
  "image produite à partir du GeoTIFF de Google, donc la licence est bien active");

// Un calcul complet, pour vérifier que l'assemblage avec PVGIS tient aussi.
const complet = await demander({ ...LIEU, planes: [{ compass: 180, tilt: 30, panelPower: 500 }] });
noter("le calcul complet aboutit", 200, complet.statut, `${complet.duree} ms`);
const premier = complet.charge?.planes?.[0];
noter("le productible est renseigné", true, Number(premier?.yieldValue) > 500,
  premier ? `${Math.round(Number(premier.yieldValue))} kWh/kWc par an, source ${premier.source}` : "");

// ---------------------------------------------------------------------------

const echecs = resultats.filter(r => r.verdict !== "réussi").length;
console.log(`\n  ${resultats.length - echecs} réussi(s), ${echecs} échoué(s)`);

console.log("");
const reste = await nettoyer();
if (reste !== 0) {
  console.error("  Le compte fictif n a pas été entièrement retiré : à vérifier.\n");
  process.exit(1);
}

process.exit(echecs === 0 ? 0 : 1);
