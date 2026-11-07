/**
 * Intégration réelle des formulaires du site OVH vers le CRM RECETTE.
 *
 *   node scripts/recette/test-formulaires-ovh.mjs --complet
 *   node scripts/recette/test-formulaires-ovh.mjs --nettoyer
 *
 * Ce que ce banc d'essai ajoute aux tests déjà écrits : il ne simule rien. Le
 * vrai `server.mjs` du site est démarré, le vrai module de capture calcule
 * l'attribution depuis une arrivée de visiteur, le vrai formulaire est posté
 * sur `/api/leads`, et c'est la file d'attente du site qui signe et transmet.
 * Les tests unitaires éprouvent les pièces ; celui-ci éprouve l'assemblage.
 *
 * Trois provenances sont parcourues : Google Ads, Facebook, et une visite sans
 * marqueur publicitaire.
 *
 * Garde-fous : la cible doit être RECETTE, jamais la production. Le serveur
 * écrit dans un dossier temporaire, donc jamais dans les données du site. Les
 * secrets viennent du coffre hors dépôt et ne sont jamais affichés. Les
 * prospects sont fictifs, sur le domaine `.test` réservé par la norme.
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  attributionBody,
  mergeFirstTouch,
  mergeLastTouch,
  touchFromArrival,
} from "../../ovh-site/lib/attribution-capture.mjs";

const RACINE = fileURLToPath(new URL("../..", import.meta.url));
const REF_PRODUCTION = "rzkwmwtjnwnmmcexwoov";
const CLUSTER_RECETTE = "7703759698107299042";
const CLUSTER_PRODUCTION = "7662760187650847164";
const MARQUE = "essai-formulaire";
const HOTE_SITE = "mkl-energies.fr";

const mode = process.argv.find(a => a.startsWith("--")) || "--complet";

const resultats = [];
function noter(intitule, attendu, obtenu, detail = "") {
  const verdict = String(attendu) === String(obtenu) ? "réussi" : "ÉCHOUÉ";
  resultats.push({ verdict, intitule });
  console.log(`  ${intitule.padEnd(48)} ${String(attendu).padEnd(26)} ${String(obtenu).padEnd(26)} ${verdict}`);
  if (detail) console.log(`      ${detail}`);
}
function info(intitule, valeur) {
  console.log(`  ${intitule.padEnd(48)} ${valeur}`);
}

// ---------------------------------------------------------------------------
// Lecture de la base de recette, par la connexion déjà contrôlée
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
// Nettoyage
// ---------------------------------------------------------------------------

async function nettoyer() {
  console.log("\n  Nettoyage des données fictives de ce banc d'essai\n");
  garderCible();

  const avant = sql(
    `select count(*) from public.commercial_opportunities where email like '%${MARQUE}%'`);
  console.log(`    ${avant} fiche(s) de test repérée(s).\n`);

  // L'ordre suit les dépendances : ce qui pointe vers une fiche part avant la
  // fiche. Les demandes désignent la fiche par opportunity_id, et les
  // attributions la désignent par l'identifiant de soumission.
  const etapes = [
    ["attributions", `delete from public.lead_attribution where submission_id in (
        select s.submission_id from public.web_lead_submissions s
         join public.commercial_opportunities o on o.id = s.opportunity_id
        where o.email like '%${MARQUE}%')`],
    ["rendez-vous", `delete from public.commercial_appointments where opportunity_id in (
        select id from public.commercial_opportunities where email like '%${MARQUE}%')`],
    ["événements de file", `delete from public.web_lead_events where submission_pk in (
        select s.id from public.web_lead_submissions s
         join public.commercial_opportunities o on o.id = s.opportunity_id
        where o.email like '%${MARQUE}%')`],
    ["demandes", `delete from public.web_lead_submissions where opportunity_id in (
        select id from public.commercial_opportunities where email like '%${MARQUE}%')`],
    ["fiches prospects", `delete from public.commercial_opportunities where email like '%${MARQUE}%'`],
  ];

  for (const [intitule, requete] of etapes) {
    sql(requete);
    console.log(`      ✓ ${intitule} supprimé(e)s`);
  }

  const reste = sql(
    `select count(*) from public.commercial_opportunities where email like '%${MARQUE}%'`);
  const total = sql(`select (select count(*) from public.web_lead_submissions) || ' demande(s), '
    || (select count(*) from public.commercial_opportunities) || ' prospect(s), '
    || (select count(*) from public.lead_attribution) || ' attribution(s)'`);
  console.log(`\n    Restant portant la marque : ${reste} fiche(s)`);
  console.log(`    Total en base : ${total}\n`);
}

if (mode === "--nettoyer") {
  await nettoyer();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Configuration, depuis le coffre hors dépôt
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

const CIBLE = process.env.CRM_SYNC_URL
  || "https://crm-mkl-energeies-rekz9sboc-mkl-crm.vercel.app/api/web-leads";

if (CIBLE.includes(REF_PRODUCTION)) {
  console.error("\n  L'adresse visée porte l'identifiant du projet de PRODUCTION : arrêt.\n");
  process.exit(2);
}
for (const nom of ["MKL_RECETTE_KEY_ID", "MKL_RECETTE_HMAC_SECRET", "MKL_VERCEL_BYPASS"]) {
  if (!coffre[nom]) {
    console.error(`\n  ${nom} absent du coffre : arrêt.\n`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Les trois provenances, décrites comme des arrivées sur le site
// ---------------------------------------------------------------------------

const CAS = [
  {
    cle: "google_ads",
    titre: "Google Ads",
    libelle: "Prospect GG Ads · Google Ads",
    categorie: "google_ads",
    attributions: "unique|gclid",
    arrivees: [
      { search: `?gclid=${MARQUE}-gclid-fictif&utm_source=google&utm_medium=cpc&utm_campaign=PAC%20hiver`,
        path: "/pompe-a-chaleur.html" },
    ],
    projets: ["pac"],
  },
  {
    cle: "meta_ads",
    titre: "Facebook",
    libelle: "Prospect Face · Facebook",
    categorie: "meta_ads",
    attributions: "premier|referrer,dernier|fbclid",
    arrivees: [
      { referrer: "https://www.bing.com/search", path: "/" },
      { search: `?fbclid=${MARQUE}-fbclid-fictif&utm_source=facebook&utm_medium=paid_social&utm_campaign=PV%20automne`,
        path: "/photovoltaique.html" },
    ],
    projets: ["photovoltaique"],
  },
  {
    cle: "site_web",
    titre: "Site Internet",
    libelle: "Prospect Site · Accès direct",
    categorie: "site_web",
    attributions: "aucune",
    arrivees: [
      { path: "/climatisation.html" },
    ],
    projets: ["climatisation"],
  },
];

// ---------------------------------------------------------------------------
// Le navigateur, reconstitué avec le module du site
// ---------------------------------------------------------------------------

function capturer(arrivees) {
  let dernier = null;
  let premier = null;
  let horloge = Date.now() - arrivees.length * 60_000;
  for (const arrivee of arrivees) {
    horloge += 60_000;
    const touche = touchFromArrival({
      search: arrivee.search || "",
      referrer: arrivee.referrer || "",
      path: arrivee.path || "/",
      ownHost: HOTE_SITE,
      now: horloge,
    });
    if (!touche) continue;
    dernier = mergeLastTouch(dernier, touche, horloge);
    premier = mergeFirstTouch(premier, touche, horloge);
  }
  return attributionBody(dernier, premier);
}

function formulaire(cas) {
  const champs = capturer(cas.arrivees);
  return {
    intent: "etude",
    projects: cas.projets,
    postalCode: "13001",
    housing: "maison",
    firstName: "Essai",
    lastName: `Fictif ${cas.titre}`,
    phone: "0600000009",
    email: `${MARQUE}-${cas.cle}@exemple.test`,
    message: "Demande fictive de recette, a supprimer.",
    pagePath: cas.arrivees[cas.arrivees.length - 1].path,
    callbackChecked: false,
    uiActionLabel: "Envoyer ma demande d’étude",
    ...champs,
  };
}

// ---------------------------------------------------------------------------
// Démarrage du vrai serveur du site
// ---------------------------------------------------------------------------

const PORT = 4711;
const dossierDonnees = await mkdtemp(join(tmpdir(), "mkl-site-recette-"));

const portOccupe = spawnSync("sh", ["-c", `lsof -ti tcp:${PORT} | head -1`], { encoding: "utf8" });
if ((portOccupe.stdout || "").trim()) {
  console.error(`\n  Le port ${PORT} est déjà pris par le processus ${portOccupe.stdout.trim()}.`);
  console.error("  Un serveur résiduel ferait croire à un succès obtenu ailleurs : arrêt.\n");
  process.exit(2);
}

console.log("\n  Intégration réelle des formulaires OVH → CRM RECETTE\n");
const empreinte = garderCible();
info("groupe de bases", `${empreinte} — recette`);
info("cible du CRM", new URL(CIBLE).hostname);
info("données du site", `${dossierDonnees} (temporaire)`);
info("secret de signature", `${coffre.MKL_RECETTE_HMAC_SECRET.length} caractères, jamais affiché`);
console.log("");

const serveur = spawn(process.execPath, [join(RACINE, "ovh-site", "server.mjs")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    MKL_DATA_DIR: dossierDonnees,
    CRM_SYNC_ENABLED: "1",
    CRM_SYNC_URL: CIBLE,
    CRM_SYNC_KEY_ID: coffre.MKL_RECETTE_KEY_ID,
    CRM_SYNC_SECRET: coffre.MKL_RECETTE_HMAC_SECRET,
    CRM_SYNC_BYPASS: coffre.MKL_VERCEL_BYPASS,
    SESSION_SECRET: "session-de-recette-sans-valeur-reelle-0000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const journal = [];
serveur.stdout.on("data", d => journal.push(String(d)));
serveur.stderr.on("data", d => journal.push(String(d)));

// Le serveur doit mourir même si ce script s'arrête sur une erreur.
let arrete = false;
async function terminer(code) {
  if (arrete) return;
  arrete = true;
  serveur.kill("SIGKILL");
  await rm(dossierDonnees, { recursive: true, force: true }).catch(() => {});
  process.exit(code);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => terminer(130));
process.on("uncaughtException", async erreur => {
  console.error(`\n  Interruption : ${erreur?.message || erreur}\n`);
  await terminer(1);
});

async function attendreServeur() {
  for (let essai = 0; essai < 60; essai += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/public-config`, {
        signal: AbortSignal.timeout(2000),
      });
      if (r.status < 500) return true;
    } catch { /* pas encore prêt */ }
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

if (!await attendreServeur()) {
  console.error("  Le serveur du site n'a pas démarré.");
  console.error(journal.join("").slice(-1200));
  await terminer(1);
}
noter("le serveur du site démarre", "oui", "oui",
  `port ${PORT}, données isolées dans un dossier temporaire`);

const ligneSynchro = journal.join("").match(/Synchro CRM\s+→\s+(\S+)/);
noter("la synchronisation vers le CRM est active", "ON", ligneSynchro?.[1] || "inconnue",
  "le site signera et transmettra de lui-même");

// ---------------------------------------------------------------------------
// Les trois envois
// ---------------------------------------------------------------------------

console.log("");
for (const cas of CAS) {
  const corps = formulaire(cas);
  const r = await fetch(`http://127.0.0.1:${PORT}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(20_000),
  });
  const charge = await r.json().catch(() => ({}));
  noter(`${cas.titre} — le formulaire est accepté`, 201, r.status,
    charge.error ? `réponse : ${charge.error}` : `demande ${String(charge.id || "").slice(0, 8)}`);
}

// La file est vidée dès la création, mais l'envoi est asynchrone : on attend
// que les trois fiches soient visibles plutôt que de supposer un délai.
async function attendreArrivee(attendu) {
  for (let essai = 0; essai < 40; essai += 1) {
    const n = Number(sql(
      `select count(*) from public.commercial_opportunities where email like '%${MARQUE}%'`));
    if (n >= attendu) return n;
    await new Promise(r => setTimeout(r, 500));
  }
  return Number(sql(
    `select count(*) from public.commercial_opportunities where email like '%${MARQUE}%'`));
}

console.log("");
const arrivees = await attendreArrivee(CAS.length);
noter("les trois demandes parviennent au CRM", CAS.length, arrivees,
  "transmission signée par la file d'attente du site, pas par ce script");

// ---------------------------------------------------------------------------
// Vérification du classement, provenance par provenance
// ---------------------------------------------------------------------------

console.log("");
for (const cas of CAS) {
  const courriel = `${MARQUE}-${cas.cle}@exemple.test`;
  const lu = sql(`select coalesce(o.source, 'absent') || ' ~ ' || coalesce(o.origin_category, 'absent')
      || ' ~ ' || coalesce((select string_agg(coalesce(a.touch_role, 'unique') || '|' || a.evidence, ',' order by a.touch_role)
            from public.lead_attribution a
            join public.web_lead_submissions s on s.submission_id = a.submission_id
           where s.opportunity_id = o.id), 'aucune')
    from public.commercial_opportunities o where o.email = '${courriel}'`);

  const [libelle, categorie, attributions] = lu ? lu.split(" ~ ") : ["absent", "absent", "absent"];
  noter(`${cas.titre} — libellé affiché`, cas.libelle, libelle);
  noter(`${cas.titre} — origine enregistrée`, cas.categorie, categorie);
  noter(`${cas.titre} — contacts d'attribution`, cas.attributions, attributions);
}

// Contrôle de non-régression le plus important : une visite sans marqueur ne
// doit jamais être promue en prospect publicitaire.
const publicitaireIndu = sql(
  `select count(*) from public.commercial_opportunities
    where email = '${MARQUE}-site_web@exemple.test'
      and origin_category in ('google_ads', 'meta_ads')`);
noter("une visite sans marqueur reste non publicitaire", "0", publicitaireIndu,
  "aucune provenance n'est inventée");

// ---------------------------------------------------------------------------

const echecs = resultats.filter(r => r.verdict !== "réussi").length;
console.log(`\n  ${resultats.length - echecs} réussi(s), ${echecs} échoué(s)`);

if (echecs) {
  console.log("\n  Journal du serveur du site, fin :");
  console.log(journal.join("").slice(-1500).replace(/^/gm, "      "));
}

console.log(`\n  Nettoyage : node scripts/recette/test-formulaires-ovh.mjs --nettoyer\n`);
await terminer(echecs === 0 ? 0 : 1);
