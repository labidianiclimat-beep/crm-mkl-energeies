import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { grantedModules, roleModuleDefaults } from "../app/lib/roles.js";
import { canAccessModule } from "../app/lib/permissions.js";
import { canAccessNav, resolveAllowedModules } from "../app/lib/access-control.js";
import {
  COMMERCIAL_HOME_APPS,
  commercialHomeFirstName,
  usesCommercialHome,
  withCommercialHomeModules,
} from "../app/lib/commercial-home.js";

test("l’accueil commercial est réservé au rôle Commercial", () => {
  assert.equal(usesCommercialHome("Commercial"), true);
  assert.equal(usesCommercialHome("Admin VIP"), false);
  assert.equal(usesCommercialHome("Responsable commercial"), false);
  assert.equal(commercialHomeFirstName("Camille Martin"), "Camille");
});

test("les applications iPhone sont RDV, Agenda, Devis, thermique, PV et véhicule", () => {
  assert.deepEqual(COMMERCIAL_HOME_APPS.map(app => app.id), ["rdv", "agenda", "devis", "thermal", "pv", "fleet"]);
  assert.deepEqual(COMMERCIAL_HOME_APPS.map(app => app.target), [
    "Suivi commerciaux",
    "Agenda commercial",
    "Devis",
    "Études thermiques",
    "Études photovoltaïques",
    "Parc automobile",
  ]);
});

test("un commercial a toujours accès aux apps de son écran d’accueil", () => {
  const profile = {
    role: "Commercial",
    modules: ["Prospects"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  };
  const modules = grantedModules(profile);
  assert.ok(modules.includes("Agenda commercial"));
  assert.ok(modules.includes("Devis"));
  assert.ok(modules.includes("Études thermiques"));
  assert.ok(modules.includes("Photovoltaïque administratif"));
  assert.equal(canAccessModule(profile, "Photovoltaïque administratif"), true);
  const allowed = resolveAllowedModules(profile, roleModuleDefaults());
  assert.equal(canAccessNav(allowed, "Études photovoltaïques"), true);
  assert.deepEqual(
    withCommercialHomeModules(["Prospects"], "Commercial").filter(item => item !== "Prospects").sort(),
    ["Agenda commercial", "Devis", "Photovoltaïque administratif", "Études thermiques"].sort(),
  );
});

test("l accueil n affiche plus le visuel iPhone ni le bouton commercial", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.doesNotMatch(page, /usesCommercialHome/);
  assert.doesNotMatch(page, /CommercialHomePreviewButton/);
  assert.doesNotMatch(page, /<CommercialHome /);
  assert.doesNotMatch(page, /InstallAppButton/);
  assert.match(page, /applications-home/);
  assert.equal([...page.matchAll(/Mes applications/g)].length, 1);
  assert.doesNotMatch(page, /1,84 MWc/);
  assert.doesNotMatch(page, /214 kWc/);
  assert.doesNotMatch(page, /<em>34<\/em>/);
});

test("l accueil commercial utilise le blanc le jaune et le bleu MKL", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const home = readFileSync(new URL("../app/lib/commercial-home.js", import.meta.url), "utf8");
  assert.match(css, /\.iphone-wallpaper\{[\s\S]*?#fff/);
  assert.match(css, /\.iphone-bezel\{[^}]*#ffcc00/);
  assert.match(css, /\.iphone-brand\{/);
  assert.match(css, /\.iphone-logo\{/);
  assert.match(home, /#405fae/);
  assert.match(home, /#ffcc00/);
});
