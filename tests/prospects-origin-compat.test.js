/**
 * Compatibilité de la taxonomie avec le module Prospects existant.
 *
 * Ce fichier protège trois acquis : les neuf provenances historiques restent
 * toutes rattachables, le miroir écrit dans `source` reste consommable par les
 * écrans actuels, et le mécanisme prospecteur / commercial n’est pas dupliqué.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  PROSPECT_SCOPE_COLUMNS,
  PROSPECT_SOURCES,
  PROSPECT_STAGES,
  prospectorIdOf,
} from "../app/lib/prospects.js";
import { resolveProspectorChoice } from "../app/lib/prospector-choice.js";
import { DEVIS_QUOTE_STATUSES, INVOICE_STATUSES, isLockedDevisStatus } from "../app/lib/devis.js";
import {
  ORIGIN_CATEGORIES,
  RESERVED_SOURCE_VALUES,
  categoryLabel,
  isPerformanceCategory,
  legacySourceToOrigin,
  mirrorSourceLabel,
} from "../app/lib/origin-taxonomy.js";

test("les neuf provenances historiques sont toutes rattachées à une catégorie connue", () => {
  const codes = ORIGIN_CATEGORIES.map(item => item.code);
  assert.equal(PROSPECT_SOURCES.length, 9);
  for (const source of PROSPECT_SOURCES) {
    const mapped = legacySourceToOrigin(source);
    assert.ok(codes.includes(mapped.category), `${source} non rattachée`);
    assert.equal(mapped.reserved, false);
  }
});

test("« Site internet » est la seule provenance historique ambiguë", () => {
  const ambigues = PROSPECT_SOURCES.filter(source => legacySourceToOrigin(source).ambiguous);
  assert.deepEqual(ambigues, ["Site internet"]);
  assert.equal(legacySourceToOrigin("Autre").category, "a_qualifier");
});

test("aucune provenance historique n’est classée publicitaire par la correspondance", () => {
  for (const source of PROSPECT_SOURCES) {
    const { category } = legacySourceToOrigin(source);
    assert.ok(!["google_ads", "meta_ads"].includes(category), `${source} classée ${category}`);
  }
});

/**
 * `app/api/dashboard/prospecting/route.js` agrège sur la valeur brute de
 * `source`. Le miroir doit donc produire une chaîne non vide et distincte par
 * catégorie, sinon deux canaux fusionneraient dans le même seau.
 */
test("le miroir produit un libellé non vide et distinct par catégorie", () => {
  const libelles = ORIGIN_CATEGORIES.map(item => mirrorSourceLabel(item.code, ""));
  for (const libelle of libelles) {
    assert.ok(libelle.length > 0);
  }
  assert.equal(new Set(libelles).size, libelles.length);
});

/**
 * « google » est le marqueur des événements synchronisés depuis Google Calendar
 * (app/lib/agenda.js, app/lib/prospect-assign.js, dashboard/prospecting).
 */
test("aucun libellé de miroir ne heurte le marqueur réservé google", () => {
  for (const item of ORIGIN_CATEGORIES) {
    for (const subtype of ["", ...item.subtypes]) {
      const libelle = mirrorSourceLabel(item.code, subtype).trim().toLowerCase();
      assert.ok(!RESERVED_SOURCE_VALUES.includes(libelle), libelle);
    }
  }
});

test("le miroir n’écrit jamais le code brut dans source", () => {
  for (const item of ORIGIN_CATEGORIES) {
    assert.notEqual(mirrorSourceLabel(item.code, ""), item.code);
    assert.equal(mirrorSourceLabel(item.code, ""), categoryLabel(item.code));
  }
});

test("le prospecteur reste lu depuis extra et n’est pas dupliqué", () => {
  const uuid = "55555555-5555-4555-8555-555555555555";
  assert.equal(prospectorIdOf({ extra: { prospectorId: uuid } }), uuid);
  assert.equal(prospectorIdOf({ extra: { prospector_id: uuid } }), uuid);
  assert.equal(prospectorIdOf({ prospectorId: uuid }), uuid);
  assert.equal(prospectorIdOf({ extra: { prospectorId: "pas-un-uuid" } }), "");
});

test("le périmètre d’accès continue de reposer sur le prospecteur", () => {
  assert.ok(PROSPECT_SCOPE_COLUMNS.includes("extra->>prospectorId"));
  assert.ok(PROSPECT_SCOPE_COLUMNS.includes("commercial_id"));
  assert.ok(PROSPECT_SCOPE_COLUMNS.includes("created_by"));
});

test("prospecteur et commercial restent deux notions distinctes", () => {
  const uuid = "66666666-6666-4666-8666-666666666666";
  assert.deepEqual(resolveProspectorChoice({ prospectorId: uuid }), {
    prospectorId: uuid, prospector: "", other: false,
  });
  assert.deepEqual(resolveProspectorChoice({ prospectorId: "__autre__", prospector: "Stand Leclerc" }), {
    prospectorId: "", prospector: "Stand Leclerc", other: true,
  });
});

test("les étapes de prospect ne sont pas modifiées par la taxonomie", () => {
  assert.ok(PROSPECT_STAGES.includes("Nouveau"));
  assert.ok(PROSPECT_STAGES.includes("Gagné"));
  assert.ok(PROSPECT_STAGES.includes("Perdu"));
});

/**
 * Les trois niveaux de chiffre d’affaires reposent sur des statuts distincts et
 * ne doivent jamais être additionnés. « Accepté » est verrouillé mais le statut
 * reste modifiable seul, donc une vente peut être annulée après coup.
 */
test("les trois niveaux de chiffre d’affaires sont portés par des statuts distincts", () => {
  assert.ok(DEVIS_QUOTE_STATUSES.includes("Accepté"));
  assert.ok(DEVIS_QUOTE_STATUSES.includes("Annulé"));
  assert.ok(INVOICE_STATUSES.includes("Payée"));
  assert.ok(!DEVIS_QUOTE_STATUSES.includes("Payée"));
  assert.equal(isLockedDevisStatus("Accepté"), true);
  assert.equal(isLockedDevisStatus("Payée"), true);
  assert.equal(isLockedDevisStatus("Annulé"), true);
  assert.equal(isLockedDevisStatus("Envoyé"), false);
});

test("une catégorie non performante ne peut pas entrer dans un classement", () => {
  const classables = ORIGIN_CATEGORIES.filter(item => isPerformanceCategory(item.code)).map(item => item.code);
  assert.ok(!classables.includes("a_qualifier"));
  assert.equal(classables.length, 5);
});
