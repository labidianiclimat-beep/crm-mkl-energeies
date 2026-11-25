/**
 * Scénarios de bout en bout d'une demande du site.
 *
 * Chaque scénario rejoue la chaîne complète en mémoire : capture dans le
 * navigateur, interception de l'envoi, signature, réception par le CRM,
 * classement de l'origine, création de la fiche et des contacts.
 *
 * Aucun réseau, aucune base, aucun déploiement : seules les vraies fonctions
 * des deux déploiements sont appelées.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  createCapture,
  installAutoAttach,
} from "../ovh-site/lib/attribution-capture.mjs";
import { parseAttribution, parseFirstAttribution } from "../ovh-site/lib/lead-attribution.mjs";
import { buildCrmPayload, buildSignedRequest } from "../ovh-site/lib/crm-sync.mjs";
import { parseWebLeadPayload } from "../app/lib/web-lead-ingest.js";
import { verifyWebLeadSignature } from "../app/lib/web-lead-hmac.js";
import {
  attributionTouchesFromWebLead,
  planWebLeadIntegration,
  prospectRowFromWebLead,
  webLeadOrigin,
} from "../app/lib/web-lead-consumer.js";
import { prospectorIdOf } from "../app/lib/prospects.js";
import { aggregateByOrigin } from "../app/lib/marketing-attribution.js";
import { readFileSync } from "node:fs";

const OWN_HOST = "www.mkl-energies.fr";
const ORG = "00000000-0000-0000-0000-000000000001";
const SECRET = "secret-de-test-de-plus-de-32-caracteres";
const DAY = 24 * 60 * 60 * 1000;

function fakeStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    size: () => map.size,
  };
}

/**
 * Navigateur simulé. Chaque appel à `visite` correspond à un chargement de
 * page, donc à une nouvelle instance du module, comme dans un vrai navigateur.
 */
function navigateur({ consent = false } = {}) {
  const durable = fakeStorage();
  let visite = fakeStorage();
  let horloge = Date.parse("2026-11-05T09:00:00.000Z");

  const page = (pathname, search = "", referrer = "") => createCapture({
    storage: durable,
    sessionStorage: visite,
    location: { pathname, search, hostname: OWN_HOST },
    referrer,
    ownHost: OWN_HOST,
    consent,
    now: () => horloge,
  });

  return {
    durable,
    get visite() { return visite; },
    visiter(pathname, search = "", referrer = "") {
      page(pathname, search, referrer).capture();
      return this;
    },
    /** Le visiteur ferme son navigateur : la mémoire de visite est perdue. */
    revenirPlusTard(jours) {
      horloge += jours * DAY;
      visite = fakeStorage();
      return this;
    },
    /** Envoi d'un formulaire depuis la page courante, via fetch intercepté. */
    async envoyer(url, corps, pathname = "/contact.html") {
      const capture = page(pathname);
      const fenetre = { fetch: async (_input, init) => init };
      installAutoAttach(fenetre, capture);
      return fenetre.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
    },
  };
}

/**
 * Trajet serveur : ce que fait réellement server.mjs à la réception, puis la
 * transmission signée et la réception par le CRM.
 */
function chaine(corpsRecu, { kind = "lead", submissionId = "soumission-0001", recuA = "" } = {}) {
  const data = JSON.parse(corpsRecu);

  // L'horloge du serveur est injectée pour que le scénario soit reproductible.
  // En production c'est `Date.now()`.
  const receivedAt = recuA || "2026-11-05T09:30:00.000Z";
  const now = Date.parse(receivedAt);

  const attribution = parseAttribution(data.attribution || data, {
    headerReferer: `https://${OWN_HOST}/contact.html`,
    pagePath: "/contact.html",
    ownHost: OWN_HOST,
    now,
  });
  const attributionFirst = parseFirstAttribution(data.attributionFirst, { ownHost: OWN_HOST, now });

  const record = {
    id: submissionId,
    createdAt: receivedAt,
    intent: data.intent || "",
    projects: data.projects || [],
    postalCode: data.postalCode || "",
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    name: data.name || "",
    phone: data.phone || "",
    email: data.email || "",
    message: data.message || "",
    date: data.date || "",
    time: data.time || "",
    attribution,
    attributionFirst,
  };

  const signed = buildSignedRequest({
    job: { id: "job-1", kind, sourceId: submissionId, createdAt: record.createdAt },
    record,
    endpoint: "https://crm.example.test/api/web-leads",
    keyId: "k1",
    secret: SECRET,
  });

  const verification = verifyWebLeadSignature({
    method: "POST",
    path: "/api/web-leads",
    headers: signed.headers,
    rawBody: signed.rawBody,
    keyring: new Map([["k1", SECRET]]),
  });

  const parsed = parseWebLeadPayload(signed.rawBody);
  if (!parsed.ok) return { verification, parsed, payload: null };

  const payload = parsed.value;
  return {
    verification,
    parsed,
    payload,
    origin: webLeadOrigin(payload),
    prospect: prospectRowFromWebLead({ payload, organizationId: ORG }),
    touches: attributionTouchesFromWebLead({
      payload,
      organizationId: ORG,
      opportunityId: "opp-1",
    }),
  };
}

const DEVIS = {
  intent: "devis",
  projects: ["pac"],
  postalCode: "31000",
  firstName: "Ada",
  lastName: "Martin",
  name: "Ada Martin",
  phone: "0612345678",
  email: "ada@example.test",
  message: "Demande de devis",
};

const RAPPEL = { ...DEVIS, intent: "rappel", message: "Merci de me rappeler" };

// ---------------------------------------------------------------------------
// 1. Arrivée depuis Google Ads, puis demande de devis
// ---------------------------------------------------------------------------

test("arrivée Google Ads puis demande de devis", async () => {
  const visiteur = navigateur();
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123&utm_source=google&utm_medium=cpc&utm_campaign=pac-hiver");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);

  const resultat = chaine(envoi.body);
  assert.equal(resultat.verification.ok, true, "la signature doit être acceptée");
  assert.equal(resultat.origin.category, "google_ads");
  assert.equal(resultat.origin.evidence, "gclid");
  assert.equal(resultat.prospect.source, "Prospect GG Ads");
  assert.equal(resultat.prospect.origin_channel, "web_ingest");

  assert.equal(resultat.touches.length, 1, "une seule visite, un seul contact");
  assert.equal(resultat.touches[0].click_kind, "gclid");
  assert.equal(resultat.touches[0].click_id, "Cj0KCQabcdef123");
  assert.equal(resultat.touches[0].campaign_name, "pac-hiver");
  assert.equal(resultat.touches[0].landing_path, "/pompe-a-chaleur.html");
});

// ---------------------------------------------------------------------------
// 2. Arrivée depuis Facebook, puis demande de rappel
// ---------------------------------------------------------------------------

test("arrivée Facebook puis demande de rappel", async () => {
  const visiteur = navigateur();
  visiteur.visiter("/climatisation.html", "?fbclid=IwAR0exemple123&utm_source=facebook&utm_medium=paid_social");
  const envoi = await visiteur.envoyer("/api/leads", RAPPEL);

  const resultat = chaine(envoi.body);
  assert.equal(resultat.origin.category, "meta_ads");
  assert.equal(resultat.origin.subtype, "facebook");
  assert.equal(resultat.origin.evidence, "fbclid");
  assert.equal(resultat.prospect.source, "Prospect Face · Facebook");
  assert.equal(resultat.touches[0].click_kind, "fbclid");
});

/** Une demande de rappel reste du canal web : jamais « Entrant ». */
test("un rappel demandé en ligne n'est pas un appel entrant", async () => {
  const visiteur = navigateur();
  visiteur.visiter("/climatisation.html", "?fbclid=IwAR0exemple123");
  const envoi = await visiteur.envoyer("/api/leads", RAPPEL);
  const resultat = chaine(envoi.body);
  assert.equal(resultat.payload.intent, "rappel");
  assert.equal(resultat.origin.channel, "web_ingest");
  assert.notEqual(resultat.origin.category, "entrant");
});

// ---------------------------------------------------------------------------
// 3. Navigation sur plusieurs pages
// ---------------------------------------------------------------------------

test("la provenance survit à la navigation sur plusieurs pages", async () => {
  const visiteur = navigateur();
  visiteur
    .visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123&utm_source=google&utm_medium=cpc")
    .visiter("/nos-realisations.html", "", `https://${OWN_HOST}/pompe-a-chaleur.html`)
    .visiter("/tarifs.html", "", `https://${OWN_HOST}/nos-realisations.html`)
    .visiter("/contact.html", "", `https://${OWN_HOST}/tarifs.html`);

  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const resultat = chaine(envoi.body);

  assert.equal(resultat.origin.category, "google_ads");
  assert.equal(
    resultat.touches[0].landing_path,
    "/pompe-a-chaleur.html",
    "le chemin d'arrivée doit rester celui de l'annonce, pas celui du formulaire"
  );
  assert.equal(
    resultat.touches[0].referrer_host,
    null,
    "une navigation interne n'est pas un référent"
  );
});

// ---------------------------------------------------------------------------
// 4. Retour du visiteur après plusieurs jours
// ---------------------------------------------------------------------------

test("retour après plusieurs jours sans consentement : la trace est perdue", async () => {
  const visiteur = navigateur({ consent: false });
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123");
  assert.equal(visiteur.durable.size(), 0, "rien de durable sans consentement");

  visiteur.revenirPlusTard(5).visiter("/contact.html");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const resultat = chaine(envoi.body);

  assert.equal(resultat.origin.category, "site_web");
  assert.equal(resultat.origin.subtype, "direct");
  assert.equal(resultat.prospect.source, "Prospect Site · Accès direct");
  assert.equal(
    resultat.touches[0].click_id,
    null,
    "aucune trace publicitaire ne peut être inventée"
  );
});

test("retour après plusieurs jours avec consentement : le clic est conservé", async () => {
  const visiteur = navigateur({ consent: { ad_storage: "granted", analytics_storage: "granted" } });
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123&utm_campaign=pac-hiver");
  assert.ok(visiteur.durable.size() > 0, "la conservation est autorisée");

  visiteur.revenirPlusTard(5).visiter("/contact.html");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const resultat = chaine(envoi.body);

  assert.equal(resultat.origin.category, "google_ads");
  assert.equal(resultat.touches[0].click_id, "Cj0KCQabcdef123");
});

test("au-delà de la fenêtre de conversion, plus rien n'est attribué", async () => {
  const visiteur = navigateur({ consent: true });
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123");
  visiteur.revenirPlusTard(45).visiter("/contact.html");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const resultat = chaine(envoi.body);
  assert.equal(resultat.origin.category, "site_web");
});

/** Deux canaux successifs : c'est le cas qui rend les deux modèles utiles. */
test("premier et dernier contact diffèrent et sont tous deux enregistrés", async () => {
  const visiteur = navigateur({ consent: true });
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123&utm_campaign=pac-hiver");
  visiteur.revenirPlusTard(6).visiter("/climatisation.html", "?fbclid=IwAR0exemple123");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  // La demande est reçue après la seconde visite : les deux dates annoncées
  // par le navigateur sont donc plausibles et doivent être conservées.
  const resultat = chaine(envoi.body, { recuA: "2026-11-11T10:00:00.000Z" });

  assert.equal(resultat.touches.length, 2, "deux contacts doivent être enregistrés");
  const [premier, dernier] = resultat.touches;
  assert.equal(premier.origin_category, "google_ads");
  assert.equal(premier.click_kind, "gclid");
  assert.equal(dernier.origin_category, "meta_ads");
  assert.equal(dernier.click_kind, "fbclid");
  assert.ok(
    Date.parse(premier.touched_at) < Date.parse(dernier.touched_at),
    "la chronologie doit permettre de lire le premier contact"
  );
  assert.equal(
    resultat.origin.category,
    "meta_ads",
    "l'origine portée par la fiche est le dernier contact"
  );
});

test("un premier contact identique au dernier ne crée pas de doublon de contact", async () => {
  const visiteur = navigateur({ consent: true });
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123");
  visiteur.revenirPlusTard(3).visiter("/contact.html");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const resultat = chaine(envoi.body);
  assert.equal(resultat.touches.length, 1);
});

// ---------------------------------------------------------------------------
// 5. Demande de rendez-vous
// ---------------------------------------------------------------------------

test("prise de rendez-vous depuis une annonce Google Ads", async () => {
  const visiteur = navigateur();
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123");
  const envoi = await visiteur.envoyer(
    "/api/appointments",
    { ...DEVIS, intent: "rdv", date: "2026-11-10", time: "09:00" },
    "/rdv.html"
  );

  const resultat = chaine(envoi.body, { kind: "appointment", submissionId: "rdv-0001" });
  assert.equal(resultat.verification.ok, true);
  assert.equal(resultat.payload.kind, "appointment");
  assert.equal(resultat.payload.date, "2026-11-10");
  assert.equal(resultat.origin.category, "google_ads");
  assert.equal(resultat.touches[0].submission_id, "rdv-0001");
});

// ---------------------------------------------------------------------------
// 6. Absence de paramètres publicitaires
// ---------------------------------------------------------------------------

test("sans aucun paramètre, la demande est un accès direct au site", async () => {
  const visiteur = navigateur();
  visiteur.visiter("/index.html");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const resultat = chaine(envoi.body);

  assert.equal(resultat.origin.category, "site_web");
  assert.equal(resultat.origin.subtype, "direct");
  assert.equal(resultat.touches.length, 1);
  assert.equal(resultat.touches[0].click_kind, null);
  assert.equal(resultat.touches[0].campaign_name, null);
});

test("une arrivée par le référencement naturel reste au site", async () => {
  const visiteur = navigateur();
  visiteur.visiter("/pompe-a-chaleur.html", "", "https://www.google.com/search?q=pompe+a+chaleur+toulouse");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const resultat = chaine(envoi.body);

  assert.equal(resultat.origin.category, "site_web");
  assert.equal(resultat.touches[0].referrer_host, "www.google.com");
  assert.equal(
    resultat.touches[0].click_kind,
    null,
    "une recherche naturelle n'est jamais un clic payant"
  );
});

test("le corps envoyé ne porte aucune provenance quand il n'y a rien à dire", async () => {
  const visiteur = navigateur();
  visiteur.visiter("/index.html");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const corps = JSON.parse(envoi.body);
  assert.equal(corps.attribution, undefined);
  assert.equal(corps.attributionFirst, undefined);
  assert.equal(corps.phone, "0612345678", "le formulaire part intact");
});

// ---------------------------------------------------------------------------
// 7. Raccordement automatique : ni formulaire créé, ni conversion touchée
// ---------------------------------------------------------------------------

test("l'envoi est enrichi sans que le formulaire soit modifié", async () => {
  const visiteur = navigateur();
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const corps = JSON.parse(envoi.body);

  for (const [cle, valeur] of Object.entries(DEVIS)) {
    assert.deepEqual(corps[cle], valeur, `le champ ${cle} doit être intact`);
  }
  assert.equal(corps.attribution.gclid, "Cj0KCQabcdef123");
});

test("une route étrangère n'est pas touchée", async () => {
  const visiteur = navigateur();
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123");
  const envoi = await visiteur.envoyer("/api/newsletter", { email: "ada@example.test" });
  const corps = JSON.parse(envoi.body);
  assert.equal(corps.attribution, undefined, "seules les deux routes de demande sont enrichies");
});

test("une valeur déjà posée par la page est conservée", async () => {
  const visiteur = navigateur();
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123");
  const envoi = await visiteur.envoyer("/api/leads", {
    ...DEVIS,
    attribution: { gclid: "valeur-de-la-page" },
  });
  const corps = JSON.parse(envoi.body);
  assert.equal(corps.attribution.gclid, "valeur-de-la-page");
});

// ---------------------------------------------------------------------------
// 8. Absence de doublons dans le CRM
// ---------------------------------------------------------------------------

test("une demande nouvelle crée la fiche, sans propriétaire", async () => {
  const visiteur = navigateur();
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const { payload, prospect } = chaine(envoi.body);

  const plan = planWebLeadIntegration({ payload, candidates: [] });
  assert.equal(plan.outcome, "succeeded");
  assert.equal(plan.decision, "new");
  assert.equal(prospect.commercial_id, null);
  assert.equal(prospect.created_by, null);
  assert.equal(prospectorIdOf(prospect), "");
});

test("un prospect au même téléphone part en revue, sans rien créer", async () => {
  const visiteur = navigateur();
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const { payload } = chaine(envoi.body);

  const plan = planWebLeadIntegration({
    payload,
    candidates: [{
      id: "existant-1",
      phone: "06 12 34 56 78",
      email: "",
      name: "Ada Martin",
      createdAt: "2026-11-01T10:00:00.000Z",
    }],
  });
  assert.equal(plan.outcome, "review");
  assert.notEqual(plan.outcome, "succeeded");
  assert.ok(plan.candidateIds.includes("existant-1"));
});

/**
 * Deux envois de la même demande produisent le même identifiant, donc le CRM
 * les reconnaît comme une seule soumission. C'est ce qui protège des doublons
 * lors d'une reprise après panne réseau.
 */
test("deux transmissions de la même demande portent le même identifiant", async () => {
  const visiteur = navigateur();
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);

  const un = chaine(envoi.body, { submissionId: "soumission-unique" });
  const deux = chaine(envoi.body, { submissionId: "soumission-unique" });
  assert.equal(un.payload.submissionId, deux.payload.submissionId);
  assert.equal(un.payload.submissionId, "soumission-unique");
});

test("une demande et un rendez-vous du même visiteur restent deux soumissions", async () => {
  const visiteur = navigateur();
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123");
  const devis = await visiteur.envoyer("/api/leads", DEVIS);
  const rdv = await visiteur.envoyer(
    "/api/appointments",
    { ...DEVIS, intent: "rdv", date: "2026-11-10", time: "09:00" },
    "/rdv.html"
  );

  const a = chaine(devis.body, { submissionId: "lead-0001" });
  const b = chaine(rdv.body, { kind: "appointment", submissionId: "rdv-0001" });
  assert.notEqual(a.payload.submissionId, b.payload.submissionId);
  assert.equal(a.payload.kind, "lead");
  assert.equal(b.payload.kind, "appointment");
  // Le second sera rapproché du premier et mis en revue, jamais fusionné.
  const plan = planWebLeadIntegration({
    payload: b.payload,
    candidates: [{
      id: "opp-1",
      phone: "0612345678",
      email: "ada@example.test",
      name: "Ada Martin",
      createdAt: "2026-11-05T09:30:00.000Z",
    }],
  });
  assert.equal(plan.outcome, "review");
});

// ---------------------------------------------------------------------------
// Garde-fous transverses
// ---------------------------------------------------------------------------

test("une signature invalide est refusée avant toute interprétation", async () => {
  const visiteur = navigateur();
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const { payload } = chaine(envoi.body);

  const signed = buildSignedRequest({
    job: { id: "job-1", kind: "lead", sourceId: payload.submissionId },
    record: { id: payload.submissionId, name: "Ada", phone: "0612345678" },
    endpoint: "https://crm.example.test/api/web-leads",
    keyId: "k1",
    secret: SECRET,
  });
  const falsifie = verifyWebLeadSignature({
    method: "POST",
    path: "/api/web-leads",
    headers: signed.headers,
    rawBody: `${signed.rawBody} `,
    keyring: new Map([["k1", SECRET]]),
  });
  assert.equal(falsifie.ok, false);
});

test("aucune coordonnée ne peut entrer dans la provenance", async () => {
  const visiteur = navigateur();
  visiteur.visiter(
    "/contact.html",
    "?gclid=Cj0KCQabcdef123&email=ada@example.test&phone=0612345678&name=Ada+Martin"
  );
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const { touches } = chaine(envoi.body);
  const dump = JSON.stringify(touches);
  for (const fuite of ["ada@example.test", "0612345678", "Ada", "Martin"]) {
    assert.equal(dump.includes(fuite), false, `la provenance ne doit pas contenir ${fuite}`);
  }
});

test("une horloge de navigateur avancée ne crée pas un contact dans le futur", async () => {
  const visiteur = navigateur({ consent: true });
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const corps = JSON.parse(envoi.body);
  corps.attribution.capturedAt = "2099-01-01T00:00:00.000Z";

  const { touches } = chaine(JSON.stringify(corps));
  assert.ok(
    Date.parse(touches[0].touched_at) <= Date.parse("2026-11-05T09:30:00.000Z"),
    "la date de réception doit primer sur une horloge fausse"
  );
});

// ---------------------------------------------------------------------------
// Boucle complète : les contacts produits alimentent les deux modèles
// ---------------------------------------------------------------------------

test("les deux contacts produits se lisent bien comme deux modèles distincts", async () => {
  const visiteur = navigateur({ consent: true });
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123&utm_campaign=pac-hiver");
  visiteur.revenirPlusTard(6).visiter("/climatisation.html", "?fbclid=IwAR0exemple123");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const { touches, prospect } = chaine(envoi.body, { recuA: "2026-11-11T10:00:00.000Z" });

  const fiche = { ...prospect, id: "opp-1" };
  const entree = { prospects: [fiche], attributions: touches };

  const premier = aggregateByOrigin({ ...entree, model: "premier_contact" });
  const dernier = aggregateByOrigin({ ...entree, model: "dernier_contact" });

  assert.equal(premier.length, 1);
  assert.equal(premier[0].key, "google_ads", "le premier contact crédite Google Ads");
  assert.equal(dernier[0].key, "meta_ads", "le dernier contact crédite Meta");
  assert.equal(premier[0].prospects, 1);
  assert.equal(dernier[0].prospects, 1);
});

test("les rôles sont renseignés et conformes à la contrainte de la base", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20261102_lead_attribution.sql", import.meta.url),
    "utf8"
  );
  const autorises = sql.match(/touch_role in \(([^)]*)\)/)[1]
    .split(",")
    .map(item => item.trim().replace(/'/g, ""));
  assert.deepEqual(autorises, ["premier", "dernier"]);
  assert.match(sql, /submission_id, coalesce\(touch_role, ''\)/, "le rôle doit entrer dans la clé d'unicité");
});

test("un contact unique ne porte aucun rôle, et reste unique en base", async () => {
  const visiteur = navigateur();
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const { touches } = chaine(envoi.body);
  assert.equal(touches.length, 1);
  assert.equal(touches[0].touch_role, null);
});

test("deux contacts portent des rôles distincts et la même soumission", async () => {
  const visiteur = navigateur({ consent: true });
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123");
  visiteur.revenirPlusTard(6).visiter("/climatisation.html", "?fbclid=IwAR0exemple123");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const { touches } = chaine(envoi.body, { recuA: "2026-11-11T10:00:00.000Z" });

  assert.deepEqual(touches.map(item => item.touch_role), ["premier", "dernier"]);
  assert.equal(touches[0].submission_id, touches[1].submission_id);
  const cles = touches.map(item => `${item.submission_id}|${item.touch_role}`);
  assert.equal(new Set(cles).size, 2, "la clé d'unicité doit rester distincte");
});

/** Même si le navigateur inverse les dates, la lecture reste juste. */
test("des dates inversées ne faussent pas le premier contact", async () => {
  const visiteur = navigateur({ consent: true });
  visiteur.visiter("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef123");
  visiteur.revenirPlusTard(6).visiter("/climatisation.html", "?fbclid=IwAR0exemple123");
  const envoi = await visiteur.envoyer("/api/leads", DEVIS);
  const corps = JSON.parse(envoi.body);
  corps.attributionFirst.capturedAt = "2026-11-11T09:59:00.000Z";
  corps.attribution.capturedAt = "2026-11-05T09:00:00.000Z";

  const { touches } = chaine(JSON.stringify(corps), { recuA: "2026-11-11T10:00:00.000Z" });
  const [premier, dernier] = touches;
  assert.ok(Date.parse(premier.touched_at) < Date.parse(dernier.touched_at));
  assert.equal(premier.origin_category, "google_ads");

  const lecture = aggregateByOrigin({
    prospects: [{ id: "opp-1", extra: {} }],
    attributions: touches,
    model: "premier_contact",
  });
  assert.equal(lecture[0].key, "google_ads");
});
