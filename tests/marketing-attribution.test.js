/**
 * Agrégats par origine : trois niveaux de chiffre d'affaires jamais cumulés,
 * deux modèles d'attribution côte à côte, aucune donnée nominative en sortie.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTRIBUTION_MODELS,
  REVENUE_LEVELS,
  aggregateByOrigin,
  attributionOf,
  compareAttributionModels,
  modelsAgree,
  revenueLevelsOfDocument,
  sortTouches,
  touchesByOpportunity,
} from "../app/lib/marketing-attribution.js";
import { DEVIS_QUOTE_STATUSES, INVOICE_STATUSES } from "../app/lib/devis.js";
import { ORIGIN_CATEGORIES, isPerformanceCategory } from "../app/lib/origin-taxonomy.js";

const ORG = "00000000-0000-0000-0000-000000000001";

function touch(opportunityId, category, touchedAt, extra = {}) {
  return {
    id: `t-${opportunityId}-${touchedAt}`,
    organization_id: ORG,
    opportunity_id: opportunityId,
    touched_at: touchedAt,
    origin_channel: "web_ingest",
    origin_category: category,
    origin_subtype: null,
    ...extra,
  };
}

function prospect(id, overrides = {}) {
  return { id, organization_id: ORG, extra: {}, ...overrides };
}

test("les trois niveaux sont bien trois, et nommés", () => {
  assert.deepEqual(REVENUE_LEVELS, ["devisAcceptes", "ventesConfirmees", "facturesPayees"]);
  assert.deepEqual(ATTRIBUTION_MODELS, ["premier_contact", "dernier_contact"]);
});

test("un devis accepté compte en devis acceptés, pas en vente", () => {
  assert.deepEqual(revenueLevelsOfDocument({ kind: "Devis", status: "Accepté" }), ["devisAcceptes"]);
});

/**
 * Le recouvrement est la raison pour laquelle les trois niveaux ne peuvent pas
 * être additionnés : une facture payée alimente deux niveaux à elle seule.
 */
test("une facture payée alimente deux niveaux à la fois", () => {
  assert.deepEqual(
    revenueLevelsOfDocument({ kind: "Facture", status: "Payée" }),
    ["ventesConfirmees", "facturesPayees"]
  );
});

test("une facture émise est une vente confirmée sans être encaissée", () => {
  assert.deepEqual(revenueLevelsOfDocument({ kind: "Facture", status: "À payer" }), ["ventesConfirmees"]);
  assert.deepEqual(revenueLevelsOfDocument({ kind: "Facture", status: "Envoyée" }), ["ventesConfirmees"]);
});

test("une facture en brouillon ou annulée ne constate aucune vente", () => {
  assert.deepEqual(revenueLevelsOfDocument({ kind: "Facture", status: "Brouillon" }), []);
  assert.deepEqual(revenueLevelsOfDocument({ kind: "Facture", status: "Annulé" }), []);
});

test("aucun statut de devis autre qu'Accepté ne compte", () => {
  for (const status of DEVIS_QUOTE_STATUSES.filter(item => item !== "Accepté")) {
    assert.deepEqual(revenueLevelsOfDocument({ kind: "Devis", status }), [], status);
  }
});

test("un pro forma ne constate rien", () => {
  for (const status of INVOICE_STATUSES) {
    assert.deepEqual(revenueLevelsOfDocument({ kind: "Pro forma", status }), [], status);
  }
});

test("le tri des contacts est déterministe à heure égale", () => {
  const a = { id: "b", touched_at: "2026-03-01T10:00:00Z" };
  const b = { id: "a", touched_at: "2026-03-01T10:00:00Z" };
  assert.deepEqual(sortTouches([a, b]).map(item => item.id), ["a", "b"]);
  assert.deepEqual(sortTouches([b, a]).map(item => item.id), ["a", "b"]);
});

test("premier et dernier contact sortent de la chronologie", () => {
  const rows = [
    touch("p1", "site_web", "2026-03-10T10:00:00Z"),
    touch("p1", "google_ads", "2026-01-05T10:00:00Z"),
    touch("p1", "meta_ads", "2026-02-07T10:00:00Z"),
  ];
  const attribution = attributionOf(prospect("p1"), rows);
  assert.equal(attribution.premier_contact.category, "google_ads");
  assert.equal(attribution.dernier_contact.category, "site_web");
  assert.equal(attribution.touchCount, 3);
  assert.equal(modelsAgree(attribution), false);
});

/**
 * Les fiches saisies à la main et tout l'historique n'ont aucune ligne de
 * contact. L'origine de la fiche doit alors tenir lieu de contact unique,
 * sinon ces prospects disparaîtraient des comparaisons.
 */
test("sans ligne de contact, l'origine de la fiche sert de contact unique", () => {
  const fiche = prospect("p2", {
    origin_channel: "crm_manual",
    origin_category: "prospection",
    origin_subtype: "porte_a_porte",
    origin_set_at: "2026-02-01T09:00:00Z",
    extra: { prospectorId: "u-1" },
  });
  const attribution = attributionOf(fiche, []);
  assert.equal(attribution.premier_contact.category, "prospection");
  assert.equal(attribution.dernier_contact.category, "prospection");
  assert.equal(attribution.premier_contact.prospectorId, "u-1");
  assert.equal(attribution.touchCount, 0);
  assert.equal(modelsAgree(attribution), true);
});

test("une fiche sans origine du tout n'est attribuée à personne", () => {
  const attribution = attributionOf(prospect("p3"), []);
  assert.equal(attribution.premier_contact, null);
  assert.equal(attribution.dernier_contact, null);
});

test("les contacts sont regroupés par opportunité", () => {
  const map = touchesByOpportunity([
    touch("p1", "google_ads", "2026-01-01T10:00:00Z"),
    touch("p2", "meta_ads", "2026-01-02T10:00:00Z"),
    touch("p1", "site_web", "2026-01-03T10:00:00Z"),
  ]);
  assert.equal(map.get("p1").length, 2);
  assert.equal(map.get("p2").length, 1);
  assert.equal(map.get("p1")[0].origin_category, "google_ads");
});

test("une ligne sans opportunité est ignorée plutôt que rattachée au hasard", () => {
  const map = touchesByOpportunity([{ id: "x", touched_at: "2026-01-01T10:00:00Z" }]);
  assert.equal(map.size, 0);
});

/** Le même jeu de données donne deux classements différents selon le modèle. */
test("les deux modèles créditent des canaux différents", () => {
  const input = {
    prospects: [prospect("p1", { clientId: "c1" })],
    attributions: [
      touch("p1", "google_ads", "2026-01-05T10:00:00Z"),
      touch("p1", "site_web", "2026-03-10T10:00:00Z"),
    ],
    documents: [{ kind: "Facture", status: "Payée", clientId: "c1", amount: 1000, totalTTC: 1100 }],
  };
  const { premier_contact: premier, dernier_contact: dernier } = compareAttributionModels(input);
  assert.equal(premier.length, 1);
  assert.equal(premier[0].key, "google_ads");
  assert.equal(premier[0].facturesPayees.ht, 1000);
  assert.equal(dernier[0].key, "site_web");
  assert.equal(dernier[0].facturesPayees.ht, 1000);
});

test("un modèle inconnu est refusé plutôt que silencieusement remplacé", () => {
  assert.throws(() => aggregateByOrigin({ model: "milieu" }), /Modèle d'attribution inconnu/);
});

/**
 * Les devis sont rattachés à un client, pas à une fiche. Un document dont le
 * client ne vient d'aucune fiche connue doit rester visible : l'escamoter
 * gonflerait la part du chiffre d'affaires attribuée à la publicité.
 */
test("le chiffre d'affaires sans origine connue reste visible", () => {
  const rows = aggregateByOrigin({
    prospects: [prospect("p1", { origin_channel: "web_ingest", origin_category: "google_ads" })],
    documents: [{ kind: "Facture", status: "Payée", clientId: "inconnu", amount: 5000, totalTTC: 5500 }],
  });
  const orphan = rows.find(row => row.key === "non_attribue");
  assert.ok(orphan, "le seau non attribué doit exister");
  assert.equal(orphan.facturesPayees.ht, 5000);
  assert.equal(orphan.performance, false);
  const ads = rows.find(row => row.key === "google_ads");
  assert.equal(ads.facturesPayees.ht, 0);
});

test("le seau non attribué disparaît quand il est vide", () => {
  const rows = aggregateByOrigin({
    prospects: [prospect("p1", { origin_channel: "web_ingest", origin_category: "google_ads" })],
  });
  assert.equal(rows.find(row => row.key === "non_attribue"), undefined);
});

test("le centre d'appels est mesuré à part des prospecteurs terrain", () => {
  const rows = aggregateByOrigin({
    prospects: [
      prospect("p1", {
        origin_channel: "crm_manual",
        origin_category: "prospection",
        origin_subtype: "centre_appels",
      }),
      prospect("p2", {
        origin_channel: "crm_manual",
        origin_category: "prospection",
        origin_subtype: "porte_a_porte",
        extra: { prospectorId: "u-9" },
      }),
    ],
    prospectorLabels: { "u-9": "Prospecteur 9" },
  });
  const keys = rows.map(row => row.key).sort();
  assert.deepEqual(keys, ["prospecteur:u-9", "prospection:centre_appels"]);
  assert.equal(rows.find(row => row.key === "prospecteur:u-9").label, "Prospecteur 9");
});

test("À qualifier n'entre pas dans les classements de performance", () => {
  const rows = aggregateByOrigin({
    prospects: [prospect("p1", { origin_channel: "web_ingest", origin_category: "a_qualifier" })],
  });
  assert.equal(rows[0].key, "a_qualifier");
  assert.equal(rows[0].performance, false);
  assert.equal(isPerformanceCategory("a_qualifier"), false);
});

test("chaque catégorie connue produit un seau exploitable", () => {
  for (const definition of ORIGIN_CATEGORIES) {
    const rows = aggregateByOrigin({
      // Le canal est pris dans la définition : une paire invalide ne pourrait
      // pas exister en base, le test ne doit donc pas en fabriquer une.
      prospects: [prospect("p1", {
        origin_category: definition.code,
        origin_channel: definition.channels[0],
      })],
    });
    assert.equal(rows.length, 1, definition.code);
    assert.ok(rows[0].label, `${definition.code} doit avoir un libellé`);
    assert.equal(rows[0].performance, Boolean(definition.performance), definition.code);
  }
});

test("un taux sans prospect vaut null et non zéro", () => {
  const rows = aggregateByOrigin({
    documents: [{ kind: "Facture", status: "Payée", clientId: "x", amount: 100, totalTTC: 120 }],
  });
  const orphan = rows.find(row => row.key === "non_attribue");
  assert.equal(orphan.conversionRate, null);
  assert.equal(orphan.appointmentRate, null);
});

test("les taux se calculent sur les prospects du seau", () => {
  const rows = aggregateByOrigin({
    prospects: [
      prospect("p1", { origin_category: "google_ads", origin_channel: "web_ingest", clientId: "c1" }),
      prospect("p2", { origin_category: "google_ads", origin_channel: "web_ingest" }),
      prospect("p3", { origin_category: "google_ads", origin_channel: "web_ingest" }),
      prospect("p4", { origin_category: "google_ads", origin_channel: "web_ingest" }),
    ],
    appointments: [{ prospectId: "p1" }, { prospectId: "p2" }],
    documents: [{ kind: "Facture", status: "À payer", clientId: "c1", amount: 2000, totalTTC: 2400 }],
  });
  const ads = rows.find(row => row.key === "google_ads");
  assert.equal(ads.prospects, 4);
  assert.equal(ads.appointments, 2);
  assert.equal(ads.appointmentRate, 50);
  assert.equal(ads.conversionRate, 25);
  assert.equal(ads.ventesConfirmees.count, 1);
  assert.equal(ads.facturesPayees.count, 0);
});

test("un rendez-vous d'une fiche inconnue ne gonfle pas un canal", () => {
  const rows = aggregateByOrigin({
    prospects: [prospect("p1", { origin_category: "google_ads", origin_channel: "web_ingest" })],
    appointments: [{ prospectId: "p1" }, { prospectId: "fantome" }],
  });
  assert.equal(rows.find(row => row.key === "google_ads").appointments, 1);
  assert.equal(rows.find(row => row.key === "non_attribue").appointments, 1);
});

test("les montants sont arrondis au centime", () => {
  const rows = aggregateByOrigin({
    prospects: [prospect("p1", { origin_category: "google_ads", origin_channel: "web_ingest", clientId: "c1" })],
    documents: [
      { kind: "Facture", status: "Payée", clientId: "c1", amount: 10.005, totalTTC: 12.004 },
      { kind: "Facture", status: "Payée", clientId: "c1", amount: 0.1, totalTTC: 0.2 },
    ],
  });
  const ads = rows.find(row => row.key === "google_ads");
  assert.equal(ads.facturesPayees.ht, 10.11);
  assert.equal(ads.facturesPayees.ttc, 12.2);
});

/** Contrainte explicite : agrégats seulement, jamais de coordonnées. */
test("la sortie ne contient aucune donnée nominative", () => {
  const rows = aggregateByOrigin({
    prospects: [prospect("p1", {
      origin_category: "google_ads",
      origin_channel: "web_ingest",
      clientId: "c1",
      name: "Jean Dupont",
      phone: "0612345678",
      email: "jean@example.test",
    })],
    documents: [{ kind: "Facture", status: "Payée", clientId: "c1", client: "Jean Dupont", amount: 1, totalTTC: 1 }],
  });
  const dump = JSON.stringify(rows);
  for (const leak of ["Jean", "Dupont", "0612345678", "example.test", "c1", "p1"]) {
    assert.equal(dump.includes(leak), false, `la sortie ne doit pas contenir ${leak}`);
  }
  const allowed = new Set([
    "key", "label", "prospects", "appointments", "performance",
    "appointmentRate", "conversionRate", ...REVENUE_LEVELS,
  ]);
  for (const row of rows) {
    for (const field of Object.keys(row)) {
      assert.ok(allowed.has(field), `champ inattendu en sortie : ${field}`);
    }
  }
});

test("le classement place le canal le plus volumineux en tête", () => {
  const rows = aggregateByOrigin({
    prospects: [
      prospect("p1", { origin_category: "meta_ads", origin_channel: "web_ingest" }),
      prospect("p2", { origin_category: "google_ads", origin_channel: "web_ingest" }),
      prospect("p3", { origin_category: "google_ads", origin_channel: "web_ingest" }),
    ],
  });
  assert.equal(rows[0].key, "google_ads");
  assert.equal(rows[1].key, "meta_ads");
});
