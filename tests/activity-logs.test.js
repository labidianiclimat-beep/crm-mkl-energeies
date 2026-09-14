import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_ACTIONS,
  buildActivityLogEntry,
  clientDiff,
  detectDevisSensitiveChanges,
  modulesEqual,
  pickChangedFields,
} from "../app/lib/activity-logs.js";

test("pickChangedFields detects only changed keys", () => {
  const diff = pickChangedFields(
    { a: 1, b: "x", c: null },
    { a: 1, b: "y", c: null },
    ["a", "b", "c"]
  );
  assert.equal(diff.changed, true);
  assert.deepEqual(diff.oldValue, { b: "x" });
  assert.deepEqual(diff.newValue, { b: "y" });
});

test("clientDiff tracks commercial and status", () => {
  const diff = clientDiff(
    { statut: "Prospect", commercial_id: "u1", email: "a@b.c" },
    { statut: "Client", commercial_id: "u2", email: "a@b.c" }
  );
  assert.equal(diff.changed, true);
  assert.equal(diff.newValue.statut, "Client");
  assert.equal(diff.newValue.commercial_id, "u2");
});

test("detectDevisSensitiveChanges flags price discount and validate", () => {
  const result = detectDevisSensitiveChanges(
    { statut: "Envoyé", total_ht: 100, total_ttc: 120, remise_globale_type: "%", remise_globale: 0 },
    { statut: "Accepté", total_ht: 90, total_ttc: 108, remise_globale_type: "%", remise_globale: 10 },
    [{ reference: "A", prix_unitaire_ht: 100, quantite: 1, remise: 0, remise_type: "%", taux_tva: 20, total_ht: 100 }],
    [{ reference: "A", prix_unitaire_ht: 100, quantite: 1, remise: 10, remise_type: "%", taux_tva: 20, total_ht: 90 }]
  );
  assert.equal(result.priceChanged, true);
  assert.equal(result.discountChanged, true);
  assert.equal(result.validated, true);
});

test("buildActivityLogEntry and modulesEqual", () => {
  const row = buildActivityLogEntry({
    organizationId: "org",
    userId: "u",
    action: ACTIVITY_ACTIONS.CLIENT_CREATE,
    module: "Clients",
    entityType: "client",
    entityId: "c1",
  });
  assert.equal(row.organization_id, "org");
  assert.equal(row.action, "client.create");
  assert.equal(modulesEqual(["A", "B"], ["B", "A"]), true);
  assert.equal(modulesEqual(["A"], ["A", "B"]), false);
});
