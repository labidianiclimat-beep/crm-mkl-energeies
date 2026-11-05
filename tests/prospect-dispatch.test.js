import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canAssignProspectCommercial,
  canDispatchProspects,
  canSeeDispatchQueue,
  canPickOrgProspectCommercial,
  canViewOrgWideProspectDispatch,
  commercialColor,
  agendaOwnerColor,
  isAgendaOwnerShown,
  commercialsForProspectAssign,
  contrastingInk,
  deniesFinancialAccess,
  dispatchOutcome,
  canEditExistingProspect,
  canReviseProspect,
  FIELD_PROSPECTOR_MANAGERS,
  FIELD_REVISE_MINUTES,
  isAssignedProspect,
  isDispatchCommercialRole,
  isFieldProspector,
  isProspectDispatcher,
  isUnassignedProspect,
  rankDispatchCommercials,
  resolveProspectCommercialId,
  validateReassignReason,
  zoneMatch,
} from "../app/lib/prospect-dispatch.js";
import { canAccessModule } from "../app/lib/permissions.js";
import { canManageDevis } from "../app/lib/devis.js";
import { canViewAllClients } from "../app/lib/clients.js";
import { resolveAllowedModules } from "../app/lib/access-control.js";
import { resolveScopedCommercialIds, canAccessScopedRow } from "../app/lib/scoping.js";
import { roleModuleDefaults } from "../app/lib/roles.js";
import { formToProspectRecord } from "../app/lib/prospects.js";
import { googleEventToRecord } from "../app/lib/agenda.js";
import { appointmentToUi } from "../app/lib/prospects.js";
import { visibleProspects } from "../app/lib/prospect-to-client.js";

const defaults = roleModuleDefaults();
const dispatcher = {
  id: "disp-1",
  role: "Responsable prospection",
  organization_id: "org-mkl",
  modules: defaults["Responsable prospection"],
  active: true,
  onboarding_completed_at: "2026-01-01T00:00:00Z",
};
const commercial = {
  id: "22222222-2222-4222-8222-222222222222",
  role: "Commercial",
  organization_id: "org-mkl",
  modules: defaults.Commercial,
  active: true,
  onboarding_completed_at: "2026-01-01T00:00:00Z",
};

test("le role responsable prospection n a ni devis ni clients ni CA", () => {
  assert.equal(isProspectDispatcher(dispatcher), true);
  assert.equal(canDispatchProspects(dispatcher), true);
  assert.equal(canSeeDispatchQueue(dispatcher), true);
  assert.equal(canSeeDispatchQueue({ role: "Admin VIP" }), true);
  assert.equal(canSeeDispatchQueue({ role: "Superadmin" }), false);
  assert.equal(canSeeDispatchQueue({ role: "Direction" }), false);
  assert.equal(canSeeDispatchQueue({ role: "Responsable commercial" }), false);
  assert.equal(canViewOrgWideProspectDispatch(dispatcher), true);
  assert.equal(deniesFinancialAccess(dispatcher), true);
  assert.equal(canManageDevis(dispatcher), false);
  assert.equal(canViewAllClients(dispatcher), false);
  assert.equal(canAccessModule(dispatcher, "Devis"), false);
  assert.equal(canAccessModule(dispatcher, "Clients"), false);
  assert.equal(canAccessModule(dispatcher, "Factures"), false);
  assert.equal(canAccessModule(dispatcher, "Prospects"), true);
  const allowed = resolveAllowedModules(dispatcher, defaults);
  assert.ok(!allowed.includes("Devis"));
  assert.ok(!allowed.includes("Clients"));
  assert.ok(allowed.includes("Prospects"));
});

test("le dispatcher voit toute l org pour le dispatch, pas pour un client", () => {
  assert.equal(resolveScopedCommercialIds(dispatcher, dispatcher.id, [], { forDispatch: true }), null);
  assert.deepEqual(resolveScopedCommercialIds(dispatcher, dispatcher.id), [dispatcher.id]);
  const unassigned = { organization_id: "org-mkl", commercial_id: null, created_by: dispatcher.id };
  assert.equal(canAccessScopedRow(dispatcher, dispatcher.id, unassigned, [], { forDispatch: true }), true);
  assert.equal(canAccessScopedRow(commercial, commercial.id, unassigned), false);
  const otherProspect = { organization_id: "org-mkl", commercial_id: "33333333-3333-4333-8333-333333333333", created_by: "33333333-3333-4333-8333-333333333333" };
  assert.equal(canAccessScopedRow(dispatcher, dispatcher.id, otherProspect, [], { forDispatch: true }), true);
  assert.equal(canAccessScopedRow(commercial, commercial.id, otherProspect), false);
});

test("un prospecteur voit la fiche qui lui est attribuee meme s il ne l a pas saisie", () => {
  const field = {
    id: "55555555-5555-4555-8555-555555555555",
    role: "Prospecteur terrain",
    organization_id: "org-mkl",
  };
  const captured = {
    organization_id: "org-mkl",
    commercial_id: null,
    created_by: "disp-1",
    extra: { prospectorId: field.id },
  };
  assert.equal(canAccessScopedRow(field, field.id, captured), true);
  assert.equal(canAccessScopedRow(commercial, commercial.id, captured), false);
});

test("un prospect sans commercial reste dans la file a dispatcher", () => {
  const record = formToProspectRecord({
    name: "Marie Laurent",
    phone: "0612345678",
    address: "12 rue de la Paix",
    postalCode: "44000",
    city: "Nantes",
    desiredAt: "2026-09-21T09:00:00.000Z",
  }, { organizationId: "org-mkl", createdBy: dispatcher.id });
  assert.equal(record.commercial_id, null);
  assert.equal(record.extra.desiredAt, "2026-09-21T09:00:00.000Z");
  const ui = { commercialId: "", extra: record.extra, city: "Nantes" };
  assert.equal(isUnassignedProspect(ui), true);
  assert.equal(isAssignedProspect({ commercial_id: commercial.id }), true);
});

test("la recommandation privilegie zone et disponibilite", () => {
  const ranked = rankDispatchCommercials({
    commercials: [
      { id: "near", name: "Lea", zone: "Nantes", postalCode: "44000", city: "Nantes", specialties: ["Pompe à chaleur"], dispatchAvailable: true },
      { id: "far", name: "Paul", zone: "Lyon", postalCode: "69000", city: "Lyon", specialties: ["Photovoltaïque"], dispatchAvailable: true },
      { id: "off", name: "Ines", zone: "Nantes", postalCode: "44000", city: "Nantes", specialties: ["Pompe à chaleur"], dispatchAvailable: false },
    ],
    appointments: [
      { id: "busy", commercialId: "near", start: "2026-09-21T09:00:00.000Z", duration: 60, status: "Planifié" },
    ],
    prospect: { city: "Nantes", postalCode: "44000", type: "Pompe à chaleur" },
    desiredAt: "2026-09-21T14:00:00.000Z",
    duration: 60,
    now: new Date("2026-09-21T08:00:00.000Z"),
  });
  assert.equal(ranked[0].id, "near");
  assert.match(ranked[0].rank, /recommandé/i);
  assert.equal(ranked.find(item => item.id === "off").available, false);
  assert.equal(zoneMatch({ postalCode: "44000" }, { postalCode: "44000" }).distance, "même CP");
});

test("le responsable commercial reste un destinataire d attribution", () => {
  assert.equal(isDispatchCommercialRole("Responsable commercial"), true);
  assert.equal(isDispatchCommercialRole("Commercial"), true);
  const ranked = rankDispatchCommercials({
    commercials: [
      { id: "c1", name: "Lea", role: "Commercial", city: "Nantes", postalCode: "44000", dispatchAvailable: true },
      { id: "m1", name: "Karim", role: "Responsable commercial", city: "Nantes", postalCode: "44000", dispatchAvailable: true },
    ],
    prospect: { city: "Nantes", postalCode: "44000" },
    desiredAt: "2026-09-21T09:00:00.000Z",
    now: new Date("2026-09-20T08:00:00.000Z"),
  });
  assert.ok(ranked.some(item => item.id === "m1" && item.role === "Responsable commercial"));
});

test("une reattribution exige un motif", () => {
  assert.match(validateReassignReason("", { required: true }), /motif/i);
  assert.equal(validateReassignReason("Le commercial est absent", { required: true }), "");
});

test("un evenement google personnel garde titre et lieu", () => {
  const record = googleEventToRecord({
    id: "evt-google-1",
    summary: "Visite PAC Dupont",
    description: "Rappel chantier",
    location: "Mulhouse",
    start: { dateTime: "2026-09-20T09:00:00+02:00" },
    end: { dateTime: "2026-09-20T10:30:00+02:00" },
  }, { organizationId: "org-1", commercialId: "user-1", calendarId: "primary" });
  assert.equal(record.prospect_name, "Visite PAC Dupont");
  assert.equal(record.extra.kind, "busy");
  assert.equal(record.extra.private, false);
  assert.equal(record.extra.address, "Mulhouse");
  const ui = appointmentToUi({ ...record, id: "apt-1" });
  assert.equal(ui.prospectName, "Visite PAC Dupont");
  assert.equal(ui.private, false);
  assert.equal(ui.notes, "Rappel chantier");
  assert.equal(ui.source, "google");
});

test("les prospects convertis restent visibles pour le suivi dispatcher", () => {
  const converted = { extra: { clientId: "c1" }, commercialId: commercial.id, stage: "Gagné" };
  const linkedWithoutWonStage = { extra: { clientId: "c1" }, commercialId: commercial.id, stage: "Rendez-vous planifié" };
  assert.equal(visibleProspects([converted]).length, 0);
  assert.equal(visibleProspects([converted], { includeConverted: true }).length, 1);
  assert.equal(visibleProspects([linkedWithoutWonStage]).length, 0);
  assert.equal(dispatchOutcome(converted), "Transformé en client");
  assert.equal(dispatchOutcome(linkedWithoutWonStage), "Transformé en client");
  assert.ok(commercialColor(commercial.id));
  assert.equal(agendaOwnerColor(commercial.id, {}), commercialColor(commercial.id));
  assert.equal(agendaOwnerColor(commercial.id, { [commercial.id]: "#ffcc00" }), "#ffcc00");
  assert.equal(agendaOwnerColor(commercial.id, { [commercial.id]: "bleu" }), commercialColor(commercial.id));
  assert.equal(isAgendaOwnerShown(commercial.id, {}), true);
  assert.equal(isAgendaOwnerShown(commercial.id, { [commercial.id]: true }), false);
  assert.equal(isAgendaOwnerShown("", { "": true }), true);
  assert.equal(contrastingInk("#f5b400"), "#152347");
  assert.equal(contrastingInk("#2563eb"), "#ffffff");
});

test("les routes dispatch refusent devis et exigent un motif", () => {
  const board = readFileSync(new URL("../app/api/prospects/dispatch-board/route.js", import.meta.url), "utf8");
  const assign = readFileSync(new URL("../app/api/prospects/[id]/assign/route.js", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../app/api/dashboard/commercial/route.js", import.meta.url), "utf8");
  const prospecting = readFileSync(new URL("../app/api/dashboard/prospecting/route.js", import.meta.url), "utf8");
  const create = readFileSync(new URL("../app/api/prospects/route.js", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../supabase/migrations/20260918_prospect_dispatch.sql", import.meta.url), "utf8");
  const form = readFileSync(new URL("../app/components/prospect-next-action.js", import.meta.url), "utf8");
  assert.match(board, /isDispatchCommercialRole/);
  assert.match(assign, /assignProspectToCommercial/);
  assert.match(assign, /canDispatchProspects/);
  assert.match(dashboard, /deniesFinancialAccess/);
  assert.match(prospecting, /aDispatcher/);
  assert.doesNotMatch(create, /deferAppointment/);
  assert.match(create, /opportunity_id = created.id/);
  assert.match(create, /notifyProspectOfAppointment/);
  assert.match(sql, /responsable_prospection/);
  assert.match(sql, /prospect_assignment_history/);
  assert.match(form, /À dispatcher plus tard/);
});

test("le prospecteur terrain cree sans modifier ensuite", () => {
  const field = {
    id: "field-1",
    role: "Prospecteur terrain",
    organization_id: "org-mkl",
    modules: defaults["Prospecteur terrain"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  assert.equal(isFieldProspector(field), true);
  assert.equal(canEditExistingProspect(field), false);
  const now = new Date("2026-09-30T12:00:00.000Z");
  const dispatcher = {
    role: "Responsable prospection",
    modules: defaults["Responsable prospection"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  assert.equal(FIELD_REVISE_MINUTES, 30);
  assert.equal(canReviseProspect(field, { created: "2026-09-30T11:40:00.000Z" }, now), true);
  assert.equal(canReviseProspect(field, { created: "2026-09-30T10:00:00.000Z" }, now), false);
  assert.equal(canReviseProspect(field, {}, now), false);
  assert.equal(canEditExistingProspect(dispatcher), true);
  assert.equal(canReviseProspect(dispatcher, { created: "2026-09-30T10:00:00.000Z" }, now), true);
  assert.equal(canEditExistingProspect(commercial), false);
  assert.equal(canEditExistingProspect({
    ...commercial,
    role: "Admin VIP",
    modules: defaults["Admin VIP"],
  }), true);
  assert.equal(canEditExistingProspect({
    ...commercial,
    role: "Superadmin",
    modules: defaults.Superadmin,
  }), true);
  assert.equal(canDispatchProspects(field), false);
  assert.deepEqual(FIELD_PROSPECTOR_MANAGERS, ["Responsable prospection", "Admin VIP"]);
  const create = readFileSync(new URL("../app/api/prospects/route.js", import.meta.url), "utf8");
  const update = readFileSync(new URL("../app/api/prospects/[id]/route.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(create, /fieldCapture/);
  assert.doesNotMatch(create, /deferAppointment/);
  assert.match(create, /record\.commercial_id \? "Rendez-vous planifié" : "À contacter"/);
  assert.doesNotMatch(create, /actionErrors = fieldCapture/);
  const fields = readFileSync(new URL("../app/components/prospect-fields.js", import.meta.url), "utf8");
  assert.match(fields, /5\. Prochaine action/);
  assert.match(fields, /deferCommercial \|\| fieldCapture/);
  assert.doesNotMatch(fields, /!prospect && !fieldCapture/);
  assert.match(update, /fiche enregistrée/);
  assert.match(update, /canReviseProspect/);
  assert.match(update, /30 minutes/);
  assert.match(page, /Prospecteur terrain/);
  assert.match(page, /consultOnly/);
  assert.match(page, /canReviseProspect/);
  assert.match(fields, /hideCommercial/);
});

test("le modal d attribution garde le bouton visible", () => {
  const board = readFileSync(new URL("../app/components/prospect-dispatch-board.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(board, /modal-form-body/);
  assert.match(board, /modal-form-actions/);
  assert.match(board, /Attribuer et planifier/);
  assert.match(board, /canDelete/);
  assert.match(board, /Supprimer le prospect/);
  assert.match(board, /Agenda/);
  assert.match(board, /onOpenAgenda/);
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /canSeeDispatchQueue/);
  assert.match(page, /openDispatchOnAgenda/);
  const agenda = readFileSync(new URL("../app/components/commercial-agenda.js", import.meta.url), "utf8");
  assert.match(agenda, /focusAppointmentId/);
  assert.match(css, /dispatch-assign-modal\{[^}]*max-height/);
  assert.match(css, /\.data-panel\.prospect-table\.dispatch-table\{[^}]*overflow-x:auto/);
});

test("le formulaire prospect n attribue un commercial qu aux roles prevus", () => {
  const vip = { id: "vip-1", role: "Admin VIP" };
  const admin = { id: "adm-1", role: "Superadmin" };
  const manager = { id: "rc-1", role: "Responsable commercial", full_name: "Karim Chef", email: "karim@mkl.fr" };
  const field = { id: "field-1", role: "Prospecteur terrain" };
  const other = "33333333-3333-4333-8333-333333333333";
  const teamMate = "44444444-4444-4444-8444-444444444444";
  const outsiders = [
    { id: commercial.id, name: "Léa", role: "Commercial", manager: "Karim Chef" },
    { id: other, name: "Paul", role: "Commercial", manager: "Autre" },
    { id: teamMate, name: "Inès", role: "Commercial", manager: "Karim Chef" },
    { id: manager.id, name: "Karim Chef", role: "Responsable commercial" },
    { id: "dir-1", name: "Direction", role: "Direction" },
  ];
  const team = outsiders.map(user => ({ id: user.id, name: user.name, manager: user.manager || "", role: user.role }));

  assert.equal(canAssignProspectCommercial(vip), true);
  assert.equal(canAssignProspectCommercial(admin), true);
  assert.equal(canAssignProspectCommercial({ role: "Admin second" }), true);
  assert.equal(canAssignProspectCommercial(dispatcher), true);
  assert.equal(canAssignProspectCommercial(manager), true);
  assert.equal(canAssignProspectCommercial(commercial), false);
  assert.equal(canAssignProspectCommercial(field), false);
  assert.equal(canAssignProspectCommercial({ role: "Direction" }), false);
  assert.equal(canPickOrgProspectCommercial(vip), true);
  assert.equal(canPickOrgProspectCommercial(manager), false);

  const rcList = commercialsForProspectAssign(manager, outsiders, {
    team,
    currentUserId: manager.id,
    currentUserName: "Karim Chef",
  });
  assert.deepEqual(rcList.map(user => user.id).sort(), [teamMate, commercial.id, manager.id].sort());
  assert.equal(commercialsForProspectAssign(commercial, outsiders, { team, currentUserId: commercial.id }).length, 0);
  assert.equal(commercialsForProspectAssign(field, outsiders, { team, currentUserId: field.id }).length, 0);
  assert.ok(commercialsForProspectAssign(vip, outsiders).some(user => user.id === other));

  assert.equal(resolveProspectCommercialId(commercial, commercial.id, other), commercial.id);
  assert.equal(resolveProspectCommercialId(field, field.id, commercial.id), "");
  assert.equal(resolveProspectCommercialId(dispatcher, dispatcher.id, ""), "");
  assert.equal(resolveProspectCommercialId(vip, vip.id, other), other);
  assert.equal(resolveProspectCommercialId(manager, manager.id, other, { teamIds: [manager.id, commercial.id, teamMate] }), manager.id);
  assert.equal(resolveProspectCommercialId(manager, manager.id, teamMate, { teamIds: [manager.id, commercial.id, teamMate] }), teamMate);
  assert.equal(resolveProspectCommercialId(commercial, commercial.id, other, { existingId: commercial.id }), commercial.id);

  const create = readFileSync(new URL("../app/api/prospects/route.js", import.meta.url), "utf8");
  const update = readFileSync(new URL("../app/api/prospects/[id]/route.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const fields = readFileSync(new URL("../app/components/prospect-fields.js", import.meta.url), "utf8");
  const form = readFileSync(new URL("../app/components/prospect-next-action.js", import.meta.url), "utf8");
  assert.match(create, /resolveProspectCommercialId/);
  assert.match(update, /resolveProspectCommercialId/);
  assert.match(page, /canAssignProspectCommercial/);
  assert.doesNotMatch(page, /canAssignCommercial=\{\s*canAssignCommercial\s*\|\|\s*deferCommercial/);
  assert.match(fields, /commercialsForProspectAssign/);
  assert.match(form, /canAssignCommercial/);
});

test("les boutons de file prospect ont le même format", () => {
  const board = readFileSync(new URL("../app/components/prospect-dispatch-board.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(board, /dispatch-toolbar/);
  assert.match(board, /À dispatcher/);
  assert.match(board, /Attribués/);
  assert.match(board, /Transformés/);
  assert.match(css, /\.dispatch-toolbar \.primary,\.dispatch-tabs button/);
  assert.match(css, /min-height:40px/);
  assert.match(css, /min-width:168px/);
});
