import test from "node:test";
import assert from "node:assert/strict";
import {
  computeDocumentTotals,
  formToDevisRecord,
  formatDevisNumber,
  historyToUi,
  isLockedDevisStatus,
  statusesForKind,
  statusTone,
  validateDevisPayload,
} from "../app/lib/devis.js";

test("computes line and document totals with discounts", () => {
  const totals = computeDocumentTotals({
    tax: 20,
    globalDiscountType: "percent",
    globalDiscountValue: 10,
    items: [{ name: "Panneau", qty: 2, unit: 100, tax: 20, discountType: "percent", discountValue: 0 }],
  });
  assert.equal(Math.round(totals.beforeGlobalTTC), 240);
  assert.equal(Math.round(totals.totalTTC), 216);
});

test("requires client and lines", () => {
  const { header, lines } = formToDevisRecord({
    kind: "Devis",
    status: "Brouillon",
    date: "2026-09-13",
    items: [],
  });
  const errors = validateDevisPayload(header, lines);
  assert.ok(errors.some(error => /client/i.test(error)));
  assert.ok(errors.some(error => /ligne/i.test(error)));
});

test("snapshots article fields into lignes", () => {
  const { header, lines } = formToDevisRecord({
    kind: "Devis",
    status: "Brouillon",
    date: "2026-09-13",
    clientId: "c1",
    client: "Client Test",
    tax: 20,
    items: [
      {
        articleId: "11111111-1111-4111-8111-111111111111",
        code: "PV-450W",
        name: "Panneau 450 W",
        description: "Mono",
        qty: 10,
        unit: 189,
        tax: 20,
        category: "Photovoltaïque",
      },
    ],
  });
  assert.equal(validateDevisPayload(header, lines).length, 0);
  assert.equal(lines[0].article_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(lines[0].reference, "PV-450W");
  assert.equal(lines[0].designation, "Panneau 450 W");
  assert.ok(lines[0].total_ttc > 0);
  assert.ok(header.total_ttc > 0);
});

test("ignores non-uuid article ids in snapshots", () => {
  const { lines } = formToDevisRecord({
    kind: "Devis",
    status: "Brouillon",
    date: "2026-09-13",
    clientId: "c1",
    client: "Client Test",
    items: [{ articleId: "local-1", code: "X", name: "Test", qty: 1, unit: 10, tax: 20 }],
  });
  assert.equal(lines[0].article_id, null);
  assert.equal(lines[0].reference, "X");
});

test("formats devis numbers with 6 digits", () => {
  assert.equal(formatDevisNumber("DEV", 2026, 1), "DEV-2026-000001");
  assert.equal(formatDevisNumber("DEV", 2026, 42), "DEV-2026-000042");
});

test("accepted devis status is locked", () => {
  assert.equal(isLockedDevisStatus("Accepté"), true);
  assert.equal(isLockedDevisStatus("Brouillon"), false);
});

test("quote statuses follow étape 7 workflow", () => {
  const statuses = statusesForKind("Devis");
  assert.deepEqual(statuses, [
    "Brouillon",
    "À valider",
    "Envoyé",
    "À relancer",
    "Accepté",
    "Refusé",
    "Expiré",
    "Annulé",
  ]);
  assert.equal(statusTone("Accepté"), "ok");
  assert.equal(statusTone("Refusé"), "bad");
  assert.equal(statusTone("À relancer"), "wait");
});

test("rejects invoice status on devis", () => {
  const { header, lines } = formToDevisRecord({
    kind: "Devis",
    status: "Payée",
    date: "2026-09-13",
    clientId: "c1",
    client: "Client Test",
    items: [{ name: "Ligne", qty: 1, unit: 10, tax: 20 }],
  });
  const errors = validateDevisPayload(header, lines);
  assert.ok(errors.some(error => /statut/i.test(error)));
});

test("maps history rows to ui", () => {
  const entry = historyToUi({
    id: "h1",
    devis_id: "d1",
    ancien_statut: "Envoyé",
    nouveau_statut: "À relancer",
    utilisateur_id: "u1",
    date: "2026-09-13T10:00:00Z",
    commentaire: "Relance téléphonique",
  });
  assert.equal(entry.from, "Envoyé");
  assert.equal(entry.to, "À relancer");
  assert.equal(entry.comment, "Relance téléphonique");
});
