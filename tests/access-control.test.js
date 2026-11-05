import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACCESS_MODULES } from "../app/lib/roles.js";
import { canAccessNav, canAccessWorkspace, homeFamiliesForRole, resolveAllowedModules, workspaceTitle } from "../app/lib/access-control.js";

const roleDefaults = {
  "Admin VIP": ["Tableau de bord", "Clients", "Devis", "Utilisateurs"],
  Commercial: ["Tableau de bord", "Clients"],
};

test("commercial with Clients only keeps Clients plus ses apps d’accueil", () => {
  const profile = {
    role: "Commercial",
    modules: ["Clients"],
    active: true,
    onboarding_completed_at: new Date().toISOString(),
  };
  const allowed = resolveAllowedModules(profile, roleDefaults);
  assert.equal(canAccessNav(allowed, "Clients"), true);
  assert.equal(canAccessNav(allowed, "Devis"), true);
  assert.equal(canAccessNav(allowed, "Agenda commercial"), true);
  assert.equal(canAccessNav(allowed, "Suivi commerciaux"), true);
  assert.equal(canAccessNav(allowed, "Études thermiques"), true);
  assert.equal(canAccessNav(allowed, "Photovoltaïque administratif"), true);
  assert.equal(canAccessNav(allowed, "Études photovoltaïques"), true);
  assert.equal(canAccessWorkspace(allowed, "Photovoltaïque administratif", profile), false);
  assert.equal(canAccessWorkspace(allowed, "Études photovoltaïques", profile), true);
  assert.equal(canAccessNav(allowed, "Factures"), false);
  assert.equal(canAccessNav(allowed, "Simulateur photovoltaïque"), true);
});

test("la case Simulateur photovoltaïque ouvre l’écran sans étude thermique", () => {
  assert.equal(canAccessNav(["Simulateur photovoltaïque"], "Simulateur photovoltaïque"), true);
  assert.equal(canAccessNav(["Clients"], "Simulateur photovoltaïque"), false);
  assert.ok(ACCESS_MODULES.includes("Simulateur photovoltaïque"));
});

test("admin vip a toutes les applications meme si les defaults sont partiels", () => {
  const profile = {
    role: "Admin VIP",
    modules: ["Clients"],
    active: true,
    onboarding_completed_at: new Date().toISOString(),
  };
  const allowed = resolveAllowedModules(profile, roleDefaults);
  for (const module of ACCESS_MODULES) {
    assert.equal(canAccessNav(allowed, module), true, module);
  }
  assert.equal(canAccessNav(allowed, "Études photovoltaïques"), true);
});

test("les cases cochees donnent acces meme hors du role", () => {
  const profile = {
    role: "Responsable prospection",
    modules: ["Tableau de bord", "Prospects", "Agenda commercial", "Gestion des articles"],
    active: true,
    onboarding_completed_at: new Date().toISOString(),
  };
  const allowed = resolveAllowedModules(profile, roleDefaults);
  assert.equal(canAccessNav(allowed, "Gestion des articles"), true);
  assert.equal(canAccessNav(allowed, "Parc automobile"), true);
  assert.equal(canAccessNav(allowed, "Grilles tarifaires PDF"), true);
  assert.equal(canAccessNav(allowed, "Agenda commercial"), true);
  assert.equal(canAccessNav(allowed, "Vue d’ensemble"), true);
  assert.equal(canAccessNav(allowed, "Devis"), false);
});

test("un commercial avec Devis ouvre aussi les grilles tarifaires PDF", () => {
  const allowed = ["Devis", "Clients"];
  assert.equal(canAccessNav(allowed, "Grilles tarifaires PDF"), true);
  assert.equal(canAccessNav(["Prospects"], "Grilles tarifaires PDF"), false);
});

test("le logo et Applications reviennent toujours a l accueil des espaces", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /function openApplicationsHome/);
  assert.match(page, /onClick={openApplicationsHome}/);
  assert.match(page, /if\(label==="Applications"\)\{openApplicationsHome\(\);return;\}/);
  assert.match(page, /function goBack/);
  assert.match(page, /onClick={goBack}/);
  assert.match(page, /setSelectedFamily\(null\)/);
  assert.match(page, /selectedFamily={selectedFamily}/);
});

test("le technicien ne voit que la pastille Opérations", () => {
  const families = [
    { name: "Commercial", apps: [["Tickets internes"]] },
    { name: "Administration", apps: [["Maintenance"], ["SAV"]] },
    { name: "Opérations", apps: [["Planning"], ["Maintenance"], ["SAV"]] },
    { name: "Pilotage", apps: [["Chantiers"]] },
  ];
  assert.deepEqual(homeFamiliesForRole(families, "Technicien").map(family => family.name), ["Opérations"]);
  assert.deepEqual(homeFamiliesForRole(families, "Commercial").map(family => family.name), ["Commercial", "Administration", "Opérations", "Pilotage"]);
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /homeFamiliesForRole\(families, currentProfile\?\.role\)/);
  assert.match(page, /visibleFamilies\.map/);
  assert.equal(workspaceTitle("Maintenance", "Technicien"), "Mon agenda");
  assert.equal(workspaceTitle("Maintenance", "Secrétariat"), "Maintenance et agenda");
  assert.equal(workspaceTitle("Maintenance", "Direction"), "Maintenance et agenda");
  assert.equal(workspaceTitle("Maintenance", "Admin VIP"), "Maintenance");
  assert.match(page, /workspaceTitle\(label, currentRole\)/);
  assert.match(page, /workspaceTitle\(label, currentProfile\?\.role\)/);
});

test("le module grilles tarifaires PDF est dans le catalogue", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /Grilles tarifaires PDF/);
  assert.match(page, /TariffGridsView/);
});
