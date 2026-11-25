import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatMicroInverterDescription,
  isMicroInverterPath,
  isMicroInverterSpecText,
  parseMicroInverterDescription,
} from "../app/lib/micro-inverter-specs.js";

test("la fiche micro-onduleur est reservee a cette sous-categorie PV", () => {
  assert.equal(isMicroInverterPath({ category: "Photovoltaïque", subcategory: "Micro-onduleur" }), true);
  assert.equal(isMicroInverterPath({ category: "Photovoltaïque", subcategory: "Micro-onduleurs" }), true);
  assert.equal(isMicroInverterPath({ category: "Photovoltaïque", subcategory: "Onduleurs" }), false);
  assert.equal(isMicroInverterPath({ category: "Photovoltaïque", subcategory: "Panneaux" }), false);
  assert.equal(isMicroInverterPath({ category: "Climatisation", subcategory: "Micro-onduleur" }), false);
  assert.equal(isMicroInverterPath({ category: "Photovoltaïque", subcategory: "Micro-onduleur", accessory: true }), false);
});

test("assemble la fiche IQ9N visible sur le devis", () => {
  const text = formatMicroInverterDescription(
    {
      maxApparentPower: "427 VA",
      nominalPower: "427 W",
      maxInputPower: "600 W",
      efficiencyEu: "97,44 %",
      mppVoltage: "28/45 V",
      ipRating: "Extérieur – IP67",
      warranty: "25 ans",
    },
    { brand: "Enphase", title: "IQ9N-A-INT" }
  );
  assert.match(text, /^IQ9N-A-INT/);
  assert.match(text, /MICRO-ONDULEUR/);
  assert.match(text, /Marque : Enphase/);
  assert.match(text, /Puissance apparente maximale : 427 VA/);
  assert.match(text, /Puissance d’entrée maximale : 600 W/);
  assert.match(text, /Tension MPP min\.\/max\. : 28\/45 V/);
  assert.match(text, /Indice IP : Extérieur – IP67/);
  assert.ok(!/Courant de sortie maximal/.test(text));
});

test("recharge une fiche micro-onduleur existante", () => {
  const source = formatMicroInverterDescription(
    {
      gridVoltage: "230 V",
      gridVoltageRange: "184/276 V",
      frequency: "50 Hz",
      dimensions: "214 × 176 × 30,8 mm",
      dcConnector: "MC4 Stäubli",
      maxUnitsPerCable: "7 (L+N)/15 (3L+N)",
    },
    { brand: "Enphase", title: "IQ9N-A-INT" }
  );
  const parsed = parseMicroInverterDescription(source);
  assert.ok(isMicroInverterSpecText(source));
  assert.equal(parsed.brand, "Enphase");
  assert.equal(parsed.gridVoltage, "230 V");
  assert.equal(parsed.gridVoltageRange, "184/276 V");
  assert.equal(parsed.frequency, "50 Hz");
  assert.equal(parsed.dimensions, "214 × 176 × 30,8 mm");
  assert.equal(parsed.dcConnector, "MC4 Stäubli");
  assert.equal(parsed.maxUnitsPerCable, "7 (L+N)/15 (3L+N)");
});

test("le formulaire micro-onduleur est branche au catalogue et au wizard", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  const fields = readFileSync(new URL("../app/components/micro-inverter-spec-fields.js", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../app/lib/micro-inverter-specs.js", import.meta.url), "utf8");
  assert.match(page, /MicroInverterSpecFields/);
  assert.match(wizard, /MicroInverterSpecFields/);
  assert.match(page, /isMicroInverterPath/);
  assert.match(wizard, /isMicroInverterPath/);
  assert.match(fields, /MICRO_INVERTER_HEADING/);
  assert.match(fields, /DSH-00751/);
  assert.match(lib, /Données d’entrée \(DC\)/);
  assert.match(lib, /Tension MPP min\.\/max\./);
  assert.match(lib, /IQ Cabling/);
  assert.match(lib, /Conformité au réseau \(avec IQ Relay\)/);
  assert.match(lib, /Unités maximales par section de IQ Cable/);
});
