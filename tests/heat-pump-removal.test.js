import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bundleIsHeatPumpRo,
  bundleOffersBoilerRemoval,
  heatPumpRemovalQuoteLines,
} from "../app/lib/heat-pump-removal.js";

const supply = {
  id: "sup-ro",
  code: "FRN-PAC-RO",
  name: "Fournitures pour pompe à chaleur RO",
  category: "Chauffage",
  subcategory: "Fourniture",
};

test("seul un groupe pompe à chaleur RO ouvre l’enlèvement", () => {
  const ro = {
    id: "g-ro",
    name: "Alfea Extensa 6",
    items: [
      { name: "Alfea Extensa 6", category: "Chauffage", subcategory: "Pompe à chaleur" },
      { articleId: "sup-ro", code: "FRN-PAC-RO", name: "Fourniture" },
    ],
  };
  const plain = {
    id: "g-pac",
    name: "Alfea Extensa 6",
    items: [{ name: "Alfea Extensa 6", category: "Chauffage", subcategory: "Pompe à chaleur" }],
  };
  assert.equal(bundleIsHeatPumpRo(ro, [supply]), true);
  assert.equal(bundleIsHeatPumpRo(plain, []), false);
  assert.equal(bundleOffersBoilerRemoval(plain, []), true);
  assert.equal(bundleOffersBoilerRemoval({
    name: "Alfea Extensa 6",
    category: "Chauffage",
    subcategory: "Pompe à chaleur",
    items: [{ name: "Alfea Extensa 6", code: "024123" }],
  }, []), true);
  assert.equal(bundleOffersBoilerRemoval({
    name: "Pack mural",
    category: "Climatisation",
    subcategory: "Mono-split",
    items: [{ name: "Unité extérieure", category: "Climatisation" }],
  }, []), false);
});

test("la chaudière fioul ajoute la cuve choisie, le gaz s’arrête à la chaudière", () => {
  const bundle = { id: "g-ro", name: "Pack RO" };
  const fuel = heatPumpRemovalQuoteLines({ boilerId: "fuel", tankId: "metal" }, bundle, { idBase: 10 });
  assert.equal(fuel.length, 2);
  assert.equal(fuel[0].name, "Enlèvement de chaudière fioul");
  assert.match(fuel[0].lineComment, /chaudière fioul/);
  assert.equal(fuel[0].unit, 0);
  assert.equal(fuel[0].tax, 5.5);
  assert.equal(fuel[1].name, "Enlèvement de cuve métallique");
  assert.equal(fuel[1].unit, 1500);
  assert.match(fuel[1].lineComment, /cuve fioul métallique/);
  assert.equal(fuel[1].bundleId, "g-ro");

  const plastic = heatPumpRemovalQuoteLines({ boilerId: "fuel", tankId: "plastic" }, bundle, { idBase: 20 });
  assert.equal(plastic[1].name, "Enlèvement de cuve plastique");
  assert.equal(plastic[1].unit, 1300);

  const gas = heatPumpRemovalQuoteLines({ boilerId: "gas", tankId: "metal" }, bundle, { idBase: 30 });
  assert.equal(gas.length, 1);
  assert.equal(gas[0].name, "Enlèvement de chaudière gaz");
  assert.match(gas[0].lineComment, /chaudière gaz/);
  assert.equal(gas[0].unit, 0);
});

test("la création de devis propose les deux menus après un groupe RO", () => {
  const wizard = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  assert.match(wizard, /bundleOffersBoilerRemoval/);
  assert.match(wizard, /step === "removal"/);
  assert.match(wizard, /HEAT_PUMP_BOILER_REMOVALS/);
  assert.match(wizard, /HEAT_PUMP_TANK_REMOVALS/);
  assert.match(wizard, /boiler\.needsTank/);
  assert.match(wizard, /heatPumpRemovalQuoteLines/);
});
