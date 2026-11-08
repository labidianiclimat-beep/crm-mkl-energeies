import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertAssignableAccess,
  grantedModules,
  normalizeRoleLabel,
  persistProfileAccess,
  profileHasPermission,
  roleModuleDefaults,
  sanitizeGrantedModules,
  selectableRoles,
} from "../app/lib/roles.js";
import { canAccessModule, canConfirmEntretienImport, canEditExistingAppointment, canEditExistingClient, canPerformAction, isAdminRole, locksFieldSalesData } from "../app/lib/permissions.js";
import { canAccessNav, resolveAllowedModules } from "../app/lib/access-control.js";
import { canManageArticles, canReadArticles } from "../app/lib/articles.js";

test("normalizes consignes Administrateur to Admin VIP", () => {
  assert.equal(normalizeRoleLabel("Administrateur"), "Admin VIP");
  assert.equal(normalizeRoleLabel("Secretariat"), "Secrétariat");
  assert.equal(normalizeRoleLabel("Admin second"), "Superadmin");
  assert.equal(normalizeRoleLabel("Superadmin"), "Superadmin");
});

test("un libelle annoncant une consultation n obtient pas l administration", () => {
  // « Lecture » était associé à « Superadmin », c'est-à-dire à l'administration
  // courante. Le nom promet une consultation et accordait l'inverse ; qui
  // l'attribuerait pour restreindre élargirait. Aucun compte ne le porte en
  // production, et le catalogue n'offre aucun rôle de consultation seule : le
  // libellé reste donc inconnu, et un rôle inconnu n'ouvre rien.
  assert.equal(normalizeRoleLabel("Lecture"), "Lecture");
  assert.equal(isAdminRole("Lecture"), false);
  assert.equal(canAccessModule(
    { role: "Lecture", modules: ["Utilisateurs", "Prospects"], active: true, onboarding_completed_at: "2026-01-01T00:00:00Z" },
    "Utilisateurs"
  ), false);
  // La reprise des libellés hérités de `page.js` ne doit pas rétablir par la
  // main ce que le catalogue refuse.
  const accueil = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.doesNotMatch(accueil, /"Lecture"\s*\?\s*"Superadmin"/);
});

test("la gestion des utilisateurs se ferme sur un role inconnu", () => {
  // Le filtre protégeait les rôles non administrateurs, mais l'absence de
  // définition le court-circuitait : il valait mieux porter un libellé inconnu
  // qu'un rôle reconnu sans droits d'administration. Une faute de frappe
  // suffisait donc à conserver le module.
  assert.deepEqual(sanitizeGrantedModules(["Utilisateurs", "Prospects"], { role: "Lectrice" }), ["Prospects"]);
  assert.deepEqual(sanitizeGrantedModules(["Utilisateurs", "Prospects"], { role: "Commercial" }), ["Prospects"]);
  // Les deux rôles d'administration le gardent, et un rôle vide ou absent
  // devient « Commercial » : il est reconnu, donc filtré lui aussi.
  for (const role of ["Admin VIP", "Superadmin"]) {
    assert.ok(sanitizeGrantedModules(["Utilisateurs"], { role }).includes("Utilisateurs"), role);
  }
  assert.deepEqual(sanitizeGrantedModules(["Utilisateurs"], { role: "" }), []);
  assert.deepEqual(sanitizeGrantedModules(["Utilisateurs"], {}), []);
});

test("catalog includes minimum étape 8 roles", () => {
  const roles = selectableRoles();
  for (const label of ["Admin VIP", "Superadmin", "Direction", "Responsable commercial", "Commercial", "Technicien", "Secrétariat", "Prospecteur terrain"]) {
    assert.ok(roles.includes(label), `missing ${label}`);
  }
  assert.ok(!roles.includes("Admin second"));
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
  assert.equal(canPerformAction(profile, "export_clients"), false);
  assert.equal(canPerformAction(profile, "delete_appointment"), false);
  assert.equal(canEditExistingAppointment(profile), false);
  assert.equal(locksFieldSalesData(profile.role), true);
  assert.equal(canPerformAction({
    ...profile,
    modules: [...profile.modules, "action:export_clients", "action:delete_appointment"],
  }, "export_clients"), false);
});

test("responsable commercial cannot edit existing appointments or export clients", () => {
  const profile = {
    role: "Responsable commercial",
    modules: [...roleModuleDefaults()["Responsable commercial"], "action:export_clients"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  assert.equal(locksFieldSalesData(profile.role), true);
  assert.equal(canEditExistingAppointment(profile), false);
  assert.equal(canPerformAction(profile, "export_clients"), false);
  assert.equal(canPerformAction(profile, "delete_appointment"), false);
});

test("admin can still edit appointments and export clients", () => {
  const profile = {
    role: "Admin VIP",
    modules: roleModuleDefaults()["Admin VIP"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  assert.equal(locksFieldSalesData(profile.role), false);
  assert.equal(canEditExistingAppointment(profile), true);
  assert.equal(canPerformAction(profile, "export_clients"), true);
  assert.equal(canPerformAction(profile, "delete_appointment"), true);
  assert.equal(canPerformAction(profile, "delete_prospects"), true);
});

test("l Admin VIP, le Superadmin et la responsable prospection peuvent supprimer un prospect", () => {
  const vip = {
    role: "Admin VIP",
    modules: roleModuleDefaults()["Admin VIP"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  const second = {
    role: "Superadmin",
    modules: roleModuleDefaults().Superadmin,
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  const dispatcher = {
    role: "Responsable prospection",
    modules: roleModuleDefaults()["Responsable prospection"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  assert.equal(canPerformAction(vip, "delete_prospects"), true);
  assert.equal(canPerformAction(second, "delete_prospects"), true);
  assert.equal(canPerformAction({ ...second, role: "Admin second" }, "delete_prospects"), true);
  assert.equal(canPerformAction(dispatcher, "delete_prospects"), true);
  assert.equal(canPerformAction({
    ...dispatcher,
    modules: [...dispatcher.modules, "action:delete_prospects"],
  }, "delete_prospects"), true);
  assert.equal(canEditExistingClient(vip), true);
  assert.equal(canEditExistingClient(second), true);
  assert.equal(canEditExistingClient(dispatcher), false);
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
  assert.equal(isAdminRole("Superadmin"), true);
  assert.equal(isAdminRole("Admin second"), true);
  assert.equal(canConfirmEntretienImport({ role: "Admin VIP" }), true);
  assert.equal(canConfirmEntretienImport({ role: "Direction" }), true);
  assert.equal(canConfirmEntretienImport({ role: "Commercial", realRole: "Admin VIP" }), true);
  assert.equal(canConfirmEntretienImport({ role: "Commercial" }), false);
  assert.equal(profileHasPermission(profile, "module:Utilisateurs"), true);
});

test("la responsable prospection peut enregistrer des articles sans devis", () => {
  const profile = {
    role: "Responsable prospection",
    modules: ["Tableau de bord", "Prospects", "Agenda commercial"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  assert.equal(canAccessModule(profile, "Gestion des articles"), true);
  assert.equal(canAccessModule(profile, "Parc automobile"), true);
  assert.equal(canManageArticles(profile), true);
  assert.equal(canReadArticles(profile), true);
  assert.equal(canAccessModule(profile, "Devis"), false);
  assert.equal(canAccessNav(resolveAllowedModules(profile, roleModuleDefaults()), "Gestion des articles"), true);
});

test("les modules coches sont conserves pour un responsable prospection", () => {
  const profile = {
    role: "Responsable prospection",
    modules: ["Tableau de bord", "Prospects", "Agenda commercial", "Gestion des articles"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  assert.deepEqual(grantedModules(profile), ["Tableau de bord", "Prospects", "Agenda commercial", "Gestion des articles", "Parc automobile", "Tickets internes"]);
  assert.equal(canAccessModule(profile, "Gestion des articles"), true);
  assert.equal(canAccessModule(profile, "Devis"), false);
  assert.deepEqual(sanitizeGrantedModules(["Prospect", "Articles", "Utilisateurs"], { role: "Commercial" }), ["Prospects", "Gestion des articles"]);
  const persisted = persistProfileAccess({
    role: "Responsable prospection",
    modules: ["Tableau de bord", "Prospects", "Agenda commercial"],
  });
  assert.ok(persisted.includes("Gestion des articles"));
  assert.ok(persisted.includes("Parc automobile"));
});

test("l Admin VIP a tous les droits y compris les fonctions exclusives", () => {
  const admin = {
    role: "Admin VIP",
    modules: ["Clients"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  const second = {
    role: "Superadmin",
    modules: roleModuleDefaults().Superadmin,
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  const manager = {
    role: "Responsable technique",
    modules: roleModuleDefaults()["Responsable technique"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  assert.equal(canPerformAction(admin, "delete_articles"), true);
  assert.equal(canPerformAction(admin, "dispatch_prospects"), true);
  assert.equal(canPerformAction(admin, "invite_users"), true);
  assert.equal(canAccessModule(admin, "Factures pro forma"), true);
  assert.equal(canAccessModule(admin, "Photovoltaïque administratif"), true);
  assert.equal(canPerformAction({
    ...second,
    modules: [...roleModuleDefaults().Superadmin, "action:delete_articles"],
  }, "delete_articles"), true);
  assert.equal(canPerformAction(second, "delete_articles"), false);
  assert.equal(canPerformAction(manager, "delete_articles"), false);
});

test("seul l Admin VIP peut attribuer VIP et une fonction exclusive", () => {
  assert.equal(assertAssignableAccess({
    actorRole: "Superadmin",
    nextRole: "Admin VIP",
  }).ok, false);
  assert.equal(assertAssignableAccess({
    actorRole: "Superadmin",
    nextRole: "Commercial",
    nextActions: ["action:delete_articles"],
  }).ok, false);
  assert.equal(assertAssignableAccess({
    actorRole: "Admin VIP",
    nextRole: "Admin VIP",
    nextActions: ["action:delete_articles"],
  }).ok, true);
  assert.deepEqual(selectableRoles("Superadmin").includes("Admin VIP"), false);
  assert.ok(selectableRoles("Admin VIP").includes("Admin VIP"));
  const kept = persistProfileAccess({
    modules: ["Clients", "action:delete_articles"],
    actions: ["action:delete_articles"],
    role: "Responsable technique",
    existingModules: ["Clients", "action:delete_articles"],
    actorRole: "Superadmin",
  });
  assert.ok(kept.includes("action:delete_articles"));
  const stripped = persistProfileAccess({
    modules: ["Clients"],
    actions: ["action:delete_articles"],
    role: "Responsable technique",
    existingModules: ["Clients"],
    actorRole: "Superadmin",
  });
  assert.ok(!stripped.includes("action:delete_articles"));
});

test("le prospecteur terrain n a que les fiches prospects", () => {
  const profile = {
    role: "Prospecteur terrain",
    modules: roleModuleDefaults()["Prospecteur terrain"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  assert.deepEqual(grantedModules(profile), ["Prospects"]);
  assert.equal(canAccessModule(profile, "Prospects"), true);
  assert.equal(canAccessModule(profile, "Agenda commercial"), false);
  assert.equal(canAccessModule(profile, "Clients"), false);
  assert.equal(canAccessModule(profile, "Devis"), false);
});

test("le technicien n a pas la vue d ensemble", () => {
  const stored = {
    role: "Technicien",
    modules: ["Tableau de bord", "Planning", "Chantiers", "Visites techniques", "Maintenance"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  assert.deepEqual(roleModuleDefaults().Technicien, ["Planning", "Chantiers", "Visites techniques", "Maintenance", "Tickets internes", "SAV"]);
  assert.deepEqual(grantedModules(stored), ["Planning", "Chantiers", "Visites techniques", "Maintenance", "Tickets internes", "SAV"]);
  assert.equal(canAccessModule(stored, "Tableau de bord"), false);
  assert.equal(canAccessModule(stored, "Maintenance"), true);
  assert.equal(canAccessNav(grantedModules(stored), "Vue d’ensemble"), false);
  const responsable = {
    role: "Responsable technique",
    modules: roleModuleDefaults()["Responsable technique"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  assert.equal(canAccessModule(responsable, "Tableau de bord"), true);
  assert.equal(canAccessModule(responsable, "Maintenance"), true);
  const responsableAncien = {
    role: "Responsable technique",
    modules: ["Tableau de bord", "Clients", "Planning", "Chantiers", "Maintenance"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  assert.equal(canAccessModule(responsableAncien, "Photovoltaïque administratif"), true);
  assert.equal(canAccessModule(responsableAncien, "Visites techniques"), true);
  assert.equal(canAccessNav(grantedModules(responsableAncien), "Photovoltaïque administratif"), true);
});
