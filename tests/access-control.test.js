import test from "node:test";
import assert from "node:assert/strict";
import { canAccessNav, resolveAllowedModules } from "../app/lib/access-control.js";

const roleDefaults = {
  "Admin VIP": ["Tableau de bord", "Clients", "Devis", "Utilisateurs"],
  Commercial: ["Tableau de bord", "Clients"],
};

test("commercial with Clients only sees Clients module", () => {
  const profile = {
    role: "Commercial",
    modules: ["Clients"],
    active: true,
    onboarding_completed_at: new Date().toISOString(),
  };
  const allowed = resolveAllowedModules(profile, roleDefaults);
  assert.equal(canAccessNav(allowed, "Clients"), true);
  assert.equal(canAccessNav(allowed, "Devis"), false);
});

test("admin keeps full role defaults even with custom modules", () => {
  const profile = {
    role: "Admin VIP",
    modules: ["Clients"],
    active: true,
    onboarding_completed_at: new Date().toISOString(),
  };
  const allowed = resolveAllowedModules(profile, roleDefaults);
  assert.equal(canAccessNav(allowed, "Utilisateurs"), true);
});
