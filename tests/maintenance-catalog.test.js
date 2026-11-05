import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installationIdentityFromReports, maintenanceBrandCatalog, maintenanceMachineLabel, modelsForMaintenanceBrand } from "../app/lib/maintenance-catalog.js";

test("une marque n affiche que ses modeles enregistres", () => {
  const catalog = maintenanceBrandCatalog(
    [
      { name: "Daikin", active: true },
      { name: "Mitsubishi", active: true },
      { name: "Ancienne", active: false, status: "Inactif" },
    ],
    [
      { name: "Emura 3,5 kW", brand: "Daikin", active: true },
      { name: "Perfera 5 kW", brand: "Daikin", active: true },
      { name: "Zubadan 11 kW", brand: "Mitsubishi", active: true },
      { name: "Ancien modèle", brand: "Daikin", active: false, status: "Inactif" },
      { name: "Hors catalogue", brand: "Ancienne", active: true },
    ],
  );
  assert.deepEqual(catalog.map(item => item.name), ["Daikin", "Mitsubishi"]);
  assert.deepEqual(modelsForMaintenanceBrand(catalog, "Daikin"), ["Emura 3,5 kW", "Perfera 5 kW"]);
  assert.deepEqual(modelsForMaintenanceBrand(catalog, "Mitsubishi"), ["Zubadan 11 kW"]);
  assert.deepEqual(modelsForMaintenanceBrand(catalog, ""), []);
});

test("le rapport de maintenance propose les marques puis les modeles", () => {
  const form = readFileSync(new URL("../app/maintenance-form/page.js", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/maintenance/catalog/route.js", import.meta.url), "utf8");
  assert.match(form, /select name="brand"/);
  assert.match(form, /name="model"/);
  assert.match(form, /Saisir un autre modèle/);
  assert.match(form, /installationIdentityFromReports/);
  assert.match(form, /select name="refrigerant"[\s\S]*<option>R410A<\/option><option>R32<\/option><option>R290<\/option>/);
  assert.match(form, /modelsForMaintenanceBrand/);
  assert.match(form, /\/api\/maintenance\/catalog/);
  assert.match(route, /module: "Maintenance"/);
  assert.match(route, /maintenanceBrandCatalog/);
});

test("la marque le modele et le gaz restent pour l annee suivante", () => {
  const reports = [
    { id: "2025", clientId: "c1", client: "Jean Muller", brand: "Daikin", model: "Altherma maison", refrigerant: "R32", updatedAt: "2025-10-01" },
    { id: "autre", clientId: "c2", brand: "Mitsubishi", model: "Zubadan", refrigerant: "R290", updatedAt: "2026-01-01" },
  ];
  assert.deepEqual(installationIdentityFromReports(reports, { clientId: "c1", exceptId: "2026" }), {
    brand: "Daikin",
    model: "Altherma maison",
    refrigerant: "R32",
  });
  assert.equal(
    maintenanceMachineLabel({ id: "2026", client_id: "c1", title: "Entretien Jean Muller" }, reports),
    "Daikin · Altherma maison · R32",
  );
  assert.equal(
    maintenanceMachineLabel({ id: "2026", client_id: "c1", title: "Entretien Jean Muller" }, [
      ...reports,
      { id: "2026", clientId: "c1", brand: "Daikin", model: "Altherma maison", refrigerant: "R410A", updatedAt: "2026-10-02" },
    ]),
    "Daikin · Altherma maison · R410A",
  );
});
