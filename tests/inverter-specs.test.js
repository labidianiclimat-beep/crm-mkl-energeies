import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatInverterDescription,
  isInverterPath,
  isInverterSpecText,
  parseInverterDescription,
} from "../app/lib/inverter-specs.js";

test("la fiche onduleur est reservee a cette sous-categorie PV", () => {
  assert.equal(isInverterPath({ category: "Photovoltaïque", subcategory: "Onduleurs" }), true);
  assert.equal(isInverterPath({ category: "Photovoltaïque", subcategory: "Onduleur" }), true);
  assert.equal(isInverterPath({ category: "Photovoltaïque", subcategory: "Micro-onduleur" }), false);
  assert.equal(isInverterPath({ category: "Photovoltaïque", subcategory: "Panneaux" }), false);
  assert.equal(isInverterPath({ category: "Climatisation", subcategory: "Onduleurs" }), false);
  assert.equal(isInverterPath({ category: "Photovoltaïque", subcategory: "Onduleurs", accessory: true }), false);
});

test("assemble la fiche onduleur visible sur le devis sans marque", () => {
  const text = formatInverterDescription(
    {
      efficiencyMax: "97,8 %",
      recommendedPvPower: "7 500 Wp",
      maxInputVoltage: "600 V",
      ratedOutputPower: "5 000 W",
      maxApparentPower: "5 500 VA",
      ipRating: "IP66",
      gridStandards: "EN 50549-1, VDE-AR-N-4105, UTE C15-712",
    },
    { title: "Onduleur 5 kW" }
  );
  assert.match(text, /^Onduleur 5 kW/);
  assert.match(text, /ONDULEUR/);
  assert.match(text, /Efficacité maximale : 97,8 %/);
  assert.match(text, /Puissance PV maximale recommandée : 7 500 Wp/);
  assert.match(text, /Puissance de sortie nominale : 5 000 W/);
  assert.match(text, /Indice IP : IP66/);
  assert.ok(!/Marque/.test(text));
  assert.ok(!/Huawei|SUN2000|FusionSolar|LUNA2000/i.test(text));
  assert.ok(!/Courant de sortie maximal/.test(text));
});

test("recharge une fiche onduleur existante", () => {
  const source = formatInverterDescription(
    {
      mpptVoltageRange: "40–560 V",
      batteryVoltageRange: "350–560 Vdc",
      maxChargePower: "6 000 W",
      maxDischargePower: "5 500 W",
      acOvercurrent: "Oui",
      acOvervoltage: "Oui",
      dimensions: "425 × 376,5 × 150 mm",
    },
    { title: "Onduleur 5 kW" }
  );
  const parsed = parseInverterDescription(source);
  assert.ok(isInverterSpecText(source));
  assert.equal(parsed.mpptVoltageRange, "40–560 V");
  assert.equal(parsed.batteryVoltageRange, "350–560 Vdc");
  assert.equal(parsed.maxChargePower, "6 000 W");
  assert.equal(parsed.maxDischargePower, "5 500 W");
  assert.equal(parsed.acOvercurrent, "Oui");
  assert.equal(parsed.acOvervoltage, "Oui");
  assert.equal(parsed.dimensions, "425 × 376,5 × 150 mm");
});

test("le formulaire onduleur est branche au catalogue et au wizard", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  const fields = readFileSync(new URL("../app/components/inverter-spec-fields.js", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../app/lib/inverter-specs.js", import.meta.url), "utf8");
  assert.match(page, /InverterSpecFields/);
  assert.match(wizard, /InverterSpecFields/);
  assert.match(page, /isInverterPath/);
  assert.match(wizard, /isInverterPath/);
  assert.match(fields, /INVERTER_HEADING/);
  assert.ok(!/Marque/.test(fields));
  assert.ok(!/Huawei|SUN2000|FusionSolar/i.test(lib));
  assert.ok(!/Huawei|SUN2000|FusionSolar/i.test(fields));
  assert.match(lib, /Entrée \(PV\)/);
  assert.match(lib, /Entrée \(batterie DC\)/);
  assert.match(lib, /Protection contre les défauts d’arc/);
  assert.match(lib, /Normes de raccordement réseau/);
});
