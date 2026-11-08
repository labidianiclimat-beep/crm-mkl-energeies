/**
 * Chaîne complète d'une demande du site, de la capture au classement.
 *
 * Ce fichier relie les trois morceaux écrits séparément : la capture de
 * provenance côté OVH, le corps signé qui la transporte, et la classification
 * côté CRM. Il existe surtout pour détecter les désalignements de noms de
 * champs entre les deux déploiements, qui ne cassent aucun test isolé mais
 * feraient classer toutes les demandes en « Prospect Site ».
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseAttribution } from "../ovh-site/lib/lead-attribution.mjs";
import { buildCrmPayload } from "../ovh-site/lib/crm-sync.mjs";
import { channelAllowsCategory, classifyWebLead, mirrorSourceLabel } from "../app/lib/origin-taxonomy.js";
import { WEB_LEAD_KINDS, parseWebLeadPayload } from "../app/lib/web-lead-ingest.js";

const OWN_HOST = "www.mkl-energies.fr";

/** Rejoue le trajet : capture sur le site, transport, classement au CRM. */
function chain(formBody, { headerReferer = "", pagePath = "/pompe-a-chaleur.html" } = {}) {
  const attribution = parseAttribution(formBody, { headerReferer, pagePath, ownHost: OWN_HOST });
  const payload = buildCrmPayload(
    { kind: "lead", sourceId: "lead-1" },
    { id: "lead-1", createdAt: "2026-11-04T12:00:00.000Z", name: "Ada", attribution }
  );
  return { attribution: payload.attribution, origin: classifyWebLead(payload.attribution) };
}

/**
 * Les deux déploiements doivent s'accorder sur les valeurs de `kind`. Un
 * renommage d'un seul côté ne casse aucun test isolé : le CRM répondrait 400
 * sur chaque demande et la file du site réessaierait jusqu'à abandon.
 */
test("les types de demande sont les mêmes des deux côtés", () => {
  for (const kind of WEB_LEAD_KINDS) {
    const payload = buildCrmPayload(
      { kind, sourceId: "soumission-0001" },
      { id: "soumission-0001", createdAt: "2026-11-04T12:00:00.000Z", name: "Ada", phone: "0612345678" }
    );
    assert.equal(payload.kind, kind);
    const parsed = parseWebLeadPayload(JSON.stringify(payload));
    assert.equal(parsed.ok, true, `le CRM doit accepter le type ${kind}`);
    assert.equal(parsed.value.kind, kind);
    assert.equal(parsed.value.submissionId, "soumission-0001");
  }
});

test("un type inventé par le site est refusé, pas deviné", () => {
  const payload = buildCrmPayload(
    { kind: "devis", sourceId: "soumission-0002" },
    { id: "soumission-0002", createdAt: "2026-11-04T12:00:00.000Z", name: "Ada", phone: "0612345678" }
  );
  const parsed = parseWebLeadPayload(JSON.stringify(payload));
  assert.equal(parsed.ok, false);
});

test("un clic Google Ads traverse toute la chaîne", () => {
  const { attribution, origin } = chain({
    gclid: "Cj0KCQiA-exemple_de_gclid.123",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "pac-hiver-2026",
  });
  assert.equal(attribution.gclid, "Cj0KCQiA-exemple_de_gclid.123");
  assert.equal(attribution.utm_campaign, "pac-hiver-2026");
  assert.equal(origin.category, "google_ads");
  assert.equal(origin.evidence, "gclid");
  assert.equal(mirrorSourceLabel(origin.category, origin.subtype), "Prospect GG Ads");
});

test("un clic Instagram est distingué de Facebook", () => {
  const { origin } = chain({ fbclid: "IwAR-exemple-de-fbclid", utm_source: "instagram", utm_medium: "paid_social" });
  assert.equal(origin.category, "meta_ads");
  const parUtm = chain({ utm_source: "instagram", utm_medium: "paid_social" }).origin;
  assert.equal(parUtm.subtype, "instagram");
  assert.equal(mirrorSourceLabel(parUtm.category, parUtm.subtype), "Prospect Face · Instagram");
});

test("une demande venue du référencement naturel reste au site", () => {
  const { origin } = chain({ utm_source: "google", utm_medium: "organic" });
  assert.equal(origin.category, "site_web");
  assert.equal(origin.subtype, "seo");
});

/**
 * Le cas le plus courant aujourd'hui : la page n'envoie rien et l'en-tête
 * Referer désigne notre propre domaine.
 */
test("une soumission sans aucune trace devient un accès direct, jamais un référent", () => {
  const { attribution, origin } = chain({}, { headerReferer: `https://${OWN_HOST}/pompe-a-chaleur.html` });
  assert.equal(attribution.referrerHost, undefined, "notre propre domaine ne compte pas comme référent");
  assert.equal(attribution.landingPath, "/pompe-a-chaleur.html", "la page qui a généré la demande reste utile");
  assert.equal(origin.category, "site_web");
  assert.equal(origin.subtype, "direct");
});

test("un vrai site référent est reconnu comme tel", () => {
  const { attribution, origin } = chain({}, { headerReferer: "https://annuaire.example/chauffagistes" });
  assert.equal(attribution.referrerHost, "annuaire.example");
  assert.equal(origin.subtype, "referral");
});

test("aucun trajet ne produit une origine de la famille naturelle", () => {
  const entrees = [
    {},
    { gclid: "Cj0KCQiA-exemple_de_gclid.123" },
    { fbclid: "IwAR-exemple-de-fbclid" },
    { utm_source: "tiktok", utm_medium: "cpc" },
    { utm_medium: "email" },
    { utm_source: "partenaire", utm_medium: "referral" },
  ];
  for (const entree of entrees) {
    const { origin } = chain(entree);
    assert.ok(
      channelAllowsCategory("web_ingest", origin.category),
      `${JSON.stringify(entree)} classé ${origin.category}, interdit pour une demande web`
    );
  }
});

test("aucune coordonnée du formulaire ne fuit dans la provenance", () => {
  const { attribution } = chain({
    gclid: "Cj0KCQiA-exemple_de_gclid.123",
    name: "Ada Lovelace",
    phone: "0612345678",
    email: "ada@example.fr",
    message: "Je souhaite un devis",
  });
  const serialise = JSON.stringify(attribution);
  for (const fuite of ["Ada", "0612345678", "ada@example.fr", "devis"]) {
    assert.ok(!serialise.includes(fuite), `${fuite} ne doit pas figurer dans la provenance`);
  }
});

test("le corps transmis reste lisible même sans provenance", () => {
  const payload = buildCrmPayload(
    { kind: "lead", sourceId: "lead-2" },
    { id: "lead-2", createdAt: "2026-11-04T12:00:00.000Z", name: "Ada", phone: "0612345678" }
  );
  assert.deepEqual(payload.attribution, {});
  assert.equal(payload.submissionId, "lead-2");
  assert.equal(classifyWebLead(payload.attribution).category, "site_web");
});
