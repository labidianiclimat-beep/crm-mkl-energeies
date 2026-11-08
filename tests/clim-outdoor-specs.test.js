import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatClimOutdoorDescription,
  isClimOutdoorPath,
  isClimOutdoorSpecText,
  parseClimOutdoorDescription,
} from "../app/lib/clim-outdoor-specs.js";

test("la fiche groupe exterieur est reservee aux multi-splits", () => {
  assert.equal(isClimOutdoorPath({ category: "Climatisation", subcategory: "Bi-split" }), true);
  assert.equal(isClimOutdoorPath({ category: "Climatisation", subcategory: "B-split" }), true);
  assert.equal(isClimOutdoorPath({ category: "Climatisation", subcategory: "Tri-split" }), true);
  assert.equal(isClimOutdoorPath({ category: "Climatisation", subcategory: "Quadri-split" }), true);
  assert.equal(isClimOutdoorPath({ category: "Climatisation", subcategory: "5 unités" }), true);
  assert.equal(isClimOutdoorPath({ category: "Climatisation", subcategory: "Cinq unités" }), true);
  assert.equal(isClimOutdoorPath({ category: "Climatisation", subcategory: "Penta-split" }), true);
  assert.equal(isClimOutdoorPath({ category: "Climatisation", subcategory: "5 sorties" }), true);
  assert.equal(isClimOutdoorPath({ category: "Climatisation", subcategory: "Mono-split" }), false);
  assert.equal(isClimOutdoorPath({ category: "Climatisation", subcategory: "Unités intérieures" }), false);
  assert.equal(isClimOutdoorPath({ category: "Climatisation", subcategory: "Console basse" }), false);
  assert.equal(isClimOutdoorPath({ category: "Climatisation", subcategory: "Gainable" }), false);
  assert.equal(isClimOutdoorPath({ category: "Climatisation", subcategory: "Bi-split", accessory: true }), false);
  assert.equal(isClimOutdoorPath({ category: "Climatisation", subcategory: "Bi-split", sourceReference: "picker:fourniture" }), false);
});

test("assemble la fiche groupe exterieur visible sur le devis", () => {
  const text = formatClimOutdoorDescription(
    {
      coolingNominal: "5,0 kW",
      eerCop: "3,70 / 3,94",
      refrigerant: "R32",
      indoorCount: "2",
    },
    { brand: "Toshiba", title: "RAS-2M18G3AVG-E" }
  );
  assert.match(text, /^RAS-2M18G3AVG-E/);
  assert.match(text, /GROUPE EXTÉRIEUR/);
  assert.match(text, /Marque : Toshiba/);
  assert.match(text, /Puissance frigorifique nominale : 5,0 kW/);
  assert.match(text, /EER \/ COP : 3,70 \/ 3,94/);
  assert.match(text, /Nombre d'unités intérieures raccordables : 2/);
  assert.ok(!/Poids net/.test(text));
});

test("recharge une fiche groupe exterieur existante", () => {
  const source = formatClimOutdoorDescription(
    {
      heatingNominal: "5,6 kW",
      refrigerant: "R32",
      maxCurrent: "10,2 A",
    },
    { brand: "Daikin", title: "2MXM40A" }
  );
  const parsed = parseClimOutdoorDescription(source);
  assert.ok(isClimOutdoorSpecText(source));
  assert.equal(parsed.brand, "Daikin");
  assert.equal(parsed.heatingNominal, "5,6 kW");
  assert.equal(parsed.refrigerant, "R32");
  assert.equal(parsed.maxCurrent, "10,2 A");
});

test("le formulaire groupe exterieur est branche au catalogue et au wizard", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  const fields = readFileSync(new URL("../app/components/clim-outdoor-spec-fields.js", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../app/lib/clim-outdoor-specs.js", import.meta.url), "utf8");
  assert.match(page, /ClimOutdoorSpecFields/);
  assert.match(wizard, /ClimOutdoorSpecFields/);
  assert.match(page, /isClimOutdoorPath/);
  assert.match(wizard, /isClimOutdoorPath/);
  assert.match(fields, /GROUPE EXTÉRIEUR/);
  assert.match(lib, /Puissance frigorifique nominale/);
  assert.match(lib, /Intensité maximale/);
});
