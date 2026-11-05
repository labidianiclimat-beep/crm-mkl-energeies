import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  defaultHeatPumpWarranty,
  formatHeatPumpDescription,
  isHeatPumpPath,
  isHeatPumpSpecText,
  parseHeatPumpDescription,
} from "../app/lib/heat-pump-specs.js";

test("detecte une pompe a chaleur quelle que soit la marque", () => {
  assert.equal(isHeatPumpPath({ subcategory: "Pompe à chaleur" }), true);
  assert.equal(isHeatPumpPath({ subcategory: "Pompe à chaleur Duo" }), true);
  assert.equal(isHeatPumpPath({ subcategory: "PAC" }), true);
  assert.equal(isHeatPumpPath({ category: "Pompe à chaleur air/eau" }), true);
  assert.equal(isHeatPumpPath({ subcategory: "Radiateur électrique" }), false);
  assert.equal(isHeatPumpPath({ category: "Climatisation", subcategory: "Mono-split" }), false);
  assert.equal(isHeatPumpPath({ category: "Chauffage", subcategory: "Fourniture" }), false);
  assert.equal(isHeatPumpPath({ category: "Chauffage", subcategory: "Installation" }), false);
  assert.equal(isHeatPumpPath({ category: "Chauffage", subcategory: "Pompe à chaleur", sourceReference: "picker:fourniture" }), false);
  assert.equal(isHeatPumpPath({ category: "Chauffage", subcategory: "Pompe à chaleur", accessory: true }), false);
});

test("assemble la fiche PAC visible sur le devis", () => {
  const text = formatHeatPumpDescription(
    {
      eprel: "123456",
      refrigerant: "R32",
      scop: "4,6 / 3,8",
      warranty: defaultHeatPumpWarranty("Daikin"),
    },
    { brand: "Daikin", title: "Altherma 3 8 kW" }
  );
  assert.match(text, /^Altherma 3 8 kW/);
  assert.match(text, /Marque : Daikin/);
  assert.match(text, /Eprel : 123456/);
  assert.match(text, /Réfrigérant : R32/);
  assert.match(text, /SCOP 35°C \/ 55°C : 4,6 \/ 3,8/);
  assert.match(text, /sous conditions Daikin/);
  assert.ok(!/Niveau sonore/.test(text));
});

test("recharge une fiche PAC existante", () => {
  const source = formatHeatPumpDescription(
    {
      ademe: "PAC-AA-123",
      powerMinus7_35: "8,2 kW",
      copMinus7_35: "3,4",
      warranty: "- 2 ans pièces",
    },
    { brand: "Atlantic", title: "Alfea Extensa" }
  );
  const parsed = parseHeatPumpDescription(source);
  assert.ok(isHeatPumpSpecText(source));
  assert.equal(parsed.brand, "Atlantic");
  assert.equal(parsed.ademe, "PAC-AA-123");
  assert.equal(parsed.powerMinus7_35, "8,2 kW");
  assert.equal(parsed.copMinus7_35, "3,4");
  assert.match(parsed.warranty, /2 ans pièces/);
});

test("le formulaire article PAC est branche au catalogue et au wizard", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  assert.match(page, /HeatPumpSpecFields/);
  assert.match(wizard, /HeatPumpSpecFields/);
  assert.match(page, /isHeatPumpPath/);
  assert.match(wizard, /isHeatPumpPath/);
});
