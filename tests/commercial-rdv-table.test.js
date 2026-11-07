import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  allowedRdvStatusesFor,
  canApplyRdvStatus,
  canSignCommercialOrder,
  canStatuerAppointment,
  isAppointmentOutcomeOnlyPatch,
  normalizeAgendaStatus,
} from "../app/lib/appointment-status.js";
import { formToAppointmentRecord } from "../app/lib/prospects.js";
import {
  appointmentsForClient,
  buildCommercialRdvTable,
  isCommercialRdvRow,
  resolveRdvClient,
} from "../app/lib/commercial-rdv-table.js";

const start = "2026-09-25T18:00:00.000Z";

test("les anciens statuts agenda se lisent comme iCollect", () => {
  assert.equal(normalizeAgendaStatus("Planifié"), "Non statué");
  assert.equal(normalizeAgendaStatus("Absence du prospect"), "Client absent");
  assert.equal(normalizeAgendaStatus("Annulé"), "RDV annulé définitivement");
  assert.equal(normalizeAgendaStatus("Reporté"), "RDV à repositionner");
  assert.equal(normalizeAgendaStatus("Commande signée"), "Commande signée");
});

test("le tableau reprend les rendez-vous existants sans doublon ni event Google", () => {
  const appointments = [
    { id: "rdv-1", prospectId: "p1", prospectName: "HA101", start, duration: 120, status: "Planifié", commercial: "Safae", city: "Battenheim" },
    { id: "rdv-1", prospectId: "p1", prospectName: "HA101 copie", start, duration: 120, status: "Planifié" },
    { id: "g1", source: "google", prospectName: "Google", start, duration: 60, status: "Planifié" },
    { id: "busy", kind: "busy", private: true, prospectName: "Occupé", start, duration: 60, status: "Planifié" },
  ];
  const prospects = [{ id: "p1", name: "HA101", postalCode: "68390", city: "Battenheim", phone: "0642853311", prospector: "Nadia", prospectorId: "pr1" }];
  const table = buildCommercialRdvTable(appointments, prospects, { pageSize: 100 });
  assert.equal(table.total, 1);
  assert.equal(table.rows[0].id, "rdv-1");
  assert.equal(table.rows[0].status, "Non statué");
  assert.equal(table.rows[0].postalCode, "68390");
  assert.equal(table.rows[0].phone, "0642853311");
  assert.equal(table.rows[0].partyType, "Prospect");
  assert.equal(table.rows[0].prospector, "Nadia");
  const byProspector = buildCommercialRdvTable(appointments, prospects, { prospectorId: "pr1", pageSize: 100 });
  assert.equal(byProspector.total, 1);
  assert.equal(isCommercialRdvRow(appointments[2]), false);
});

test("le tableau se filtre par commercial sans creer de doublon", () => {
  const appointments = [
    { id: "a", prospectName: "A", start, duration: 60, status: "Planifié", commercialId: "c1", commercial: "Safae" },
    { id: "b", prospectName: "B", start, duration: 60, status: "Planifié", commercialId: "c2", commercial: "Karim" },
    { id: "c", prospectName: "C", start, duration: 60, status: "Planifié" },
  ];
  const commercials = [{ id: "c1", name: "Safae" }, { id: "c2", name: "Karim" }];
  const safae = buildCommercialRdvTable(appointments, [], { commercialId: "c1", commercials });
  assert.equal(safae.total, 1);
  assert.equal(safae.rows[0].id, "a");
  assert.equal(safae.commercials.length, 2);
  const free = buildCommercialRdvTable(appointments, [], { commercialId: "unassigned", commercials });
  assert.equal(free.total, 1);
  assert.equal(free.rows[0].id, "c");
  const ui = readFileSync(new URL("../app/components/commercial-rdv-table.js", import.meta.url), "utf8");
  assert.match(ui, /Tous les commerciaux/);
  assert.match(ui, /Tous les prospecteurs/);
  assert.doesNotMatch(ui, /Tél\.|ClientPhoneLink|row\.phone/);
});

test("le filtre statut Non statue retrouve un ancien Planifie", () => {
  const table = buildCommercialRdvTable([
    { id: "a", prospectName: "A", start, duration: 60, status: "Planifié" },
    { id: "b", prospectName: "B", start, duration: 60, status: "Commande signée" },
  ], [], { status: "Non statué" });
  assert.equal(table.total, 1);
  assert.equal(table.rows[0].id, "a");
});

test("le commercial statue son rdv, les responsables tous, y compris avant l'heure", () => {
  const future = { id: "rdv", commercialId: "c1", start: "2099-01-01T10:00:00.000Z", status: "Non statué" };
  const past = { ...future, start: "2020-01-01T10:00:00.000Z" };
  const commercial = { role: "Commercial", active: true, onboarding_completed_at: "2026-01-01T00:00:00Z" };
  const lead = { role: "Responsable commercial", active: true, onboarding_completed_at: "2026-01-01T00:00:00Z" };
  const dispatcher = { role: "Responsable prospection", active: true, onboarding_completed_at: "2026-01-01T00:00:00Z" };
  const other = { role: "Secrétariat", active: true, onboarding_completed_at: "2026-01-01T00:00:00Z" };
  const vip = { role: "Admin VIP", active: true, onboarding_completed_at: "2026-01-01T00:00:00Z" };
  const superadmin = { role: "Super admin", active: true, onboarding_completed_at: "2026-01-01T00:00:00Z" };
  assert.equal(canStatuerAppointment(commercial, "c1", future), true);
  assert.equal(canStatuerAppointment(commercial, "c2", future), false);
  assert.equal(canStatuerAppointment(lead, "lead", future), true);
  assert.equal(canStatuerAppointment(dispatcher, "x", future), true);
  assert.equal(canStatuerAppointment({ role: "Prospecteur terrain", active: true, onboarding_completed_at: "2026-01-01" }, "c1", future), false);
  assert.equal(canStatuerAppointment(other, "c1", future), false);
  assert.equal(canApplyRdvStatus(commercial, "c1", future, "Commande signée"), false);
  assert.equal(canApplyRdvStatus(commercial, "c1", future, "RDV à repositionner"), true);
  assert.equal(canApplyRdvStatus(commercial, "c1", past, "Commande signée"), false);
  assert.equal(canApplyRdvStatus(lead, "lead", future, "Commande signée"), false);
  assert.equal(canApplyRdvStatus(lead, "lead", past, "Client en réflexion"), true);
  assert.equal(canApplyRdvStatus(dispatcher, "x", future, "Client absent"), true);
  assert.equal(canApplyRdvStatus(vip, "vip", future, "Commande signée"), true);
  assert.equal(canApplyRdvStatus(superadmin, "sa", future, "Commande signée"), true);
  assert.equal(canSignCommercialOrder({ role: "Direction" }), false);
  assert.ok(!allowedRdvStatusesFor(commercial, "c1", future).includes("Client en réflexion"));
  assert.ok(allowedRdvStatusesFor(commercial, "c1", past).includes("Client en réflexion"));
  assert.ok(!allowedRdvStatusesFor(commercial, "c1", past).includes("Commande signée"));
  assert.ok(!allowedRdvStatusesFor(dispatcher, "x", future).includes("Commande signée"));
  assert.ok(allowedRdvStatusesFor(vip, "vip", future).includes("Commande signée"));
  const alreadySigned = { ...past, status: "Commande signée" };
  assert.ok(allowedRdvStatusesFor(commercial, "c1", alreadySigned).includes("Commande signée"));
  assert.equal(canApplyRdvStatus(commercial, "c1", alreadySigned, "Client en réflexion"), true);
});

test("un commercial peut seulement statuer un rendez-vous existant", () => {
  assert.equal(isAppointmentOutcomeOnlyPatch({ status: "Client en réflexion" }), true);
  assert.equal(isAppointmentOutcomeOnlyPatch({ status: "Client absent", start }), false);
  assert.equal(isAppointmentOutcomeOnlyPatch({ duration: 60 }), false);
  const record = formToAppointmentRecord({
    prospectName: "A",
    start,
    status: "Client en réflexion",
  }, {});
  assert.equal(record.status, "Client en réflexion");
  const agenda = readFileSync(new URL("../app/components/commercial-agenda.js", import.meta.url), "utf8");
  assert.match(agenda, /viewMode === "table"/);
  assert.match(agenda, /CommercialRdvTable/);
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /isAppointmentOutcomeOnlyPatch/);
  assert.match(page, /Suivi commerciaux/);
  assert.match(page, /initialView=/);
  const patch = readFileSync(new URL("../app/api/appointments/[id]/route.js", import.meta.url), "utf8");
  assert.match(patch, /outcomeOnly/);
});

test("le suivi ouvre la fiche client et ne statue pas dans le tableau", () => {
  const clients = [{ id: "c9", name: "Martin", prospectNumber: 7 }];
  const prospects = [{ id: "p9", name: "Martin", prospectNumber: 7, clientId: "c9" }];
  assert.equal(resolveRdvClient({ prospectId: "p9" }, prospects[0], clients)?.id, "c9");
  const table = buildCommercialRdvTable([
    { id: "rdv", prospectId: "p9", prospectName: "Martin", start, duration: 60, status: "Non statué" },
  ], prospects, { clients });
  assert.equal(table.rows[0].clientId, "c9");
  assert.equal(appointmentsForClient(clients[0], table.rows, prospects).length, 1);
  const ui = readFileSync(new URL("../app/components/commercial-rdv-table.js", import.meta.url), "utf8");
  assert.match(ui, /rdv-board-client/);
  assert.match(ui, /onOpenClient/);
  assert.match(ui, /is-readonly/);
  assert.doesNotMatch(ui, /onUpdate\?\.\(row/);
  const record = readFileSync(new URL("../app/components/client-record.js", import.meta.url), "utf8");
  assert.match(record, /Statut RDV/);
  assert.match(record, /allowedRdvStatusesFor/);
  const agenda = readFileSync(new URL("../app/components/commercial-agenda.js", import.meta.url), "utf8");
  assert.match(agenda, /lockStatus=\{viewMode === "table"\}/);
  assert.match(agenda, /Statut RDV<select value=\{normalizeAgendaStatus\(item\.status\)\}/);
  assert.match(agenda, /!canStatuerAppointment\(currentProfile, currentUserId, item\) && <p className="event-lock-note">Le statut se statue dans la fiche client\./);
});

test("l'affiche Suivi commerciaux reprend le bleu et le jaune du site", () => {
  const agenda = readFileSync(new URL("../app/components/commercial-agenda.js", import.meta.url), "utf8");
  assert.match(agenda, /event-detail-save/);
  assert.match(agenda, /className="event-detail-top"/);
  assert.match(agenda, /className="is-primary"/);
  assert.match(agenda, /className="is-sun"/);
  assert.match(agenda, /className="is-ghost"/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.event-detail-modal\{[^}]*#ffcc00/);
  assert.match(css, /\.event-detail-actions \.is-primary\{[^}]*#405fae/);
  assert.match(css, /\.event-detail-actions \.is-sun\{[^}]*#ffcc00/);
  assert.match(css, /\.event-detail-flag\{[^}]*#405fae/);
  assert.doesNotMatch(css, /\.event-detail-flag\{[^}]*#2563eb/);
  assert.doesNotMatch(css, /\.event-detail-flag\.tone-confirmed\{[^}]*#059669/);
});

test("les créneaux personnels restent hors du suivi commercial", () => {
  // Une formation occupe l'agenda mais n'a pas de prospect, donc pas
  // d'origine. La compter comme rendez-vous commercial gonflerait le nombre de
  // rendez-vous par provenance et abaisserait les taux de conversion.
  const commun = { start: "2026-10-20T09:00:00.000Z", end: "2026-10-20T10:00:00.000Z" };
  for (const kind of ["formation", "accompagnement", "autre"]) {
    assert.equal(isCommercialRdvRow({ id: `p-${kind}`, kind, ...commun }), false, kind);
  }
  for (const kind of ["rendez-vous", "rappel", "", undefined]) {
    assert.equal(isCommercialRdvRow({ id: "r1", kind, ...commun }), true, String(kind));
  }

  const table = buildCommercialRdvTable([
    { id: "r1", kind: "rendez-vous", prospectId: "p1", prospectName: "Camille", commercialId: "c1", ...commun },
    { id: "f1", kind: "formation", prospectName: "Formation produits", commercialId: "c1", ...commun },
    { id: "a1", kind: "accompagnement", prospectName: "Accompagnement terrain", commercialId: "c1", ...commun },
  ], [{ id: "p1", prospectNumber: 12 }], { pageSize: 100 });

  assert.equal(table.total, 1);
  assert.deepEqual(table.rows.map(row => row.id), ["r1"]);
});
