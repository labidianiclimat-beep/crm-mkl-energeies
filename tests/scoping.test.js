import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCommercialScopeFilter,
  canViewOrgWideCommercialData,
  canViewTeamCommercialData,
  resolveScopedCommercialIds,
  teamMemberIdsFromProfiles,
  visibleAgendaAppointment,
  privateAgendaOwnerIds,
  visibleAgendaRowForViewer,
} from "../app/lib/scoping.js";
import { canViewAllClients } from "../app/lib/clients.js";
import { canViewAllDevis } from "../app/lib/devis.js";

test("commercial sees only self scope", () => {
  const profile = { role: "Commercial" };
  assert.equal(canViewOrgWideCommercialData(profile), false);
  assert.equal(canViewTeamCommercialData(profile), false);
  assert.deepEqual(resolveScopedCommercialIds(profile, "u1", ["u2"]), ["u1"]);
});

test("responsable commercial sees team scope not org-wide", () => {
  const profile = { role: "Responsable commercial" };
  assert.equal(canViewAllClients(profile), false);
  assert.equal(canViewAllDevis(profile), false);
  assert.equal(canViewTeamCommercialData(profile), true);
  assert.deepEqual(resolveScopedCommercialIds(profile, "lead", ["lead", "c1"]).sort(), ["c1", "lead"]);
});

test("commercial never gets org-wide client or devis lists", () => {
  const profile = { role: "Commercial" };
  assert.equal(canViewAllClients(profile), false);
  assert.equal(canViewAllDevis(profile), false);
  assert.deepEqual(resolveScopedCommercialIds(profile, "tony", ["lead", "karim"]), ["tony"]);
});

test("admin and secretariat see org-wide", () => {
  assert.equal(canViewOrgWideCommercialData({ role: "Admin VIP" }), true);
  assert.equal(canViewOrgWideCommercialData({ role: "Secrétariat" }), true);
  assert.equal(resolveScopedCommercialIds({ role: "Direction" }, "u1"), null);
});

test("le responsable ne voit que les vendeurs rattachés à son nom", () => {
  const lead = { role: "Responsable commercial", full_name: "Karim Chef", email: "karim@mkl.fr" };
  const rows = [
    { id: "lead", role: "Responsable commercial", full_name: "Karim Chef", active: true },
    { id: "lea", role: "Commercial", full_name: "Léa Martin", manager: "karim chef", active: true },
    { id: "paul", role: "Commercial", full_name: "Paul Bernard", manager: "", active: true },
    { id: "ines", role: "Commercial", full_name: "Inès", manager: "Autre chef", active: true },
    { id: "tech", role: "Technicien", full_name: "Sam", manager: "Karim Chef", active: true },
  ];
  assert.deepEqual(teamMemberIdsFromProfiles(lead, "lead", rows).sort(), ["lea", "lead"]);
});

test("un responsable ne voit pas le rendez-vous d un vendeur hors equipe", () => {
  const team = ["lead", "c1"];
  assert.equal(visibleAgendaAppointment({ commercial_id: "c1" }, team), true);
  assert.equal(visibleAgendaAppointment({ commercialId: "c2", createdBy: "lead", managerId: "lead" }, team), false);
  assert.equal(visibleAgendaAppointment({ commercial_id: null, created_by: "lead" }, team), true);
  assert.equal(visibleAgendaAppointment({ commercial_id: "c2" }, null), true);
});

test("l agenda admin vip reste visible pour lui seul", () => {
  const owners = privateAgendaOwnerIds([
    { id: "vip", role: "Admin VIP" },
    { id: "lea", role: "Commercial" },
    { id: "dir", role: "Direction" },
  ]);
  assert.deepEqual([...owners], ["vip"]);
  const vipEvent = { commercial_id: "vip" };
  const leaEvent = { commercial_id: "lea" };
  const unassigned = { commercial_id: null, created_by: "dir" };
  assert.equal(visibleAgendaRowForViewer(vipEvent, null, { role: "Admin VIP" }, owners), true);
  assert.equal(visibleAgendaRowForViewer(leaEvent, null, { role: "Admin VIP" }, owners), true);
  assert.equal(visibleAgendaRowForViewer(unassigned, null, { role: "Admin VIP" }, owners), true);
  assert.equal(visibleAgendaRowForViewer(vipEvent, null, { role: "Direction" }, owners), false);
  assert.equal(visibleAgendaRowForViewer(vipEvent, null, { role: "Secrétariat" }, owners), false);
  assert.equal(visibleAgendaRowForViewer(vipEvent, null, { role: "Responsable prospection" }, owners), false);
  assert.equal(visibleAgendaRowForViewer(vipEvent, null, { role: "Superadmin" }, owners), false);
  assert.equal(visibleAgendaRowForViewer(leaEvent, null, { role: "Direction" }, owners), true);
  assert.equal(visibleAgendaRowForViewer(unassigned, null, { role: "Responsable prospection" }, owners), true);
  assert.equal(visibleAgendaRowForViewer(leaEvent, ["lea"], { role: "Commercial" }, owners), true);
  assert.equal(visibleAgendaRowForViewer(vipEvent, ["lea"], { role: "Commercial" }, owners), false);
});

test("builds postgrest or filter for scoped ids", () => {
  const filter = buildCommercialScopeFilter(["commercial_id", "created_by"], ["a", "b"]);
  assert.match(filter, /commercial_id\.eq\.a/);
  assert.match(filter, /created_by\.eq\.b/);
  assert.equal(buildCommercialScopeFilter(["commercial_id"], null), "");
});
