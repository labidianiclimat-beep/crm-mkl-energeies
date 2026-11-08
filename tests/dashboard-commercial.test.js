import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeCommercialDashboard,
  computeCommercialRanking,
  contractsPlacedInPeriod,
  filterDevisByPeriod,
  isDevisARelancer,
  isOrganizationAgency,
  sumContractAmounts,
} from "../app/lib/dashboard-commercial.js";
import { maintenanceTtc } from "../app/lib/entretien-agenda.js";

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

test("classe le rendement commercial par commercial", () => {
  const ranking = computeCommercialRanking({
    commercials: [
      { id: "camille", name: "Camille Martin", role: "Commercial" },
      { id: "karim", name: "Karim Bennani", role: "Commercial" },
      { id: "vip", name: "Admin", role: "Admin VIP" },
    ],
    devis: [
      { kind: "Devis", status: "Accepté", totalTTC: 4000, commercialId: "karim", date: "2026-09-01" },
      { kind: "Devis", status: "Accepté", totalTTC: 1200, commercialId: "camille", date: "2026-09-02" },
      { kind: "Devis", status: "Refusé", totalTTC: 800, commercialId: "camille", date: "2026-09-03" },
      { kind: "Devis", status: "Envoyé", totalTTC: 900, commercialId: "karim", date: "2026-09-10" },
    ],
    prospects: [{ commercialId: "camille" }, { commercial_id: "karim" }],
    appointments: [{ commercial_id: "karim", start: new Date(Date.now() + 86400000).toISOString(), status: "Confirmé" }],
  });
  assert.equal(ranking.length, 2);
  assert.equal(ranking[0].id, "karim");
  assert.equal(ranking[0].caSigne, 4000);
  assert.equal(ranking[0].devisAcceptesCount, 1);
  assert.equal(ranking[1].id, "camille");
  assert.equal(ranking[1].tauxTransformation, 50);
  assert.equal(ranking.some(row => row.id === "vip"), false);
});

test("le tableau de bord affiche le classement d equipe", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/dashboard/commercial/route.js", import.meta.url), "utf8");
  assert.match(page, /Rendement de l’équipe/);
  assert.match(page, /ranking-table/);
  assert.match(api, /computeCommercialRanking/);
});

test("la période maintenance additionne les contrats placés et les visites de la semaine", () => {
  const from = "2026-10-05";
  const to = "2026-10-09";
  const picked = contractsPlacedInPeriod([
    { id: "placed", client_id: "c1", start_on: "2026-10-06", amount: 220 },
    { id: "visit", client_id: "c2", start_on: "2024-03-01", amount: "180,00" },
    { id: "later", client_id: "c3", start_on: "2024-03-01", amount: 90 },
    { id: "empty", client_id: "c4", start_on: "2026-10-06", amount: null },
  ], {
    from,
    to,
    visits: [
      { client_id: "c2", scheduled_start: "2026-10-07T08:00:00", nature_status: "valide", nature_validated: "entretien" },
      { client_id: "c3", scheduled_start: "2026-10-12T08:00:00" },
      { client_id: "c2", scheduled_start: "2026-10-08T08:00:00" },
    ],
  });
  assert.deepEqual(picked.map(row => row.id), ["placed", "visit"]);
  assert.equal(sumContractAmounts(picked), 400);
  const dueNextWeek = contractsPlacedInPeriod([
    { id: "due", client_id: "c9", start_on: "2024-03-01", next_due_on: "2026-10-08", amount: 150 },
    { id: "paper", client_id: "", start_on: "", next: "2026-10-06", amount: 80 },
  ], { from, to, visits: [] });
  assert.deepEqual(dueNextWeek.map(row => row.id), ["due", "paper"]);
  assert.equal(isOrganizationAgency("MKL Énergies"), true);
  assert.equal(isOrganizationAgency("Toutes"), true);
  assert.equal(isOrganizationAgency("Autre société"), false);
  assert.equal(maintenanceTtc(100), 110);
  assert.equal(maintenanceTtc(10.5), 11.55);
  const api = readFileSync(new URL("../app/api/dashboard/commercial/route.js", import.meta.url), "utf8");
  assert.match(api, /contractsPlacedInPeriod/);
  assert.match(api, /isMaintenanceActivity/);
});

test("filters devis by period", () => {
  const rows = [
    { date: "2026-08-01", number: "A" },
    { date: "2026-09-10", number: "B" },
  ];
  assert.equal(filterDevisByPeriod(rows, "2026-09-01", "2026-09-30").length, 1);
});
