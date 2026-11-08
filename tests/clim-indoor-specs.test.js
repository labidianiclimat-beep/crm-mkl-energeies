import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  climIndoorHeading,
  formatClimIndoorDescription,
  isClimIndoorPath,
  isClimIndoorSpecText,
  parseClimIndoorDescription,
} from "../app/lib/clim-indoor-specs.js";

test("la fiche interieure est reservee aux unites et consoles basses", () => {
  assert.equal(isClimIndoorPath({ category: "Climatisation", subcategory: "Unités intérieures" }), true);
  assert.equal(isClimIndoorPath({ category: "Climatisation", subcategory: "Unité intérieure" }), true);
  assert.equal(isClimIndoorPath({ category: "Climatisation", subcategory: "Console basse" }), true);
  assert.equal(isClimIndoorPath({ category: "Climatisation", subcategory: "Console" }), true);
  assert.equal(isClimIndoorPath({ category: "Climatisation", subcategory: "Consoles basses" }), true);
  assert.equal(isClimIndoorPath({ category: "Climatisation", subcategory: "Mono-split" }), false);
  assert.equal(isClimIndoorPath({ category: "Climatisation", subcategory: "Bi-split" }), false);
  assert.equal(isClimIndoorPath({ category: "Climatisation", subcategory: "Gainable" }), false);
  assert.equal(isClimIndoorPath({ category: "Climatisation", subcategory: "Unités intérieures", accessory: true }), false);
  assert.equal(climIndoorHeading("Console basse"), "CONSOLE BASSE");
  assert.equal(climIndoorHeading("Unités intérieures"), "UNITÉ INTÉRIEURE");
});

test("assemble la fiche interieure visible sur le devis", () => {
  const text = formatClimIndoorDescription(
    {
      coolingNominal: "2,5 kW",
      seer: "8,5",
      refrigerant: "R32",
      color: "Blanc",
    },
    { brand: "Toshiba", title: "RAS-B10J2KVG-E", subcategory: "Unités intérieures" }
  );
  assert.match(text, /^RAS-B10J2KVG-E/);
  assert.match(text, /UNITÉ INTÉRIEURE/);
  assert.match(text, /Marque : Toshiba/);
  assert.match(text, /Puissance frigorifique nominale : 2,5 kW/);
  assert.match(text, /SEER \(Efficacité Froid\) : 8,5/);
  assert.match(text, /Gaz réfrigérant : R32/);
  assert.ok(!/Poids net/.test(text));
});

test("recharge une fiche console basse existante", () => {
  const source = formatClimIndoorDescription(
    {
      heatingNominal: "3,2 kW",
      soundPressure: "21 / 25 / 32 / 41 dB(A)",
      condensateDiameter: "16 mm",
    },
    { brand: "Daikin", title: "FVXM25A", subcategory: "Console basse" }
  );
  const parsed = parseClimIndoorDescription(source);
  assert.ok(isClimIndoorSpecText(source));
  assert.match(source, /CONSOLE BASSE/);
  assert.equal(parsed.brand, "Daikin");
  assert.equal(parsed.heatingNominal, "3,2 kW");
  assert.equal(parsed.soundPressure, "21 / 25 / 32 / 41 dB(A)");
  assert.equal(parsed.condensateDiameter, "16 mm");
});

test("le formulaire interieur est branche au catalogue et au wizard", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  const fields = readFileSync(new URL("../app/components/clim-indoor-spec-fields.js", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../app/lib/clim-indoor-specs.js", import.meta.url), "utf8");
  assert.match(page, /ClimIndoorSpecFields/);
  assert.match(wizard, /ClimIndoorSpecFields/);
  assert.match(page, /isClimIndoorPath/);
  assert.match(wizard, /isClimIndoorPath/);
  assert.match(fields, /climIndoorHeading/);
  assert.match(lib, /Pression sonore \(U\.S \/ Min \/ Med \/ Max\)/);
  assert.match(lib, /Diamètres des liaisons/);
});
