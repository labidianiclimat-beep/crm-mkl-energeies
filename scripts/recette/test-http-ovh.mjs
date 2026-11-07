/**
 * Test HTTP de la chaîne OVH → CRM, sur MKL CRM RECETTE.
 *
 *   node scripts/recette/test-http-ovh.mjs --signature
 *   node scripts/recette/test-http-ovh.mjs --complet
 *   node scripts/recette/test-http-ovh.mjs --nettoyer
 *
 * Trois modes, parce qu'ils n'ont pas les mêmes besoins ni les mêmes effets.
 *
 * `--signature` éprouve tout l'étage HMAC par de vraies requêtes HTTP, sans
 * aucun secret et sans toucher aucune base. La route exige une clé de service
 * non vide avant de vérifier la signature : une valeur factice suffit donc, et
 * l'adresse Supabase est dirigée vers un port fermé de la machine. Aucune
 * requête ne sort. Une signature valide va plus loin et échoue en 502 sur la
 * base injoignable ; un refus rend 401. Cette différence suffit à mesurer ce
 * que l'on veut mesurer.
 *
 * `--complet` va jusqu'au bout : trois prospects fictifs, un par origine, créés
 * réellement dans RECETTE par la route d'ingestion, puis relancés, puis
 * vérifiés en base par la connexion PostgreSQL dont cible.sh contrôle
 * l'empreinte de cluster. Ce mode écrit. Il demande une confirmation et ne
 * part pas sans elle.
 *
 * `--nettoyer` supprime les seules lignes portant la marque de ce test, et
 * rien d'autre. La marque est inscrite dans l'identifiant de soumission.
 *
 * Toutes les données envoyées sont fictives. Aucun secret n'est affiché.
 *
 * Liaisons de la base, relevées en lecture et non supposées :
 *   - `web_lead_submissions.opportunity_id` désigne la fiche créée ;
 *   - la fiche ne porte l'identifiant de soumission que dans `extra->webLead` ;
 *   - `lead_attribution.submission_id` porte cet identifiant directement ;
 *   - `web_lead_events.submission_pk` désigne la demande ;
 *   - le commercial d'une fiche est `commercial_id`.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

// Les envois valides passent par l'émetteur réel du site, et non par une
// signature réécrite ici. C'est le seul moyen de vérifier le code qui tournera
// vraiment sur le VPS : une réimplémentation qui s'accorde avec elle-même ne
// prouve rien. Les requêtes volontairement fautives, elles, restent fabriquées
// à la main, puisque l'émetteur du site refuse de les produire.
import { buildCrmPayload, sendCrmJob } from "../../ovh-site/lib/crm-sync.mjs";
import {
  attributionBody,
  mergeFirstTouch,
  mergeLastTouch,
  touchFromArrival,
} from "../../ovh-site/lib/attribution-capture.mjs";
import { parseAttribution, parseFirstAttribution } from "../../ovh-site/lib/lead-attribution.mjs";

const RACINE = resolve(import.meta.dirname, "../..");
const COFFRE = resolve(process.env.HOME, ".mkl-secrets/recette-api.env");
const REF_RECETTE = "xqbjfytrssslnsxxdrou";
const REF_PRODUCTION = "rzkwmwtjnwnmmcexwoov";
const CLUSTER_RECETTE = "7703759698107299042";
const CLUSTER_PRODUCTION = "7662760187650847164";
const PORT = Number(process.env.MKL_PORT_ESSAI || 3977);
const BASE = `http://127.0.0.1:${PORT}`;

// La marque qui rend le nettoyage sûr. Elle est portée par l'identifiant de
// soumission, que la file conserve tel quel, et elle ne peut pas être produite
// par le site : celui-ci émet des identifiants de son cru.
const MARQUE = "essai-http-ovh";

const mode = process.argv.includes("--nettoyer") ? "nettoyer"
  : process.argv.includes("--complet") ? "complet"
  : "signature";

// Chaque résultat est imprimé dès qu'il est connu, et non à la fin : une
// erreur en cours de route masquait tout ce qui précédait.
const resultats = [];
function noter(intitule, attendu, obtenu, detail = "") {
  const verdict = String(attendu) === String(obtenu) ? "réussi" : "ÉCHOUÉ";
  resultats.push({ intitule, attendu, obtenu, verdict, detail });
  console.log(`  ${intitule.padEnd(52)} ${String(attendu).padEnd(16)} ${String(obtenu).padEnd(16)} ${verdict}`);
  if (detail) console.log(`      ${detail}`);
}

// ---------------------------------------------------------------------------
// Les trois origines éprouvées. Les coordonnées sont inventées : le domaine
// `.test` est réservé par la norme et ne peut appartenir à personne, et les
// numéros en 06 00 00 00 ne sont pas attribuables.
// ---------------------------------------------------------------------------

const CAS = [
  {
    cle: "google_ads",
    titre: "Google Ads",
    // mirrorSourceLabel colle le sous-type au libellé de catégorie. Sans
    // sous-type, Google Ads n'en a pas, le libellé reste nu.
    libelle: "Prospect GG Ads",
    categorie: "google_ads",
    // Un seul contact : la première visite est aussi celle de la demande.
    // `touch_role` reste alors vide, et non « premier ».
    attributions: "unique|gclid",
    arrivees: [
      { search: "?gclid=essai-gclid-fictif-001&utm_source=google&utm_medium=cpc&utm_campaign=PAC%20hiver",
        path: "/pompe-a-chaleur.html" },
    ],
    contact: { name: "Dupont Fictif", email: "essai-google@exemple.test", phone: "0600000001" },
  },
  {
    cle: "meta_ads",
    titre: "Facebook",
    libelle: "Prospect Face · Facebook",
    categorie: "meta_ads",
    // Deux contacts distincts : venu d'abord par un site référent, revenu
    // par une annonce. C'est le cas qui met les deux modèles en regard.
    attributions: "premier|referrer,dernier|fbclid",
    arrivees: [
      { referrer: "https://www.bing.com/search", path: "/" },
      { search: "?fbclid=essai-fbclid-fictif-002&utm_source=facebook&utm_medium=paid_social&utm_campaign=PV%20automne",
        path: "/photovoltaique.html" },
    ],
    contact: { name: "Martin Fictif", email: "essai-facebook@exemple.test", phone: "0600000002" },
  },
  {
    cle: "site_web",
    titre: "Site Internet",
    libelle: "Prospect Site · Site référent",
    categorie: "site_web",
    attributions: "unique|referrer",
    arrivees: [
      { referrer: "https://www.google.com/search?q=climatisation", path: "/climatisation.html" },
    ],
    contact: { name: "Bernard Fictif", email: "essai-site@exemple.test", phone: "0600000003" },
  },
];

// ---------------------------------------------------------------------------
// Signature, reproduite à l'identique de ovh-site/lib/crm-sync.mjs
// ---------------------------------------------------------------------------

function signer({ secret, keyId, method, chemin, corps, horodatage, nonce }) {
  const empreinte = createHash("sha256").update(corps, "utf8").digest("hex");
  const canonique = ["v1", method, chemin, String(horodatage), nonce, empreinte].join("\n");
  return {
    "content-type": "application/json",
    "x-mkl-key-id": keyId,
    "x-mkl-timestamp": String(horodatage),
    "x-mkl-nonce": nonce,
    "x-mkl-signature": `v1=${createHmac("sha256", secret).update(canonique, "utf8").digest("hex")}`,
  };
}

// Chaque requête est bornée dans le temps. Sans cela, un blocage attend la
// limite d'undici, cinq minutes, et le test entier s'arrête sans rien dire.
// Un dépassement devient ici un statut 0, c'est-à-dire un échec lisible.
async function envoyer(corps, entetes, limiteMs = 20_000) {
  try {
    const reponse = await fetch(`${BASE}/api/web-leads`, {
      method: "POST", headers: entetes, body: corps,
      signal: AbortSignal.timeout(limiteMs),
    });
    let charge = null;
    try { charge = await reponse.json(); } catch { /* corps non JSON */ }
    return { statut: reponse.status, charge };
  } catch (erreur) {
    const motif = erreur?.cause?.code || erreur?.name || "inconnu";
    return { statut: 0, charge: { error: `aucune réponse en ${limiteMs / 1000} s (${motif})` } };
  }
}

// Un dépassement de délai n'est pas un verdict : on redonne une chance avant
// de conclure, et on le signale si la seconde tentative a suffi.
async function envoyerAvecSecondeChance(agir) {
  const premier = await agir();
  if (premier.statut !== 0) return premier;
  const second = await agir();
  if (second.statut !== 0) second.charge = { ...second.charge, _reprise: true };
  return second;
}

// ---------------------------------------------------------------------------
// Connexion PostgreSQL de contrôle, par le garde-fou déjà éprouvé
// ---------------------------------------------------------------------------

function sql(requete) {
  // Les retours à la ligne sont aplatis avant d'être passés au shell :
  // `JSON.stringify` les rendrait en « \n » littéral, que sh ne réinterprète
  // pas et que psql reçoit donc comme une barre oblique inverse suivie d'un n.
  const plate = requete.replace(/\s+/g, " ").trim();
  const r = spawnSync("sh", ["-c",
    `. "${RACINE}/scripts/recette/cible.sh" >/dev/null 2>&1; q ${JSON.stringify(plate)}`,
  ], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`requête refusée : ${(r.stderr || "").trim().slice(0, 300)}`);
  return (r.stdout || "").trim();
}

/**
 * Garde-fou sur le build, et non sur l'environnement d'exécution.
 *
 * Next.js remplace les `process.env.NEXT_PUBLIC_*` par leur valeur **au
 * moment de la compilation**, y compris dans le code serveur. Donner une
 * autre adresse à l'exécution ne change donc rien : le serveur continue
 * d'appeler celle qui est gravée dans `.next`. Un build fabriqué avec la
 * configuration de production fait partir les requêtes vers la production,
 * quelle que soit la variable passée au lancement.
 *
 * Ce contrôle lit les fragments compilés et refuse de partir si l'identifiant
 * de production y figure. C'est le seul moyen fiable de garantir la cible.
 */
function garderBuild() {
  const r = spawnSync("sh", ["-c",
    `grep -rl ${REF_PRODUCTION} "${RACINE}/.next/server" --include=*.js 2>/dev/null | head -3`,
  ], { encoding: "utf8" });
  const touches = (r.stdout || "").trim();
  if (touches) {
    console.error("\n  Le build local porte l'identifiant du projet de PRODUCTION :");
    for (const f of touches.split("\n")) console.error(`    ${f.replace(RACINE + "/", "")}`);
    console.error("\n  Next.js fige les variables NEXT_PUBLIC_ à la compilation. Ce build");
    console.error("  appellerait la production, quelle que soit l'adresse passée au");
    console.error("  lancement. Recompilez avec la configuration de recette :");
    console.error("    sh scripts/recette/compiler-pour-recette.sh\n");
    process.exit(2);
  }
  const vu = spawnSync("sh", ["-c",
    `grep -rl ${REF_RECETTE} "${RACINE}/.next/server" --include=*.js 2>/dev/null | head -1`,
  ], { encoding: "utf8" });
  if (!(vu.stdout || "").trim()) {
    console.error("\n  Le build local ne porte aucun identifiant de projet reconnu.");
    console.error("  Recompilez avec la configuration de recette :");
    console.error("    sh scripts/recette/compiler-pour-recette.sh\n");
    process.exit(2);
  }
  return "recette gravée dans le build";
}

function garderCible() {
  const cluster = sql("select system_identifier::text from pg_control_system()");
  if (cluster === CLUSTER_PRODUCTION) {
    console.error("\n  Cluster de PRODUCTION reconnu : arrêt immédiat, aucune écriture.\n");
    process.exit(2);
  }
  if (cluster !== CLUSTER_RECETTE) {
    console.error("\n  Cluster inconnu : ce n'est ni la recette ni la production. Arrêt.\n");
    process.exit(2);
  }
  return cluster;
}

// ---------------------------------------------------------------------------
// Coffre et environnement du serveur d'essai
// ---------------------------------------------------------------------------

function lireCoffre() {
  if (!existsSync(COFFRE)) return null;
  const valeurs = {};
  for (const ligne of readFileSync(COFFRE, "utf8").split("\n")) {
    if (ligne.startsWith("#")) continue;
    const i = ligne.indexOf("=");
    if (i > 0) valeurs[ligne.slice(0, i).trim()] = ligne.slice(i + 1).trim();
  }
  return valeurs;
}

function verifierCle(coffre) {
  const cle = coffre.MKL_RECETTE_SERVICE_KEY || "";
  if (!cle) {
    console.error(`\n  Clé de service absente de ${COFFRE}.`);
    console.error("  Lancez d'abord : sh scripts/recette/enregistrer-cles-recette.sh\n");
    process.exit(2);
  }
  if (cle.includes(REF_PRODUCTION) || String(coffre.MKL_RECETTE_URL || "").includes(REF_PRODUCTION)) {
    console.error("\n  Le coffre porte l'identifiant de PRODUCTION : arrêt.\n");
    process.exit(2);
  }
  if (!String(coffre.MKL_RECETTE_URL || "").includes(REF_RECETTE)) {
    console.error("\n  L'adresse enregistrée n'est pas celle de la recette : arrêt.\n");
    process.exit(2);
  }
  // Le contrôle décisif est refait ici, et non seulement à l'enregistrement :
  // rien ne garantit que le fichier n'a pas changé depuis.
  const morceaux = cle.split(".");
  if (morceaux.length === 3) {
    try {
      const charge = JSON.parse(Buffer.from(morceaux[1], "base64url").toString("utf8"));
      if (charge.ref && charge.ref !== REF_RECETTE) {
        console.error("\n  La clé déclare un autre projet que la recette : arrêt.\n");
        process.exit(2);
      }
      if (charge.ref === REF_RECETTE) return "déclarée par la clé";
    } catch { /* charge illisible */ }
  }
  return "non déclarée, clé de nouvelle génération";
}

function environnement(secretHmac, keyId, cronSecret, coffre) {
  const commun = {
    ...process.env,
    PORT: String(PORT),
    APP_PUBLIC_URL: BASE,
    WEB_LEAD_KEYRING: `${keyId}:${secretHmac}`,
    WEB_LEAD_RETENTION_DAYS: "30",
    CRON_SECRET: cronSecret,
    SUPABASE_PRODUCTION_REF: REF_PRODUCTION,
    NODE_ENV: "production",
  };
  if (mode === "signature") {
    return {
      ...commun,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "factice-publiable",
      SUPABASE_SERVICE_ROLE_KEY: "factice-non-vide",
      WEB_LEAD_ORGANIZATION_ID: "00000000-0000-0000-0000-000000000001",
    };
  }
  return {
    ...commun,
    NEXT_PUBLIC_SUPABASE_URL: coffre.MKL_RECETTE_URL,
    // Clé publiable : inemployée par les routes serveur, qui signent leurs
    // appels avec la clé de service. Une valeur de remplissage suffit.
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "non-requis-cote-serveur",
    SUPABASE_SERVICE_ROLE_KEY: coffre.MKL_RECETTE_SERVICE_KEY,
    WEB_LEAD_ORGANIZATION_ID: coffre.MKL_RECETTE_ORGANIZATION_ID,
  };
}

async function attendreServeur(essais = 60) {
  for (let i = 0; i < essais; i++) {
    try { await fetch(BASE, { method: "HEAD" }); return true; }
    catch { await new Promise(r => setTimeout(r, 1000)); }
  }
  return false;
}

function demanderConfirmation(question) {
  const lecture = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resoudre => lecture.question(question, reponse => {
    lecture.close();
    resoudre(String(reponse).trim());
  }));
}

// ===========================================================================
// Mode nettoyage
// ===========================================================================

if (mode === "nettoyer") {
  garderCible();
  console.log("\n  Nettoyage des seules données portant la marque du test\n");
  console.log(`  Marque : identifiant de soumission contenant « ${MARQUE} »\n`);

  const demandes = sql(`select count(*) from public.web_lead_submissions
      where submission_id like '%${MARQUE}%'`);
  const fiches = sql(`select count(*) from public.commercial_opportunities
      where extra->'webLead'->>'submissionId' like '%${MARQUE}%'`);
  if (demandes === "0" && fiches === "0") {
    console.log("  Aucune donnée de test en base. Rien à faire.\n");
    process.exit(0);
  }
  console.log(`  ${demandes} demande(s) et ${fiches} fiche(s) de test repérée(s).\n`);

  // Ordre imposé par les clés étrangères, relevé et non supposé : tout ce qui
  // désigne la fiche part avant elle, y compris la demande elle-même, dont la
  // colonne `opportunity_id` la référence.
  const etapes = [
    ["attributions", `delete from public.lead_attribution
        where submission_id like '%${MARQUE}%'`],
    ["rendez-vous", `delete from public.commercial_appointments
        where extra->'webLead'->>'submissionId' like '%${MARQUE}%'`],
    ["événements de file", `delete from public.web_lead_events where submission_pk in (
        select id from public.web_lead_submissions where submission_id like '%${MARQUE}%')`],
    ["demandes", `delete from public.web_lead_submissions
        where submission_id like '%${MARQUE}%'`],
    ["fiches prospects", `delete from public.commercial_opportunities
        where extra->'webLead'->>'submissionId' like '%${MARQUE}%'`],
  ];
  for (const [nom, requete] of etapes) {
    sql(requete);
    console.log(`    ✓ ${nom} supprimé(e)s`);
  }

  const resteD = sql(`select count(*) from public.web_lead_submissions
      where submission_id like '%${MARQUE}%'`);
  const resteF = sql(`select count(*) from public.commercial_opportunities
      where extra->'webLead'->>'submissionId' like '%${MARQUE}%'`);
  const total = sql(`select (select count(*) from public.web_lead_submissions) || ' demande(s), ' ||
      (select count(*) from public.commercial_opportunities) || ' prospect(s), ' ||
      (select count(*) from public.lead_attribution) || ' attribution(s)'`);
  console.log(`\n  Restant portant la marque : ${resteD} demande(s), ${resteF} fiche(s)`);
  console.log(`  Total en base : ${total}`);
  console.log("\n  Les compteurs de numérotation ne reviennent pas en arrière : les");
  console.log("  numéros de prospect consommés restent consommés. C'est sans");
  console.log("  conséquence sur une base de recette.\n");
  process.exit(resteD === "0" && resteF === "0" ? 0 : 1);
}

// ===========================================================================
// Modes signature et complet
// ===========================================================================

const secretHmac = randomBytes(32).toString("hex");
const cronSecret = randomBytes(32).toString("hex");
const keyId = "essai-recette";
const coffre = mode === "complet" ? (lireCoffre() || {}) : {};

if (mode === "complet") {
  const provenanceCle = verifierCle(coffre);
  const build = garderBuild();
  const cluster = garderCible();
  console.log("\n  Test HTTP complet OVH → MKL CRM RECETTE\n");
  console.log(`  Build local               ${build}`);
  console.log(`  Empreinte du cluster      ${cluster}, recette confirmée`);
  console.log(`  Adresse Supabase          ${coffre.MKL_RECETTE_URL}`);
  console.log(`  Appartenance de la clé    ${provenanceCle}`);
  console.log(`  Organisation              ${coffre.MKL_RECETTE_ORGANIZATION_ID}`);
  console.log(`  Secrets HMAC et cron      engendrés à l'instant, jamais affichés`);

  const etat0 = sql(`select (select count(*) from public.web_lead_submissions) || ' demande(s), ' ||
      (select count(*) from public.commercial_opportunities) || ' prospect(s)'`);
  console.log(`  État de la base avant     ${etat0}\n`);

  console.log("  Ce mode écrit réellement dans RECETTE : trois prospects fictifs,");
  console.log("  leurs attributions et leurs événements de file. Le passage par");
  console.log("  PostgREST interdit l'annulation par transaction ; la suppression");
  console.log("  se fait ensuite avec --nettoyer, sur la seule marque du test.\n");

  const reponse = await demanderConfirmation("  Tapez ECRIRE pour lancer, autre chose pour renoncer : ");
  if (reponse !== "ECRIRE") {
    console.log("\n  Renoncé. Aucune écriture.\n");
    process.exit(0);
  }
} else {
  console.log(`\n  Mode signature, aucun secret ni aucune base`);
  console.log(`  Adresse Supabase          port fermé 127.0.0.1:9, rien ne sort`);
  console.log(`  Secret HMAC               engendré à l'instant, jamais affiché`);
}

const occupe = spawnSync("sh", ["-c", `lsof -ti tcp:${PORT} || true`], { encoding: "utf8" });
if ((occupe.stdout || "").trim()) {
  console.error(`\n  Le port ${PORT} est déjà pris, probablement par un serveur laissé`);
  console.error(`  par une exécution coupée. Libérez-le, puis relancez :`);
  console.error(`    kill ${(occupe.stdout || "").trim().split("\n").join(" ")}\n`);
  process.exit(1);
}

const env = environnement(secretHmac, keyId, cronSecret, coffre);
const serveur = spawn(
  // `process.execPath` et non « node » : l'interpréteur n'est pas toujours sur
  // le PATH, et c'est de toute façon celui-ci qu'il faut réemployer.
  process.execPath,
  [resolve(RACINE, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)],
  { cwd: RACINE, env, stdio: ["ignore", "pipe", "pipe"] },
);
const journal = [];
serveur.stdout.on("data", d => journal.push(String(d)));
serveur.stderr.on("data", d => journal.push(String(d)));

function arreter() {
  serveur.kill("SIGTERM");
  return new Promise(r => setTimeout(r, 600));
}

// Le serveur doit mourir même si le script s'arrête sur une erreur. Sans ce
// filet, une exécution coupée laisse le port occupé, et la suivante dialogue
// sans le savoir avec le serveur de la précédente.
for (const signal of ["exit", "SIGINT", "SIGTERM", "uncaughtException"]) {
  process.on(signal, raison => {
    serveur.kill("SIGKILL");
    if (signal === "uncaughtException") {
      console.error(`\n  Arrêt sur erreur : ${raison?.message || raison}\n`);
      process.exit(1);
    }
  });
}

if (!(await attendreServeur())) {
  console.error("\n  Le serveur ne répond pas. Avez-vous lancé `npm run build` ?\n");
  console.error(journal.join("").slice(-800));
  await arreter();
  process.exit(1);
}

const chemin = "/api/web-leads";
const soumissions = new Map();

// Les marqueurs publicitaires ne sont pas lus à la racine de la charge :
// l'ingestion ne retient que les objets `attribution`, pour le contact
// courant, et `attributionFirst`, pour celui mémorisé par le navigateur lors
// de la première visite.
const HOTE_SITE = "www.mkl-energies.fr";

/**
 * Reconstitue l'attribution comme le ferait le site : capture dans le
 * navigateur au fil des arrivées, puis relecture par le serveur OVH. Aucune
 * valeur n'est écrite à la main, de sorte qu'une divergence entre les deux
 * bords se voit ici plutôt qu'en production.
 */
function attributionDuParcours(cas) {
  let dernier = null;
  let premier = null;
  let horloge = Date.now() - cas.arrivees.length * 36e5;
  for (const arrivee of cas.arrivees) {
    horloge += 36e5;
    const touche = touchFromArrival({
      search: arrivee.search || "",
      referrer: arrivee.referrer || "",
      path: arrivee.path || "/",
      ownHost: HOTE_SITE,
      now: horloge,
    });
    dernier = mergeLastTouch(dernier, touche, horloge);
    premier = mergeFirstTouch(premier, touche, horloge);
  }
  const corps = attributionBody(dernier, premier);
  const options = { ownHost: HOTE_SITE, now: horloge, pagePath: "/contact.html" };
  return {
    attribution: parseAttribution(corps.attribution || {}, options),
    attributionFirst: parseFirstAttribution(corps.attributionFirst, options),
  };
}

/**
 * Envoie une demande par l'émetteur réel du site, celui qui tournera sur le
 * VPS. `buildCrmPayload` assemble la charge à partir d'un enregistrement de
 * demande, et `sendCrmJob` la signe et la transmet.
 */
async function envoyerParOvh(cas, soumission) {
  const { attribution, attributionFirst } = attributionDuParcours(cas);
  const job = { sourceId: soumission, kind: "lead", createdAt: new Date().toISOString() };
  const record = {
    createdAt: job.createdAt,
    name: cas.contact.name,
    phone: cas.contact.phone,
    email: cas.contact.email,
    message: `Demande d'essai ${cas.titre}, donnees fictives.`,
    attribution,
    attributionFirst,
  };
  // `sendCrmJob` ne rend pas de code HTTP : il lève sur tout refus et ne rend
  // un accusé que lorsque le CRM a répondu « ok » avec un identifiant. C'est
  // donc l'accusé qui sert de verdict, et non un code de statut.
  try {
    const accuse = await sendCrmJob(job, {
      record,
      secret: secretHmac,
      keyId,
      endpoint: `${BASE}${chemin}`,
      timeoutMs: 20_000,
    });
    return { accuse: "reçu", duplicate: accuse.duplicate, id: accuse.id };
  } catch (erreur) {
    return { accuse: "refusé", duplicate: undefined, detail: erreur.message };
  }
}

function corpsDe(cas) {
  return JSON.stringify({
    submissionId: soumissions.get(cas.cle),
    kind: "lead",
    ...cas.contact,
    message: `Demande d'essai ${cas.titre}, donnees fictives.`,
    ...attributionDuParcours(cas),
  });
}

function entetesNeuves(corps) {
  return signer({
    secret: secretHmac, keyId, method: "POST", chemin, corps,
    horodatage: Date.now(), nonce: randomUUID(),
  });
}

console.log("\n  contrôle                                             attendu          obtenu           verdict\n");

// --- Étage HMAC : sept requêtes fautives, dans les deux modes --------------

{
  const cas = CAS[0];
  soumissions.set(cas.cle, `${MARQUE}-${cas.cle}-${randomUUID().slice(0, 8)}`);
  const corps = corpsDe(cas);

  const fautes = [
    ["corps modifié après signature", 401, () => envoyer(corps.replace("Dupont", "Falsifie"), entetesNeuves(corps))],
    ["signature d'un autre secret", 401, () => envoyer(corps, signer({
      secret: randomBytes(32).toString("hex"), keyId, method: "POST", chemin, corps,
      horodatage: Date.now(), nonce: randomUUID() }))],
    ["identifiant de clé inconnu", 401, () => envoyer(corps, signer({
      secret: secretHmac, keyId: "clef-inconnue", method: "POST", chemin, corps,
      horodatage: Date.now(), nonce: randomUUID() }))],
    ["horodatage vieux de dix minutes", 401, () => envoyer(corps, signer({
      secret: secretHmac, keyId, method: "POST", chemin, corps,
      horodatage: Date.now() - 10 * 60_000, nonce: randomUUID() }))],
    ["chemin différent de celui signé", 401, () => envoyer(corps, signer({
      secret: secretHmac, keyId, method: "POST", chemin: "/api/autre", corps,
      horodatage: Date.now(), nonce: randomUUID() }))],
    ["requête sans aucune signature", 401, () => envoyer(corps, { "content-type": "application/json" })],
  ];
  for (const [intitule, attendu, agir] of fautes) {
    const r = await envoyerAvecSecondeChance(agir);
    noter(`HMAC — ${intitule} refusé`, attendu, r.statut,
      `${r.charge?.error || ""}${r.charge?._reprise ? " (seconde tentative)" : ""}`.trim());
  }

  const gros = JSON.stringify({ submissionId: `${MARQUE}-gros`, kind: "lead", phone: "0600000000", bourrage: "x".repeat(70 * 1024) });
  const r = await envoyerAvecSecondeChance(() => envoyer(gros, entetesNeuves(gros)));
  noter("HMAC — corps de 70 kio refusé", 413, r.statut, r.charge?.error || "");
}

// --- Chaîne complète : les trois origines ---------------------------------

if (mode === "complet") {
  for (const cas of CAS) {
    console.log("");
    soumissions.set(cas.cle, `${MARQUE}-${cas.cle}-${randomUUID().slice(0, 8)}`);
    const corps = corpsDe(cas);
    const soumission = soumissions.get(cas.cle);

    // 1. Réception, par l'émetteur réel du site.
    const premiere = await envoyerParOvh(cas, soumission);
    noter(`${cas.titre} — accusé de réception du CRM`, "reçu", premiere.accuse, premiere.detail || "");
    noter(`${cas.titre} — demande tenue pour neuve`, "false", String(premiere.duplicate));

    // 2. Le traitement est lancé après la réponse : on attend que la fiche
    //    apparaisse réellement, au lieu de supposer un délai.
    let fiche = null;
    for (let i = 0; i < 30 && !fiche; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const vu = sql(`select coalesce(o.source, '') || '|' || coalesce(o.origin_category, '')
            || '|' || coalesce(o.origin_subtype, '-') || '|' || s.status
          from public.web_lead_submissions s
          left join public.commercial_opportunities o on o.id = s.opportunity_id
          where s.submission_id = '${soumission}'`);
      if (vu && !vu.startsWith("|")) fiche = vu.split("|");
    }
    if (!fiche) {
      const etat = sql(`select coalesce(string_agg(status || ', ' || attempts || ' tentative(s), '
            || coalesce(last_error_code, 'sans erreur'), ' ; '), 'demande absente de la file')
          from public.web_lead_submissions where submission_id = '${soumission}'`);
      noter(`${cas.titre} — fiche créée dans RECETTE`, "créée", "absente après 30 s", etat);
      continue;
    }
    const [libelle, categorie, , statut] = fiche;

    noter(`${cas.titre} — libellé affiché`, cas.libelle, libelle);
    noter(`${cas.titre} — origine enregistrée`, cas.categorie, categorie);
    noter(`${cas.titre} — demande clôturée`, "done", statut);

    // 3. Attribution : premier contact, avec la preuve attendue.
    // `touch_role` est vide quand il n'y a qu'un contact : il est rendu ici
    // « unique » pour que la ligne reste lisible.
    const attribution = sql(`select coalesce(string_agg(
          coalesce(nullif(touch_role, ''), 'unique') || '|' || evidence, ','
          order by case touch_role when 'premier' then 0 when 'dernier' then 1 else 2 end
        ), 'aucune')
        from public.lead_attribution where submission_id = '${soumission}'`);
    noter(`${cas.titre} — attribution enregistrée`, cas.attributions, attribution);

    // 4. Relance du site : même demande, signature neuve. La file doit la
    //    reconnaître et ne rien recréer.
    const relance = await envoyerParOvh(cas, soumission);
    noter(`${cas.titre} — relance acceptée`, "reçu", relance.accuse, relance.detail || "");
    noter(`${cas.titre} — relance signalée comme connue`, "true", String(relance.duplicate));

    // 5. Décompte : une seule demande, une seule fiche, une seule attribution.
    const unicite = sql(`select
        (select count(*) from public.web_lead_submissions where submission_id = '${soumission}') || '/' ||
        (select count(*) from public.commercial_opportunities
           where extra->'webLead'->>'submissionId' = '${soumission}') || '/' ||
        (select count(*) from public.lead_attribution where submission_id = '${soumission}')`);
    noter(`${cas.titre} — aucun doublon après relance`,
      `1/1/${cas.attributions.split(",").length}`, unicite,
      "demandes / fiches / attributions");
  }

  // --- Visibilité : les fiches doivent être exploitables par le CRM --------
  console.log("");
  const visibles = sql(`select count(*) from public.commercial_opportunities
      where extra->'webLead'->>'submissionId' like '%${MARQUE}%'
        and organization_id = '${coffre.MKL_RECETTE_ORGANIZATION_ID}'`);
  noter("Les trois fiches rattachées à l'organisation", "3", visibles);

  // `commercial_id` et non `assigned_to` : c'est le nom réel de la colonne.
  const sansCommercial = sql(`select count(*) from public.commercial_opportunities
      where extra->'webLead'->>'submissionId' like '%${MARQUE}%' and commercial_id is null`);
  noter("Les trois fiches attendent un commercial", "3", sansCommercial,
    "seau non attribué, visible au dispatch");
}

await arreter();

const echecs = resultats.filter(r => r.verdict !== "réussi").length;
console.log(`\n  ${resultats.length - echecs} réussi(s), ${echecs} échoué(s)`);

if (mode === "complet") {
  console.log("\n  Données fictives laissées en base, marquées pour le nettoyage :");
  for (const [cle, valeur] of soumissions) console.log(`    ${cle.padEnd(12)} ${valeur}`);
  console.log("\n  Nettoyage : node scripts/recette/test-http-ovh.mjs --nettoyer\n");
  if (echecs > 0) {
    console.log("  Journal du serveur, dernières lignes :");
    console.log(journal.join("").split("\n").filter(Boolean).slice(-8).map(l => `    ${l}`).join("\n"));
    console.log("");
  }
}
process.exit(echecs === 0 ? 0 : 1);
