import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canAccessWorkspace } from "../app/lib/access-control.js";
import {
  buildCaControl,
  canAccessCaControl,
  canDepositSignedOrder,
  caControlTotals,
  quotesForSignedOrder,
  signatureInstant,
} from "../app/lib/ca-control.js";

const signedAt = "2026-03-15T10:00:00.000Z";

test("le contrôle CA est ouvert au superadmin, à l admin VIP et au responsable", () => {
  assert.equal(canAccessCaControl({ role: "Superadmin" }), true);
  assert.equal(canAccessCaControl({ role: "Super admin" }), true);
  assert.equal(canAccessCaControl({ role: "Admin VIP" }), true);
  assert.equal(canAccessCaControl({ role: "Responsable commercial" }), true);
  assert.equal(canAccessCaControl({ role: "Commercial" }), false);
  assert.equal(canAccessCaControl({ role: "Direction" }), false);
  assert.equal(canAccessCaControl({ role: "Secrétariat" }), false);
  assert.equal(canDepositSignedOrder({ role: "Superadmin" }), true);
  assert.equal(canDepositSignedOrder({ role: "Admin VIP" }), true);
  assert.equal(canDepositSignedOrder({ role: "Responsable commercial" }), false);
  assert.equal(canAccessWorkspace(["Tableau de bord"], "Contrôle CA", { role: "Direction" }), false);
  assert.equal(canAccessWorkspace(["Tableau de bord"], "Contrôle CA", { role: "Responsable commercial" }), true);
});

test("la date de signature est le passage au statut Commande signée", () => {
  const appointment = { id: "rdv-1", start: "2026-03-01T09:00:00.000Z", status: "Commande signée" };
  const instant = signatureInstant(appointment, [
    { appointmentId: "rdv-1", field: "status", newValue: "Client en réflexion", createdAt: "2026-03-10T10:00:00.000Z" },
    { appointmentId: "rdv-1", field: "status", newValue: "Commande signée", createdAt: signedAt },
    { appointmentId: "autre", field: "status", newValue: "Commande signée", createdAt: "2026-04-01T10:00:00.000Z" },
  ]);
  assert.equal(instant, signedAt);
  assert.equal(signatureInstant({ id: "rdv-2", start: "2026-03-01T09:00:00.000Z" }, []), "2026-03-01T09:00:00.000Z");
});

test("une commande signée reprend tous les devis du client, avec leur statut", () => {
  const quotes = [
    { id: "q-old", kind: "Devis", status: "Accepté", number: "DEV-1", clientId: "cli-1", commercialId: "com-1", date: "2026-02-01", totalHT: 1000, totalTTC: 1055 },
    { id: "q-sent", kind: "Devis", status: "Envoyé", number: "DEV-2", clientId: "cli-1", commercialId: "com-1", date: "2026-03-14", totalHT: 50, totalTTC: 60 },
    { id: "q-other", kind: "Devis", status: "Accepté", number: "DEV-9", clientId: "cli-1", commercialId: "com-2", date: "2026-03-12", totalHT: 9000, totalTTC: 9495 },
  ];
  const linked = quotesForSignedOrder(quotes, { clientId: "cli-1", commercialId: "com-1", signedAt });
  assert.deepEqual(linked.map(quote => quote.number), ["DEV-2", "DEV-1"]);
  assert.deepEqual(linked.map(quote => quote.status), ["Envoyé", "Accepté"]);
  const byProspect = quotesForSignedOrder([
    { id: "q-p", kind: "Devis", statut: "À valider", numero_devis: "DEV-3", commercial_id: "com-1", extra: { sourceProspectId: "p-1" }, date_creation: "2026-03-02", total_ht: 2000, total_ttc: 2110 },
  ], { prospectId: "p-1", commercialId: "com-1" });
  assert.equal(byProspect[0].status, "À valider");
  assert.equal(byProspect[0].totalTTC, 2110);
});

test("le tableau compte chaque devis une fois et garde le non déposé dans le CA", () => {
  const built = buildCaControl({
    appointments: [
      { id: "a", status: "Commande signée", prospectId: "p1", prospectName: "Martin", commercialId: "com-1", start: "2026-03-01T09:00:00.000Z", extra: {} },
      { id: "b", status: "Commande signée", prospectId: "p1", prospectName: "Martin", commercialId: "com-1", start: "2026-03-20T09:00:00.000Z", extra: { dossierDepose: true } },
      { id: "c", status: "Non statué", prospectId: "p2", prospectName: "Durand", commercialId: "com-1", start: signedAt },
    ],
    prospects: [{ id: "p1", name: "Martin", clientId: "cli-1" }],
    quotes: [{ id: "q1", kind: "Devis", status: "Accepté", number: "DEV-1", clientId: "cli-1", commercialId: "com-1", date: "2026-03-05", totalHT: 10000, totalTTC: 10550 }],
    history: [
      { appointmentId: "a", field: "status", newValue: "Commande signée", createdAt: "2026-03-12T10:00:00.000Z" },
      { appointmentId: "b", field: "status", newValue: "Commande signée", createdAt: "2026-03-21T10:00:00.000Z" },
    ],
    profiles: [{ id: "com-1", name: "Safae", manager: "Nadia" }],
    from: "2026-03-01",
    to: "2026-03-31",
  });
  assert.equal(built.rows.length, 2);
  assert.equal(built.rows[0].id, "b");
  assert.equal(built.rows[0].deposited, true);
  assert.equal(built.rows[1].deposited, false);
  assert.equal(built.rows[0].quotes[0].number, "DEV-1");
  assert.equal(built.rows[0].quotes[0].status, "Accepté");
  assert.equal(built.rows[1].quotes[0].number, "DEV-1");
  assert.equal(built.totals.quotes, 1);
  assert.equal(built.totals.totalHT, 10000);
  assert.equal(built.totals.totalTTC, 10550);
  assert.equal(built.totals.pendingHT, 10000);
  assert.equal(built.totals.depositedHT, 0);
  assert.equal(built.totals.pendingDossiers, 1);
  assert.equal(built.totals.depositedDossiers, 1);
  const onlyDeposited = buildCaControl({
    appointments: [{ id: "b", status: "Commande signée", prospectId: "p1", commercialId: "com-1", start: signedAt, extra: { dossierDepose: true } }],
    prospects: [{ id: "p1", clientId: "cli-1" }],
    quotes: [{ id: "q1", kind: "Devis", status: "Accepté", clientId: "cli-1", commercialId: "com-1", date: "2026-03-05", totalHT: 10000, totalTTC: 10550 }],
    profiles: [{ id: "com-1", name: "Safae", manager: "Nadia" }],
    deposit: "depose",
    manager: "Nadia",
  });
  assert.equal(onlyDeposited.rows.length, 1);
  assert.equal(caControlTotals(onlyDeposited.rows).depositedTTC, 10550);
});

test("l écran montre les pastilles et réserve le dépôt au superadmin et à l admin VIP", () => {
  const ui = readFileSync(new URL("../app/components/ca-control.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/dashboard/ca-control/route.js", import.meta.url), "utf8");
  const patch = readFileSync(new URL("../app/api/dashboard/ca-control/[id]/route.js", import.meta.url), "utf8");
  assert.match(ui, /Dossier non déposé/);
  assert.match(ui, /Statut/);
  assert.match(ui, /quoteStatusLabel/);
  assert.match(ui, /Dossier déposé/);
  assert.match(ui, /ca-pill/);
  assert.match(ui, /canDeposit/);
  assert.match(css, /\.ca-pill\.is-open\{background:#fde2e2/);
  assert.match(css, /\.ca-pill\.is-done\{background:#dcf5e4/);
  assert.match(page, /Contrôle CA/);
  assert.match(page, /<CaControl /);
  assert.match(route, /canAccessCaControl/);
  assert.match(patch, /canDepositSignedOrder/);
  assert.match(patch, /dossierDepose/);
});
