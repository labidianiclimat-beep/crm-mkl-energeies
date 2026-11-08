import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  collectDeletedIds,
  isDemoOrgRecord,
  isKnownOrgStateKey,
  isReadOnlyOrgStateKey,
  mergeOrgStateRecords,
  orgRevisionConflicts,
  ORG_STATE_KEYS,
  orgStateModuleForKey,
  stripDemoOrgRecords,
} from "../app/lib/org-state.js";

test("les clés d’état organisation sont connues", () => {
  assert.equal(isKnownOrgStateKey("mkl-contracts"), true);
  assert.equal(isKnownOrgStateKey("mkl-maintenance-reports"), true);
  assert.equal(isKnownOrgStateKey("mkl-users"), false);
  assert.equal(ORG_STATE_KEYS.length, 12);
  assert.equal(orgStateModuleForKey("mkl-pv-simulations"), "Études thermiques");
  assert.equal(isReadOnlyOrgStateKey("mkl-article-groups"), true);
  assert.equal(orgStateModuleForKey("mkl-pv-projects"), "Photovoltaïque administratif");
});

test("les enregistrements de démonstration sont retirés", () => {
  assert.equal(isDemoOrgRecord("mkl-contracts", { number: "ENT-2026-018" }), true);
  assert.equal(isDemoOrgRecord("mkl-suppliers", { email: "devis@solar-ouest.example" }), true);
  assert.equal(isDemoOrgRecord("mkl-technical-visits", { client: "Maison Durand", quoteNumber: "DEV-2026-042" }), true);
  assert.equal(isDemoOrgRecord("mkl-contracts", { number: "ENT-2026-200" }), false);
  const cleaned = stripDemoOrgRecords("mkl-suppliers", [
    { name: "Solar Distribution Ouest", email: "devis@solar-ouest.example" },
    { name: "Fournisseur réel", email: "achat@mkl-energies.fr" },
  ]);
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].email, "achat@mkl-energies.fr");
});

test("les modules métier ne passent plus par le stockage appareil", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../app/lib/use-org-state.js", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/org-state/route.js", import.meta.url), "utf8");
  for (const key of ORG_STATE_KEYS) {
    assert.ok(!new RegExp(`useStored\\("${key}"`).test(page), `${key} est encore lu par appareil`);
    if (key === "mkl-article-groups" || key === "mkl-maintenance-reports") continue;
    assert.match(page, new RegExp(`useRecordTable\\("${key}"\\)`));
  }
  assert.match(hook, /authFetch\(`\/api\/org-state/);
  assert.match(hook, /mkl-org-state-error/);
  assert.match(hook, /mkl-org-state-sync/);
  assert.match(page, /<SyncStatus\/>/);
  assert.match(page, /Enregistré pour l’équipe/);
  assert.doesNotMatch(hook, /await persistOrgState\(key, recovered\)/);
  assert.match(route, /requireApiSession/);
  assert.match(route, /canAccessModule/);
  assert.match(route, /mergeOrgStateRecords/);
  assert.match(route, /scopeFieldSalesRecords/);
  assert.match(route, /organization_id=eq/);
});

test("le rapport de maintenance n est plus seulement local", () => {
  const form = readFileSync(new URL("../app/maintenance-form/page.js", import.meta.url), "utf8");
  assert.match(form, /mkl-maintenance-reports/);
  assert.match(form, /saveSharedRecords/);
});

test("la fusion conserve les dossiers absents du client et honore les suppressions", () => {
  const current = [
    { id: 1, name: "Étude A", note: "serveur" },
    { id: 2, name: "Étude B" },
  ];
  const incoming = [{ id: 1, name: "Étude A", note: "local" }];
  const merged = mergeOrgStateRecords(current, incoming);
  assert.equal(merged.length, 2);
  assert.equal(merged.find(item => item.id === 1).note, "local");
  assert.equal(merged.find(item => item.id === 2).name, "Étude B");
  assert.deepEqual(collectDeletedIds(current, incoming), ["2"]);
  assert.equal(mergeOrgStateRecords(current, incoming, ["2"]).length, 1);
  assert.equal(orgRevisionConflicts("2026-10-06T08:00:00.000Z", "2026-10-06T07:00:00.000Z"), true);
  assert.equal(orgRevisionConflicts("2026-10-06T08:00:00.000Z", "2026-10-06T08:00:00.000Z"), false);
  assert.equal(orgRevisionConflicts("", "2026-10-06T08:00:00.000Z"), false);
  assert.equal(orgRevisionConflicts("2026-10-06T08:00:00.000Z", ""), false);
});
