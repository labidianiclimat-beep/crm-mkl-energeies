import test from "node:test";
import assert from "node:assert/strict";
import {
  computeCommercialDashboard,
  filterDevisByPeriod,
  isDevisARelancer,
} from "../app/lib/dashboard-commercial.js";

test("flags devis à relancer", () => {
  const old = {
    kind: "Devis",
    status: "Envoyé",
    date: new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10),
  };
  assert.equal(isDevisARelancer(old), true);
  assert.equal(isDevisARelancer({ kind: "Devis", status: "À relancer", date: "2026-09-01" }), true);
  assert.equal(isDevisARelancer({ kind: "Devis", status: "Accepté", date: "2026-01-01" }), false);
});

test("computes signed CA and conversion rate", () => {
  const metrics = computeCommercialDashboard({
    devis: [
      { kind: "Devis", status: "Accepté", totalTTC: 1000, client: "A", number: "DEV-1", date: "2026-09-01" },
      { kind: "Devis", status: "Refusé", totalTTC: 500, client: "B", number: "DEV-2", date: "2026-09-02" },
      { kind: "Devis", status: "Envoyé", totalTTC: 800, client: "C", number: "DEV-3", date: "2026-09-10" },
    ],
    clients: [{ status: "Prospect" }, { status: "Client" }],
    appointments: [{ start: new Date(Date.now() + 86400000).toISOString(), prospectName: "RDV", status: "Confirmé" }],
  });
  assert.equal(metrics.devisAcceptesCount, 1);
  assert.equal(metrics.caSigne, 1000);
  assert.equal(metrics.tauxTransformation, 50);
  assert.equal(metrics.upcomingAppointmentsCount, 1);
  assert.ok(metrics.prochainesActions.length >= 1);
});

test("filters devis by period", () => {
  const rows = [
    { date: "2026-08-01", number: "A" },
    { date: "2026-09-10", number: "B" },
  ];
  assert.equal(filterDevisByPeriod(rows, "2026-09-01", "2026-09-30").length, 1);
});
