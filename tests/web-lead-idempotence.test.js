import test from "node:test";
import assert from "node:assert/strict";

import { isUniqueViolation, submissionKeyOf, webLeadIntegrator } from "../app/lib/web-lead-queue-server.js";
import {
  ORG,
  SOUMISSION,
  demandeDeuxContacts,
  demandeGoogleAds,
  faussebase,
  uuid,
} from "./helpers/fausse-base-web-leads.mjs";


/**
 * Idempotence de l'intégration des demandes du site.
 *
 * Ce qui est éprouvé ici n'est pas que le chemin normal fonctionne, mais que
 * les chemins anormaux convergent : une tentative interrompue après n'importe
 * quelle écriture, puis reprise, doit aboutir à exactement une fiche, un
 * contact par rôle et un rendez-vous.
 *
 * La fausse base applique les mêmes index uniques que
 * 20261105_web_lead_idempotence.sql. C'est délibéré : si l'index est la vraie
 * garantie, alors le test doit échouer quand le code s'appuie sur autre chose.
 * Une fausse base permissive validerait un code qui crée des doublons.
 */

/** Lance un tour de file complet, comme le cron. */
async function tour(db) {
  return webLeadIntegrator({ request: db.request }).processQueue({ worker: "test" });
}

function fichesDe(db, soumission) {
  return db.state.opportunities.filter(row => row.extra?.webLead?.submissionId === soumission);
}

// ---------------------------------------------------------------------------
// Chemin normal
// ---------------------------------------------------------------------------

test("une demande Google Ads crée une seule fiche « Prospect GG Ads »", async () => {
  const db = faussebase();
  const sub = db.recevoir(demandeGoogleAds());

  const counts = await tour(db);

  assert.equal(counts.created, 1);
  assert.equal(counts.retry, 0);
  const fiches = fichesDe(db, SOUMISSION);
  assert.equal(fiches.length, 1, "une demande, une fiche");
  assert.equal(fiches[0].origin_category, "google_ads");
  assert.equal(fiches[0].source, "Prospect GG Ads");
  assert.equal(db.state.submissions.get(sub.id).status, "done");
});

test("la fiche créée n'est affectée à personne, elle part au dispatch", async () => {
  const db = faussebase();
  db.recevoir(demandeGoogleAds());
  await tour(db);

  const fiche = fichesDe(db, SOUMISSION)[0];
  assert.equal(fiche.commercial_id, null, "une demande du site n'est affectée par personne");
  assert.equal(fiche.stage, "Nouveau");
});

test("l'attribution publicitaire est conservée sur le contact", async () => {
  const db = faussebase();
  db.recevoir(demandeGoogleAds());
  await tour(db);

  assert.equal(db.state.attribution.length, 1);
  const touche = db.state.attribution[0];
  assert.equal(touche.origin_category, "google_ads");
  assert.equal(touche.click_kind, "gclid");
  assert.equal(touche.click_id, "Cj0KCQexempleGclid");
  assert.equal(touche.campaign_name, "pac-hiver-2026");
  assert.equal(touche.keyword, "pompe a chaleur prix");
  assert.equal(touche.submission_id, SOUMISSION);
});

// ---------------------------------------------------------------------------
// Interruption après chaque étape
// ---------------------------------------------------------------------------

const ETAPES = [
  "POST /rest/v1/commercial_opportunities",
  "POST /rest/v1/rpc/attach_web_lead_opportunity",
  "POST /rest/v1/lead_attribution",
  "POST /rest/v1/commercial_appointments",
  "POST /rest/v1/rpc/settle_web_lead",
];

for (const etape of ETAPES) {
  test(`interruption sur « ${etape} » puis reprise : une seule fiche`, async () => {
    const db = faussebase();
    const sub = db.recevoir(demandeGoogleAds({ kind: "appointment" }), { kind: "appointment" });

    db.couperApres(etape);
    const premier = await tour(db);

    // La coupure sur la clôture est un cas à part : tout le travail utile est
    // fait, seule la clôture manque, donc la demande repart en attente.
    assert.equal(premier.created, 0, "la tentative interrompue ne doit pas être comptée comme réussie");
    assert.equal(premier.retry, 1);
    assert.equal(db.state.submissions.get(sub.id).status, "pending");

    const second = await tour(db);

    assert.equal(second.created, 1, "la reprise doit aboutir");
    assert.equal(fichesDe(db, SOUMISSION).length, 1, "aucune seconde fiche");
    assert.equal(db.state.attribution.length, 1, "aucun contact en double");
    assert.equal(db.state.appointments.length, 1, "aucun rendez-vous en double");
    assert.equal(db.state.submissions.get(sub.id).status, "done");
  });
}

test("interruption répétée sur l'attribution : toujours une seule fiche", async () => {
  const db = faussebase();
  const sub = db.recevoir(demandeGoogleAds());

  for (let essai = 0; essai < 4; essai += 1) {
    db.couperApres("POST /rest/v1/lead_attribution");
    await tour(db);
  }

  assert.equal(fichesDe(db, SOUMISSION).length, 1, "quatre échecs, une seule fiche");
  assert.equal(db.state.attribution.length, 0, "aucune attribution n'a pu être écrite");

  const final = await tour(db);
  assert.equal(final.created, 1);
  assert.equal(fichesDe(db, SOUMISSION).length, 1);
  assert.equal(db.state.attribution.length, 1);
  assert.equal(db.state.submissions.get(sub.id).status, "done");
});

test("la fiche créée au premier essai ne devient pas son propre doublon", async () => {
  const db = faussebase();
  const sub = db.recevoir(demandeGoogleAds());

  db.couperApres("POST /rest/v1/rpc/attach_web_lead_opportunity");
  await tour(db);
  assert.equal(fichesDe(db, SOUMISSION).length, 1);
  // Le rattachement a échoué : la demande ne pointe sur rien, la reprise ne
  // peut compter que sur la recherche par identifiant de soumission.
  assert.equal(db.state.submissions.get(sub.id).opportunity_id, null);

  const second = await tour(db);

  assert.equal(
    db.state.submissions.get(sub.id).status,
    "done",
    "sans la recherche préalable, la fiche du premier essai serait détectée comme doublon et la demande resterait en revue"
  );
  assert.equal(second.review, 0);
  assert.equal(fichesDe(db, SOUMISSION).length, 1);
});

// ---------------------------------------------------------------------------
// Arbitrage des doublons
// ---------------------------------------------------------------------------

test("un prospect existant au même téléphone envoie la demande en revue, sans rien créer", async () => {
  const db = faussebase();
  // Fiche préexistante, saisie à la main : aucun identifiant de soumission.
  db.state.opportunities.push({
    id: uuid("existant"),
    organization_id: ORG,
    phone: "0612345678",
    email: "autre@example.test",
    name: "Camille D.",
    created_at: "2026-10-30T10:00:00.000Z",
    extra: {},
  });
  const sub = db.recevoir(demandeGoogleAds());

  const counts = await tour(db);

  assert.equal(counts.review, 1);
  assert.equal(counts.created, 0);
  assert.equal(fichesDe(db, SOUMISSION).length, 0, "aucune fiche ne doit être créée avant décision humaine");
  assert.equal(db.state.attribution.length, 0);
  assert.equal(db.state.submissions.get(sub.id).status, "review");
});

test("une demande en revue relancée telle quelle repart en revue, elle ne se crée pas d'autorité", async () => {
  const db = faussebase();
  db.state.opportunities.push({
    id: uuid("existant"),
    organization_id: ORG,
    phone: "0612345678",
    email: "",
    name: "Camille D.",
    created_at: "2026-10-30T10:00:00.000Z",
    extra: {},
  });
  const sub = db.recevoir(demandeGoogleAds());

  await tour(db);
  db.state.submissions.get(sub.id).status = "pending";
  await tour(db);

  assert.equal(db.state.submissions.get(sub.id).status, "review");
  assert.equal(db.state.opportunities.length, 1, "la seule fiche est celle qui existait déjà");
});

// ---------------------------------------------------------------------------
// Deux traitements simultanés de la même demande
// ---------------------------------------------------------------------------

test("deux traitements simultanés ne créent qu'une fiche", async () => {
  const db = faussebase();
  const sub = db.recevoir(demandeGoogleAds({ kind: "appointment" }), { kind: "appointment" });
  const reserve = { ...sub, status: "processing", attempts: 1 };
  sub.status = "processing";
  sub.attempts = 1;

  const integrateur = webLeadIntegrator({ request: db.request });

  // Le premier traitement est suspendu juste avant d'écrire la fiche. Il a
  // donc déjà constaté qu'aucune fiche n'existait, exactement comme le second.
  const porte = db.retenir("POST /rest/v1/commercial_opportunities");
  const premier = integrateur.integrate(reserve);
  await porte.arrive;

  // Le second traitement va au bout et gagne la course.
  const resultatSecond = await integrateur.integrate({ ...reserve });
  assert.equal(resultatSecond, "succeeded");

  porte.liberer();
  const resultatPremier = await premier;

  assert.equal(resultatPremier, "succeeded", "le perdant adopte la fiche du gagnant au lieu d'échouer");
  assert.equal(fichesDe(db, SOUMISSION).length, 1, "une seule fiche malgré la course");
  assert.equal(db.state.attribution.length, 1, "un seul contact");
  assert.equal(db.state.appointments.length, 1, "un seul rendez-vous");
  assert.equal(db.state.submissions.get(sub.id).opportunity_id, fichesDe(db, SOUMISSION)[0].id);
});

test("une course sur l'attribution ne duplique aucun contact", async () => {
  const db = faussebase();
  const sub = db.recevoir(demandeGoogleAds());
  sub.status = "processing";
  const reserve = { ...sub, attempts: 1 };

  const integrateur = webLeadIntegrator({ request: db.request });
  const porte = db.retenir("POST /rest/v1/lead_attribution");
  const premier = integrateur.integrate(reserve);
  await porte.arrive;

  // Le second traitement voit la fiche déjà rattachée et écrit le contact.
  await integrateur.integrate({ ...reserve, opportunity_id: fichesDe(db, SOUMISSION)[0].id });

  porte.liberer();
  await premier;

  assert.equal(db.state.attribution.length, 1, "le conflit d'unicité est traité comme un travail déjà fait");
  assert.equal(fichesDe(db, SOUMISSION).length, 1);
});

// ---------------------------------------------------------------------------
// Deux contacts : premier et dernier
// ---------------------------------------------------------------------------

test("une demande à deux contacts enregistre un contact par rôle, une seule fois", async () => {
  const db = faussebase();
  db.recevoir(demandeDeuxContacts());

  db.couperApres("POST /rest/v1/commercial_appointments");
  await tour(db);
  await tour(db);

  const roles = db.state.attribution.map(row => row.touch_role).sort();
  assert.deepEqual(roles, ["dernier", "premier"]);
  assert.equal(db.state.attribution.length, 2, "deux contacts, pas quatre");
  assert.equal(fichesDe(db, SOUMISSION).length, 1);
});

test("la reprise d'une demande à deux contacts n'en réécrit aucun", async () => {
  const db = faussebase();
  const sub = db.recevoir(demandeDeuxContacts());

  db.couperApres("POST /rest/v1/rpc/settle_web_lead");
  await tour(db);
  assert.equal(db.state.attribution.length, 2);

  await tour(db);
  assert.equal(db.state.attribution.length, 2, "les deux contacts sont déjà là, rien à réécrire");
  assert.equal(db.state.submissions.get(sub.id).status, "done");
});

test("un contact unique porte un rôle absent et reste unique à la reprise", async () => {
  const db = faussebase();
  db.recevoir(demandeGoogleAds());

  db.couperApres("POST /rest/v1/rpc/settle_web_lead");
  await tour(db);
  assert.equal(db.state.attribution.length, 1);
  assert.equal(db.state.attribution[0].touch_role, null, "un seul contact ne porte pas de rôle");

  await tour(db);

  // C'est le piège PostgreSQL : NULL n'est jamais égal à NULL, donc un index
  // sur `touch_role` brut aurait laissé passer la seconde ligne. La clé réelle
  // utilise `coalesce(touch_role, '')`, et la lecture compare la même chose.
  assert.equal(db.state.attribution.length, 1, "le rôle absent ne doit pas échapper à l'unicité");
});

// ---------------------------------------------------------------------------
// Garde-fous
// ---------------------------------------------------------------------------

test("une demande dont le contenu a été purgé échoue sans rien créer", async () => {
  const db = faussebase();
  const sub = db.recevoir(demandeGoogleAds());
  db.state.submissions.get(sub.id).payload = null;

  const counts = await tour(db);

  assert.equal(counts.retry, 1);
  assert.equal(db.state.opportunities.length, 0);
  assert.equal(db.state.submissions.get(sub.id).last_error_code, "PAYLOAD_PURGE");
});

test("une panne qui n'est pas un conflit d'unicité n'est jamais avalée", async () => {
  const db = faussebase();
  db.recevoir(demandeGoogleAds());
  db.couperApres("POST /rest/v1/commercial_opportunities");

  const counts = await tour(db);

  assert.equal(counts.created, 0, "une vraie panne doit faire réessayer, pas passer pour un succès");
  assert.equal(counts.retry, 1);
});

test("le conflit d'unicité est reconnu par le code PostgreSQL comme par le statut", () => {
  assert.equal(isUniqueViolation({ code: "23505" }), true);
  assert.equal(isUniqueViolation({ status: 409 }), true);
  assert.equal(isUniqueViolation({ status: 500 }), false);
  assert.equal(isUniqueViolation({ code: "23503" }), false, "une clé étrangère violée n'est pas un doublon");
  assert.equal(isUniqueViolation(null), false);
});

test("l'identifiant de soumission est lu du contenu, et à défaut de la ligne de file", () => {
  assert.equal(submissionKeyOf({ payload: { submissionId: "a-123456789" } }), "a-123456789");
  assert.equal(submissionKeyOf({ submission_id: "b-123456789" }), "b-123456789");
  assert.equal(submissionKeyOf({}), "");
});

test("aucune coordonnée client ne part dans le motif d'échec enregistré", async () => {
  const db = faussebase();
  const sub = db.recevoir(demandeGoogleAds());
  db.couperApres("POST /rest/v1/lead_attribution");

  await tour(db);

  const motif = db.state.submissions.get(sub.id).last_error_code || "";
  assert.ok(motif.length <= 64);
  for (const fuite of ["0612345678", "camille", "Durand", "@example.test"]) {
    assert.equal(
      motif.toLowerCase().includes(fuite.toLowerCase()),
      false,
      `le motif technique ne doit pas citer « ${fuite} »`
    );
  }
});
