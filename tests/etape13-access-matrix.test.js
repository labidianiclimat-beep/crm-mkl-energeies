/**
 * ÉTAPE 13 — Tests obligatoires (matrice d’accès).
 * Personas : Admin, Responsable commercial, Commercial 1, Commercial 2.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessScopedRow,
  canViewOrgWideCommercialData,
  canViewTeamCommercialData,
  deniedDirectUrlReason,
  resolveScopedCommercialIds,
} from "../app/lib/scoping.js";
import { canAccessModule, canPerformAction, isAdminRole } from "../app/lib/permissions.js";
import { canAccessNav, resolveAllowedModules } from "../app/lib/access-control.js";
import { roleModuleDefaults } from "../app/lib/roles.js";

const ORG = "org-mkl";
const ADMIN_ID = "admin-1";
const LEAD_ID = "lead-1";
const COM1_ID = "com-1";
const COM2_ID = "com-2";

const defaults = roleModuleDefaults();

function profile(role, id, extras = {}) {
  return {
    id,
    role,
    organization_id: ORG,
    modules: defaults[role] || ["Tableau de bord"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
    ...extras,
  };
}

const admin = profile("Admin VIP", ADMIN_ID);
const lead = profile("Responsable commercial", LEAD_ID);
const com1 = profile("Commercial", COM1_ID);
const com2 = profile("Commercial", COM2_ID);

const clientCom1 = {
  id: "client-com1",
  organization_id: ORG,
  commercial_id: COM1_ID,
  created_by: COM1_ID,
};
const clientCom2 = {
  id: "client-com2",
  organization_id: ORG,
  commercial_id: COM2_ID,
  created_by: COM2_ID,
};
const devisCom1 = {
  id: "devis-com1",
  organization_id: ORG,
  commercial_id: COM1_ID,
  created_by: COM1_ID,
};
const devisCom2 = {
  id: "devis-com2",
  organization_id: ORG,
  commercial_id: COM2_ID,
  created_by: COM2_ID,
};
const otherOrgClient = {
  id: "client-other",
  organization_id: "autre-org",
  commercial_id: COM1_ID,
  created_by: COM1_ID,
};

const teamOfLead = [LEAD_ID, COM1_ID]; // Commercial 2 hors équipe

test("ADMIN — accès org entière + modules sensibles", () => {
  assert.equal(isAdminRole(admin.role), true);
  assert.equal(canViewOrgWideCommercialData(admin), true);
  assert.equal(resolveScopedCommercialIds(admin, ADMIN_ID), null);
  assert.equal(canAccessScopedRow(admin, ADMIN_ID, clientCom1), true);
  assert.equal(canAccessScopedRow(admin, ADMIN_ID, clientCom2), true);
  assert.equal(canAccessScopedRow(admin, ADMIN_ID, devisCom1), true);
  assert.equal(canAccessScopedRow(admin, ADMIN_ID, devisCom2), true);
  assert.equal(canAccessModule(admin, "Utilisateurs"), true);
  assert.equal(canPerformAction(admin, "invite_users"), true);
  assert.equal(canPerformAction(admin, "view_all_clients"), true);
  const allowed = resolveAllowedModules(admin, defaults);
  assert.equal(canAccessNav(allowed, "Utilisateurs"), true);
  assert.equal(canAccessNav(allowed, "Devis"), true);
});

test("RESPONSABLE COMMERCIAL — voit son équipe, pas l’org hors équipe", () => {
  assert.equal(canViewTeamCommercialData(lead), true);
  assert.equal(canViewOrgWideCommercialData(lead), false);
  const scoped = resolveScopedCommercialIds(lead, LEAD_ID, teamOfLead);
  assert.deepEqual(scoped.sort(), [COM1_ID, LEAD_ID].sort());

  assert.equal(canAccessScopedRow(lead, LEAD_ID, clientCom1, teamOfLead), true);
  assert.equal(canAccessScopedRow(lead, LEAD_ID, devisCom1, teamOfLead), true);
  // Commercial 2 n’est pas dans l’équipe du responsable
  assert.equal(canAccessScopedRow(lead, LEAD_ID, clientCom2, teamOfLead), false);
  assert.equal(canAccessScopedRow(lead, LEAD_ID, devisCom2, teamOfLead), false);
  assert.equal(canAccessModule(lead, "Utilisateurs"), false);
  assert.equal(canPerformAction(lead, "invite_users"), false);
});

test("COMMERCIAL 1 — uniquement ses clients et devis", () => {
  assert.deepEqual(resolveScopedCommercialIds(com1, COM1_ID, teamOfLead), [COM1_ID]);
  assert.equal(canAccessScopedRow(com1, COM1_ID, clientCom1), true);
  assert.equal(canAccessScopedRow(com1, COM1_ID, devisCom1), true);
  assert.equal(canAccessScopedRow(com1, COM1_ID, clientCom2), false);
  assert.equal(canAccessScopedRow(com1, COM1_ID, devisCom2), false);
  assert.equal(canAccessModule(com1, "Utilisateurs"), false);
  assert.equal(canPerformAction(com1, "view_all_clients"), false);
});

test("COMMERCIAL 2 — ne voit jamais les données du Commercial 1", () => {
  assert.equal(canAccessScopedRow(com2, COM2_ID, clientCom1), false);
  assert.equal(canAccessScopedRow(com2, COM2_ID, devisCom1), false);
  assert.equal(canAccessScopedRow(com2, COM2_ID, clientCom2), true);
  assert.equal(canAccessScopedRow(com2, COM2_ID, devisCom2), true);
});

test("isolation org — aucune persona ne lit une autre organisation", () => {
  for (const [persona, id] of [
    [admin, ADMIN_ID],
    [lead, LEAD_ID],
    [com1, COM1_ID],
    [com2, COM2_ID],
  ]) {
    assert.equal(canAccessScopedRow(persona, id, otherOrgClient, teamOfLead), false);
  }
});

test("URL directes refusées côté serveur — /admin et /users", () => {
  assert.equal(deniedDirectUrlReason("/admin"), "admin");
  assert.equal(deniedDirectUrlReason("/admin/settings"), "admin");
  assert.equal(deniedDirectUrlReason("/administration"), "admin");
  assert.equal(deniedDirectUrlReason("/users"), "users");
  assert.equal(deniedDirectUrlReason("/users/abc"), "users");
  assert.equal(deniedDirectUrlReason("/"), null);
  assert.equal(deniedDirectUrlReason("/activation"), null);
});

test("simulation accès API — commercial 2 sur ids commercial 1 = refus", () => {
  // Même logique que GET /api/clients/[id] et /api/devis/[id]
  const allowClient = canAccessScopedRow(com2, COM2_ID, clientCom1);
  const allowDevis = canAccessScopedRow(com2, COM2_ID, devisCom1);
  assert.equal(allowClient, false);
  assert.equal(allowDevis, false);
  // Réponse attendue côté API : 404 « introuvable ou accès refusé »
});
