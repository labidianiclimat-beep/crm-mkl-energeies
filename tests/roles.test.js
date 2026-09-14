import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRoleLabel,
  profileHasPermission,
  roleModuleDefaults,
  selectableRoles,
} from "../app/lib/roles.js";
import { canAccessModule, canPerformAction, isAdminRole } from "../app/lib/permissions.js";
import { canAccessNav, resolveAllowedModules } from "../app/lib/access-control.js";

test("normalizes consignes Administrateur to Admin VIP", () => {
  assert.equal(normalizeRoleLabel("Administrateur"), "Admin VIP");
  assert.equal(normalizeRoleLabel("Secretariat"), "Secrétariat");
});

test("catalog includes minimum étape 8 roles", () => {
  const roles = selectableRoles();
  for (const label of ["Admin VIP", "Direction", "Responsable commercial", "Commercial", "Technicien", "Secrétariat"]) {
    assert.ok(roles.includes(label), `missing ${label}`);
  }
});

test("commercial cannot access Utilisateurs module via API check", () => {
  const profile = {
    role: "Commercial",
    modules: roleModuleDefaults().Commercial,
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  assert.equal(canAccessModule(profile, "Clients"), true);
  assert.equal(canAccessModule(profile, "Utilisateurs"), false);
  assert.equal(canPerformAction(profile, "invite_users"), false);
  assert.equal(canPerformAction(profile, "view_all_clients"), false);
});

test("secretariat can export clients but not invite users", () => {
  const profile = {
    role: "Secrétariat",
    modules: roleModuleDefaults().Secrétariat,
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  assert.equal(canPerformAction(profile, "export_clients"), true);
  assert.equal(canPerformAction(profile, "invite_users"), false);
  assert.equal(canPerformAction(profile, "view_all_clients"), true);
  assert.equal(canAccessModule(profile, "Devis"), true);
  assert.equal(canAccessModule(profile, "Utilisateurs"), false);
});

test("admin keeps utilisateurs in nav", () => {
  const profile = {
    role: "Admin VIP",
    modules: ["Clients"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  const allowed = resolveAllowedModules(profile, roleModuleDefaults());
  assert.equal(canAccessNav(allowed, "Utilisateurs"), true);
  assert.equal(isAdminRole(profile.role), true);
  assert.equal(profileHasPermission(profile, "module:Utilisateurs"), true);
});
