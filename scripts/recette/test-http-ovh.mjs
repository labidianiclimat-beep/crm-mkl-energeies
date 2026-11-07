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
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

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

const resultats = [];
function noter(intitule, attendu, obtenu, detail = "") {
  resultats.push({
    intitule, attendu, obtenu,
    verdict: String(attendu) === String(obtenu) ? "réussi" : "ÉCHOUÉ",
    detail,
  });
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
    libelle: "Prospect GG Ads",
    preuve: "gclid",
    champs: { gclid: "essai-gclid-fictif-001", utm_source: "google", utm_medium: "cpc", utm_campaign: "PAC hiver" },
    contact: { name: "Dupont Fictif", email: "essai-google@exemple.test", phone: "0600000001" },
  },
  {
    cle: "meta_ads",
    titre: "Facebook",
    libelle: "Prospect Face",
    preuve: "fbclid",
    champs: { fbclid: "essai-fbclid-fictif-002", utm_source: "facebook", utm_medium: "paid_social", utm_campaign: "PV automne" },
    contact: { name: "Martin Fictif", email: "essai-facebook@exemple.test", phone: "0600000002" },
  },
  {
    cle: "site_web",
    titre: "Site Internet",
    libelle: "Prospect Site",
    preuve: "referrer",
    champs: { referrer: "https://www.google.com/search" },
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

async function envoyer(corps, entetes) {
  const reponse = await fetch(`${BASE}/api/web-leads`, { method: "POST", headers: entetes, body: corps });
  let charge = null;
  try { charge = await reponse.json(); } catch { /* corps non JSON */ }
  return { statut: reponse.status, charge };
}

// ---------------------------------------------------------------------------
// Connexion PostgreSQL de contrôle, par le garde-fou déjà éprouvé
// ---------------------------------------------------------------------------

function sql(requete) {
  const r = spawnSync("sh", ["-c",
    `. "${RACINE}/scripts/recette/cible.sh" >/dev/null 2>&1; q ${JSON.stringify(requete)}`,
  ], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`requête refusée : ${(r.stderr || "").trim().slice(0, 200)}`);
  return (r.stdout || "").trim();
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
      return charge.ref === REF_RECETTE ? "déclarée par la clé" : "non déclarée";
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

  const avant = sql(`select count(*) from public.web_lead_submissions where submission_id like '%${MARQUE}%'`);
  if (avant === "0") {
    console.log("  Aucune donnée de test en base. Rien à faire.\n");
    process.exit(0);
  }
  console.log(`  ${avant} demande(s) de test repérée(s).\n`);

  // Suppression dans l'ordre des dépendances : les lignes qui pointent vers
  // une autre sont retirées avant celle qu'elles désignent.
  const etapes = [
    ["attributions", `delete from public.lead_attribution where opportunity_id in (
        select id from public.commercial_opportunities where web_lead_submission_id in (
          select id from public.web_lead_submissions where submission_id like '%${MARQUE}%'))`],
    ["rendez-vous", `delete from public.commercial_appointments where web_lead_submission_id in (
        select id from public.web_lead_submissions where submission_id like '%${MARQUE}%')`],
    ["prospects", `delete from public.commercial_opportunities where web_lead_submission_id in (
        select id from public.web_lead_submissions where submission_id like '%${MARQUE}%')`],
    ["événements", `delete from public.web_lead_events where submission_id in (
        select id from public.web_lead_submissions where submission_id like '%${MARQUE}%')`],
    ["demandes", `delete from public.web_lead_submissions where submission_id like '%${MARQUE}%'`],
  ];
  for (const [nom, requete] of etapes) {
    sql(requete);
    console.log(`    ✓ ${nom} supprimé(e)s`);
  }

  const reste = sql(`select count(*) from public.web_lead_submissions where submission_id like '%${MARQUE}%'`);
  const prospects = sql("select count(*) from public.commercial_opportunities");
  const demandes = sql("select count(*) from public.web_lead_submissions");
  console.log(`\n  Restant portant la marque : ${reste}`);
  console.log(`  Total en base : ${demandes} demande(s), ${prospects} prospect(s)`);
  console.log("\n  Les compteurs de numérotation ne reviennent pas en arrière :");
  console.log("  les numéros de prospect consommés restent consommés. C'est sans");
  console.log("  conséquence sur une base de recette.\n");
  process.exit(reste === "0" ? 0 : 1);
}

// ===========================================================================
// Modes signature et complet
// ===========================================================================

const secretHmac = randomBytes(32).toString("hex");
const cronSecret = randomBytes(32).toString("hex");
const keyId = "essai-recette";
const coffre = mode === "complet" ? (lireCoffre() || {}) : {};
let provenanceCle = "sans objet";

if (mode === "complet") {
  provenanceCle = verifierCle(coffre);
  const cluster = garderCible();
  console.log("\n  Test HTTP complet OVH → MKL CRM RECETTE\n");
  console.log(`  Empreinte du cluster      ${cluster}, recette confirmée`);
  console.log(`  Adresse Supabase          ${coffre.MKL_RECETTE_URL}`);
  console.log(`  Appartenance de la clé    ${provenanceCle}`);
  console.log(`  Organisation              ${coffre.MKL_RECETTE_ORGANIZATION_ID}`);
  console.log(`  Secrets HMAC et cron      engendrés à l'instant, jamais affichés\n`);

  const etat0 = sql(`select count(*) || ' demande(s), ' ||
      (select count(*) from public.commercial_opportunities) || ' prospect(s)'
      from public.web_lead_submissions`);
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
  console.log("");
} else {
  console.log(`\n  Mode signature, aucun secret ni aucune base`);
  console.log(`  Adresse Supabase          port fermé 127.0.0.1:9, rien ne sort`);
  console.log(`  Secret HMAC               engendré à l'instant, jamais affiché\n`);
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

if (!(await attendreServeur())) {
  console.error("  Le serveur ne répond pas. Avez-vous lancé `npm run build` ?\n");
  console.error(journal.join("").slice(-800));
  await arreter();
  process.exit(1);
}

const chemin = "/api/web-leads";
const soumissions = new Map();

function corpsDe(cas) {
  return JSON.stringify({
    submissionId: soumissions.get(cas.cle),
    kind: "lead",
    ...cas.contact,
    ...cas.champs,
    message: `Demande d'essai ${cas.titre}, donnees fictives.`,
  });
}

function entetesNeuves(corps) {
  return signer({
    secret: secretHmac, keyId, method: "POST", chemin, corps,
    horodatage: Date.now(), nonce: randomUUID(),
  });
}

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
    const r = await agir();
    noter(`HMAC — ${intitule} refusé`, attendu, r.statut, r.charge?.error || "");
  }

  const gros = JSON.stringify({ submissionId: `${MARQUE}-gros`, kind: "lead", phone: "0600000000", bourrage: "x".repeat(70 * 1024) });
  const r = await envoyer(gros, entetesNeuves(gros));
  noter("HMAC — corps de 70 kio refusé", 413, r.statut, r.charge?.error || "");
}

// --- Chaîne complète : les trois origines ---------------------------------

if (mode === "complet") {
  for (const cas of CAS) {
    soumissions.set(cas.cle, `${MARQUE}-${cas.cle}-${randomUUID().slice(0, 8)}`);
    const corps = corpsDe(cas);
    const soumission = soumissions.get(cas.cle);

    // 1. Réception. Une demande neuve rend 201, une connue rend 200.
    const premiere = await envoyer(corps, entetesNeuves(corps));
    noter(`${cas.titre} — demande reçue`, 201, premiere.statut,
      `duplicate=${premiere.charge?.duplicate}`);

    // 2. Le traitement est lancé après la réponse : on attend que la fiche
    //    apparaisse réellement, au lieu de supposer un délai.
    let fiche = null;
    for (let i = 0; i < 30 && !fiche; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const vu = sql(`select coalesce(string_agg(o.source || '|' || o.origin_category || '|' ||
            coalesce(o.origin_subtype, '-') || '|' || s.status, ''), '')
          from public.web_lead_submissions s
          left join public.commercial_opportunities o on o.web_lead_submission_id = s.id
          where s.submission_id = '${soumission}'`);
      if (vu && vu.split("|").length === 4 && !vu.startsWith("|")) fiche = vu.split("|");
    }
    if (!fiche) {
      noter(`${cas.titre} — fiche créée dans RECETTE`, "créée", "absente après 30 s",
        "le traitement n'a pas abouti, voir le backlog");
      continue;
    }
    const [libelle, categorie, , statut] = fiche;

    noter(`${cas.titre} — libellé affiché`, cas.libelle, libelle);
    noter(`${cas.titre} — origine enregistrée`, cas.cle, categorie);
    noter(`${cas.titre} — demande clôturée`, "done", statut);

    // 3. Attribution : premier contact, avec la preuve attendue.
    const attribution = sql(`select coalesce(string_agg(a.touch_role || '|' || a.evidence, ','), 'aucune')
        from public.lead_attribution a
        join public.commercial_opportunities o on o.id = a.opportunity_id
        where o.web_lead_submission_id = (
          select id from public.web_lead_submissions where submission_id = '${soumission}')`);
    noter(`${cas.titre} — attribution du premier contact`, `premier|${cas.preuve}`, attribution);

    // 4. Relance du site : même demande, signature neuve. La file doit la
    //    reconnaître et ne rien recréer.
    const relance = await envoyer(corps, entetesNeuves(corps));
    noter(`${cas.titre} — relance reconnue`, 200, relance.statut,
      `duplicate=${relance.charge?.duplicate}`);
    noter(`${cas.titre} — relance signalée comme connue`, "true", String(relance.charge?.duplicate));

    // 5. Décompte : une seule demande, une seule fiche, une seule attribution.
    const unicite = sql(`select
        (select count(*) from public.web_lead_submissions where submission_id = '${soumission}') || '/' ||
        (select count(*) from public.commercial_opportunities where web_lead_submission_id = (
           select id from public.web_lead_submissions where submission_id = '${soumission}')) || '/' ||
        (select count(*) from public.lead_attribution a
           join public.commercial_opportunities o on o.id = a.opportunity_id
           where o.web_lead_submission_id = (
             select id from public.web_lead_submissions where submission_id = '${soumission}'))`);
    noter(`${cas.titre} — aucun doublon après relance`, "1/1/1", unicite,
      "demandes / fiches / attributions");
  }

  // --- Visibilité : les fiches doivent être exploitables par le CRM --------
  const visibles = sql(`select count(*) from public.commercial_opportunities o
      join public.web_lead_submissions s on s.id = o.web_lead_submission_id
      where s.submission_id like '%${MARQUE}%' and o.organization_id = '${coffre.MKL_RECETTE_ORGANIZATION_ID}'`);
  noter("Les trois fiches sont rattachées à l'organisation", "3", visibles);

  const sansCommercial = sql(`select count(*) from public.commercial_opportunities o
      join public.web_lead_submissions s on s.id = o.web_lead_submission_id
      where s.submission_id like '%${MARQUE}%' and o.assigned_to is null`);
  noter("Les trois fiches attendent une attribution", "3", sansCommercial,
    "seau non attribué, visible au dispatch");
}

await arreter();

// ---------------------------------------------------------------------------

console.log("  test                                                          attendu              obtenu               verdict");
let domaine = "";
for (const r of resultats) {
  const d = r.intitule.split(" — ")[0];
  if (d !== domaine) { console.log(""); domaine = d; }
  console.log(`  ${r.intitule.padEnd(60)} ${String(r.attendu).padEnd(20)} ${String(r.obtenu).padEnd(20)} ${r.verdict}`);
  if (r.detail) console.log(`      ${r.detail}`);
}
const echecs = resultats.filter(r => r.verdict !== "réussi").length;
console.log(`\n  ${resultats.length - echecs} réussi(s), ${echecs} échoué(s)`);

if (mode === "complet") {
  console.log("\n  Données fictives laissées en base, marquées pour le nettoyage :");
  for (const [cle, valeur] of soumissions) console.log(`    ${cle.padEnd(12)} ${valeur}`);
  console.log("\n  Nettoyage : node scripts/recette/test-http-ovh.mjs --nettoyer\n");
}
process.exit(echecs === 0 ? 0 : 1);
