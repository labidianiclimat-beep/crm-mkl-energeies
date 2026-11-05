import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatBatteryDescription,
  isBatteryPath,
  isBatterySpecText,
  parseBatteryDescription,
} from "../app/lib/battery-specs.js";

test("la fiche batterie est reservee a cette sous-categorie PV", () => {
  assert.equal(isBatteryPath({ category: "Photovoltaïque", subcategory: "Batteries" }), true);
  assert.equal(isBatteryPath({ category: "Photovoltaïque", subcategory: "Batterie" }), true);
  assert.equal(isBatteryPath({ category: "Photovoltaïque", subcategory: "Stockage" }), true);
  assert.equal(isBatteryPath({ category: "Photovoltaïque", subcategory: "Panneaux" }), false);
  assert.equal(isBatteryPath({ category: "Photovoltaïque", subcategory: "Onduleurs" }), false);
  assert.equal(isBatteryPath({ category: "Climatisation", subcategory: "Batteries" }), false);
  assert.equal(isBatteryPath({ category: "Photovoltaïque", subcategory: "Batteries", accessory: true }), false);
});

test("assemble la fiche batterie visible sur le devis sans marque", () => {
  const text = formatBatteryDescription(
    {
      coupling: "AC",
      cellTechnology: "LiFePO4",
      ratedCapacity: "5,12 kWh",
      usableEnergy: "5 kWh",
      maxOutputPower: "2,5 kW",
      peakOutputPower: "3,5 kW, 10 s",
      ipRating: "IP65",
    },
    { title: "Batterie 5 kWh" }
  );
  assert.match(text, /^Batterie 5 kWh/);
  assert.match(text, /BATTERIE/);
  assert.match(text, /Type de couplage : AC/);
  assert.match(text, /Capacité nominale : 5,12 kWh/);
  assert.match(text, /Énergie disponible : 5 kWh/);
  assert.match(text, /Puissance de sortie crête : 3,5 kW, 10 s/);
  assert.ok(!/Marque/.test(text));
  assert.ok(!/Marstek|Huawei|LUNA2000|VENUS|SUN2000/i.test(text));
  assert.ok(!/Courant de sortie nominale :/.test(text));
});

test("recharge une fiche batterie existante sans confondre les libelles proches", () => {
  const source = formatBatteryDescription(
    {
      gridVoltage: "230 V",
      gridVoltageRange: "187–253 V",
      nominalVoltageMono: "450 V",
      voltageRangeMono: "350–560 V",
      ratedOutputPower: "2,5 kVA",
      backupRatedPower: "2,5 kVA",
      backupPeakPower: "3,5 kVA, 10 s",
      dimensions: "480 × 153 × 624 mm",
      powerModuleDimensions: "670 × 150 × 240 mm",
    },
    { title: "Batterie 5 kWh" }
  );
  const parsed = parseBatteryDescription(source);
  assert.ok(isBatterySpecText(source));
  assert.equal(parsed.gridVoltage, "230 V");
  assert.equal(parsed.gridVoltageRange, "187–253 V");
  assert.equal(parsed.nominalVoltageMono, "450 V");
  assert.equal(parsed.voltageRangeMono, "350–560 V");
  assert.equal(parsed.ratedOutputPower, "2,5 kVA");
  assert.equal(parsed.backupRatedPower, "2,5 kVA");
  assert.equal(parsed.backupPeakPower, "3,5 kVA, 10 s");
  assert.equal(parsed.dimensions, "480 × 153 × 624 mm");
  assert.equal(parsed.powerModuleDimensions, "670 × 150 × 240 mm");
});

test("le formulaire batterie est branche au catalogue et au wizard", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  const fields = readFileSync(new URL("../app/components/battery-spec-fields.js", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../app/lib/battery-specs.js", import.meta.url), "utf8");
  assert.match(page, /BatterySpecFields/);
  assert.match(wizard, /BatterySpecFields/);
  assert.match(page, /isBatteryPath/);
  assert.match(wizard, /isBatteryPath/);
  assert.match(fields, /BATTERY_HEADING/);
  assert.ok(!/Marque/.test(fields));
  assert.ok(!/Marstek|Huawei|LUNA2000|VENUS|SUN2000/i.test(lib));
  assert.ok(!/Marstek|Huawei|LUNA2000|VENUS|SUN2000/i.test(fields));
  assert.match(lib, /Type de couplage/);
  assert.match(lib, /Énergie disponible/);
  assert.match(lib, /Puissance apparente max\. \(secours\)/);
  assert.match(lib, /Plage de tension \(système triphasé\)/);
  assert.match(lib, /Dimensions module batterie/);
});
