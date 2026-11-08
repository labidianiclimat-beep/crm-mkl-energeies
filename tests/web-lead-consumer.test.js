/**
 * Intégration d'une demande du site dans le module Prospects.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WEB_LEAD_CHANNEL,
  WEB_LEAD_EVIDENCE,
  appointmentRowFromWebLead,
  attributionTouchFromWebLead,
  planWebLeadIntegration,
  prospectRowFromWebLead,
  webLeadOrigin,
  webLeadProspectInput,
} from "../app/lib/web-lead-consumer.js";
import { PROSPECT_SOURCES, prospectorIdOf } from "../app/lib/prospects.js";
import { channelAllowsCategory, classifyWebLead } from "../app/lib/origin-taxonomy.js";

const ORG = "00000000-0000-0000-0000-000000000001";
const NOW = new Date("2026-11-04T12:00:00.000Z");

function demande(overrides = {}) {
  return {
    submissionId: "11111111-1111-4111-8111-111111111111",
    kind: "lead",
    receivedAt: "2026-11-04T11:00:00.000Z",
    intent: "devis",
    projects: ["Pompe à chaleur"],
    postalCode: "67000",
    housing: "maison",
    firstName: "Ada",
    lastName: "Lovelace",
    name: "Ada Lovelace",
    phone: "0612345678",
    email: "ADA@Example.FR",
    message: "Je souhaite un devis",
    attribution: {},
    ...overrides,
  };
}

test("une demande du site reste dans le canal web", () => {
  const origin = webLeadOrigin(demande({ attribution: { gclid: "Cj0-exemple-de-gclid" } }));
  assert.equal(origin.channel, WEB_LEAD_CHANNEL);
  assert.equal(origin.category, "google_ads");
  assert.equal(origin.evidence, "gclid");
});

test("aucune demande du site ne peut devenir une prospection terrain", () => {
  const attributions = [
    {},
    { gclid: "Cj0-exemple-de-gclid" },
    { fbclid: "IwAR-exemple-de-fbclid" },
    { utm_source: "tiktok", utm_medium: "cpc" },
    { utm_medium: "email" },
    { referrerHost: "annuaire.example" },
  ];
  for (const attribution of attributions) {
    const origin = webLeadOrigin(demande({ attribution }));
    assert.equal(origin.channel, WEB_LEAD_CHANNEL);
    assert.ok(
      channelAllowsCategory(WEB_LEAD_CHANNEL, origin.category),
      `${JSON.stringify(attribution)} classé ${origin.category}`
    );
  }
});

test("un rappel demandé en ligne reste un prospect du site", () => {
  const origin = webLeadOrigin(demande({ intent: "rappel" }));
  assert.notEqual(origin.category, "entrant");
  assert.notEqual(origin.category, "prospection");
  assert.equal(origin.category, "site_web");
});

test("la fiche créée a la forme d’une fiche saisie à la main", () => {
  const row = prospectRowFromWebLead({ payload: demande(), organizationId: ORG, now: NOW });
  assert.equal(row.organization_id, ORG);
  assert.equal(row.name, "Ada Lovelace");
  assert.equal(row.phone, "0612345678");
  assert.equal(row.email, "ada@example.fr");
  assert.equal(row.stage, "Nouveau");
  assert.equal(row.project_type, "Pompe à chaleur");
  assert.equal(row.extra.postalCode, "67000");
  assert.equal(row.extra.firstName, "Ada");
});

test("la colonne source reçoit un libellé lisible, jamais un code", () => {
  const row = prospectRowFromWebLead({ payload: demande(), organizationId: ORG, now: NOW });
  assert.equal(row.source, "Prospect Site · Accès direct");
  const ads = prospectRowFromWebLead({
    payload: demande({ attribution: { gclid: "Cj0-exemple-de-gclid" } }),
    organizationId: ORG,
    now: NOW,
  });
  assert.equal(ads.source, "Prospect GG Ads");
  assert.notEqual(ads.source, "google_ads");
  assert.notEqual(String(ads.source).toLowerCase(), "google");
});

test("les colonnes d’origine accompagnent la fiche", () => {
  const row = prospectRowFromWebLead({
    payload: demande({ attribution: { fbclid: "IwAR-exemple-de-fbclid" } }),
    organizationId: ORG,
    now: NOW,
  });
  assert.equal(row.origin_channel, "web_ingest");
  assert.equal(row.origin_category, "meta_ads");
  assert.equal(row.origin_subtype, null);
  assert.equal(row.origin_set_at, NOW.toISOString());
});

/**
 * Une demande du site n'est affectée par personne : elle doit passer par le
 * dispatch, comme un prospect non attribué.
 */
test("la fiche n’est ni affectée à un commercial ni créditée à un prospecteur", () => {
  const row = prospectRowFromWebLead({ payload: demande(), organizationId: ORG, now: NOW });
  assert.equal(row.commercial_id, null);
  assert.equal(row.created_by, null);
  assert.equal(prospectorIdOf(row), "");
  assert.equal(row.extra.prospector, "");
});

test("l’identifiant de soumission reste attaché à la fiche", () => {
  const row = prospectRowFromWebLead({ payload: demande(), organizationId: ORG, now: NOW });
  assert.equal(row.extra.webLead.submissionId, "11111111-1111-4111-8111-111111111111");
});

/** `extra.source` vaut `google` pour les événements importés de Google Calendar. */
test("la fiche ne pose jamais le marqueur réservé google dans extra", () => {
  const row = prospectRowFromWebLead({
    payload: demande({ attribution: { gclid: "Cj0-exemple-de-gclid" } }),
    organizationId: ORG,
    now: NOW,
  });
  assert.equal(row.extra.source, undefined);
});

test("le libellé miroir ne se confond avec aucune provenance historique", () => {
  const labels = [
    prospectRowFromWebLead({ payload: demande(), organizationId: ORG, now: NOW }).source,
    prospectRowFromWebLead({
      payload: demande({ attribution: { gclid: "Cj0-exemple" } }),
      organizationId: ORG,
      now: NOW,
    }).source,
  ];
  for (const label of labels) {
    assert.ok(!PROSPECT_SOURCES.includes(label), `${label} entre en collision avec une provenance existante`);
  }
});

test("un rendez-vous en ligne est posé à l’heure française", () => {
  const row = appointmentRowFromWebLead({
    payload: demande({ kind: "appointment", date: "2026-11-10", time: "09:00" }),
    organizationId: ORG,
    opportunityId: "22222222-2222-4222-8222-222222222222",
  });
  assert.equal(row.starts_at, "2026-11-10T08:00:00.000Z", "novembre est en heure d’hiver, décalage +1");
  assert.equal(row.opportunity_id, "22222222-2222-4222-8222-222222222222");
  assert.equal(row.duration_minutes, 60);
});

test("un rendez-vous d’été tient compte du changement d’heure", () => {
  const row = appointmentRowFromWebLead({
    payload: demande({ kind: "appointment", date: "2026-07-10", time: "09:00" }),
    organizationId: ORG,
    opportunityId: "22222222-2222-4222-8222-222222222222",
  });
  assert.equal(row.starts_at, "2026-07-10T07:00:00.000Z", "juillet est en heure d’été, décalage +2");
});

test("un rendez-vous sans date exploitable n’est pas posé au hasard", () => {
  assert.equal(
    appointmentRowFromWebLead({ payload: demande({ kind: "appointment" }), organizationId: ORG, opportunityId: "x" }),
    null
  );
});

test("le contact publicitaire est enregistré avec sa preuve", () => {
  const touch = attributionTouchFromWebLead({
    payload: demande({
      attribution: {
        gclid: "Cj0-exemple-de-gclid",
        utm_campaign: "pac-hiver-2026",
        utm_term: "pompe a chaleur strasbourg",
        utm_content: "annonce-b",
        landingPath: "/pompe-a-chaleur.html",
      },
    }),
    organizationId: ORG,
    opportunityId: "22222222-2222-4222-8222-222222222222",
    now: NOW,
  });
  assert.equal(touch.origin_category, "google_ads");
  assert.equal(touch.click_kind, "gclid");
  assert.equal(touch.click_id, "Cj0-exemple-de-gclid");
  assert.equal(touch.campaign_name, "pac-hiver-2026");
  assert.equal(touch.keyword, "pompe a chaleur strasbourg");
  assert.equal(touch.adset_name, "annonce-b");
  assert.equal(touch.landing_path, "/pompe-a-chaleur.html");
  assert.equal(touch.prospector_id, null, "aucun prospecteur n’est crédité d’un contact publicitaire");
  assert.equal(touch.touched_at, "2026-11-04T11:00:00.000Z");
});

test("un contact sans trace ne prétend pas en avoir", () => {
  const touch = attributionTouchFromWebLead({
    payload: demande(),
    organizationId: ORG,
    opportunityId: "22222222-2222-4222-8222-222222222222",
    now: NOW,
  });
  assert.equal(touch.click_kind, null);
  assert.equal(touch.click_id, null);
  assert.equal(touch.campaign_name, null);
  assert.equal(touch.origin_category, "site_web");
});

/** La contrainte SQL n'accepte qu'une liste finie de preuves. */
test("toute preuve produite par la classification est acceptable en base", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261102_lead_attribution.sql", import.meta.url), "utf8");
  const bloc = sql.slice(sql.indexOf("lead_attribution_evidence_chk"));
  const autorisees = (bloc.slice(0, bloc.indexOf(")")).match(/'([a-z_]*)'/g) || [])
    .map(item => item.replace(/'/g, ""));
  for (const evidence of WEB_LEAD_EVIDENCE) {
    assert.ok(autorisees.includes(evidence), `${evidence} refusé par la contrainte SQL`);
  }
  const attributions = [{}, { gclid: "x" }, { fbclid: "x" }, { utm_source: "tiktok", utm_medium: "cpc" }, { utm_medium: "email" }, { referrerHost: "a.example" }];
  for (const attribution of attributions) {
    const { evidence } = classifyWebLead(attribution);
    assert.ok(autorisees.includes(evidence), `${evidence} refusé par la contrainte SQL`);
  }
});

const recent = "2026-10-20T10:00:00.000Z";

test("une demande sans correspondance est créée", () => {
  const plan = planWebLeadIntegration({ payload: demande(), candidates: [], now: NOW });
  assert.equal(plan.outcome, "succeeded");
  assert.equal(plan.decision, "new");
  assert.deepEqual(plan.candidateIds, []);
});

test("un doublon probable part en revue et ne crée rien", () => {
  const plan = planWebLeadIntegration({
    payload: demande(),
    candidates: [{ id: "p-1", phone: "0612345678", createdAt: recent }],
    now: NOW,
  });
  assert.equal(plan.outcome, "review");
  assert.deepEqual(plan.candidateIds, ["p-1"]);
});

test("un numéro de standard partagé n’empêche pas la création", () => {
  const candidates = ["p-1", "p-2", "p-3", "p-4", "p-5"].map(id => ({
    id, phone: "0388000000", createdAt: recent,
  }));
  const plan = planWebLeadIntegration({
    payload: demande({ phone: "0388000000" }),
    candidates,
    now: NOW,
  });
  assert.equal(plan.outcome, "succeeded");
  assert.deepEqual(plan.candidateIds, []);
});

test("aucun scénario ne produit de fusion", () => {
  const scenarios = [
    [],
    [{ id: "p-1", phone: "0612345678", createdAt: recent }],
    [{ id: "p-2", email: "ada@example.fr", createdAt: recent }],
  ];
  for (const candidates of scenarios) {
    const plan = planWebLeadIntegration({ payload: demande(), candidates, now: NOW });
    assert.ok(["succeeded", "review"].includes(plan.outcome));
    assert.notEqual(plan.decision, "merge");
  }
});

test("l’entrée du mappeur ne porte aucune affectation implicite", () => {
  const input = webLeadProspectInput(demande());
  assert.equal(input.commercialId, undefined);
  assert.equal(input.prospectorId, undefined);
  assert.equal(input.stage, "Nouveau");
});
