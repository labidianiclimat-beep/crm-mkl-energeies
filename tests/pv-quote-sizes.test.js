import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PV_QUOTE_SIZES, bundleMatchesPvSize } from "../app/lib/pv-quote-sizes.js";

test("les six puissances comptent les panneaux", () => {
  assert.deepEqual(
    PV_QUOTE_SIZES.map(item => [item.kwLabel, item.phaseLabel, item.panels]),
    [
      ["3 kW", "monophasé", 6],
      ["4,5 kW", "monophasé", 9],
      ["6 kW", "monophasé", 12],
      ["6 kW", "triphasé", 12],
      ["7,5 kW", "triphasé", 15],
      ["9 kW", "triphasé", 18],
    ]
  );
});

test("un groupe photovoltaïque suit la puissance et le courant", () => {
  const mono6 = PV_QUOTE_SIZES.find(item => item.id === "6-mono");
  const tri6 = PV_QUOTE_SIZES.find(item => item.id === "6-tri");
  const small = PV_QUOTE_SIZES.find(item => item.id === "3-mono");
  assert.equal(bundleMatchesPvSize({ name: "Pack 6 kW monophasé", category: "Photovoltaïque" }, mono6), true);
  assert.equal(bundleMatchesPvSize({ name: "Pack 6 kW monophasé", category: "Photovoltaïque" }, tri6), false);
  assert.equal(bundleMatchesPvSize({ name: "Pack 6 kW triphasé", category: "Photovoltaïque" }, tri6), true);
  assert.equal(bundleMatchesPvSize({ name: "Pack 3 kW monophasé", category: "Photovoltaïque" }, small), true);
  assert.equal(bundleMatchesPvSize({ name: "Pack 13 kW monophasé", category: "Photovoltaïque" }, small), false);
  assert.equal(bundleMatchesPvSize({ name: "PAC 9 kW triphasé", category: "Chauffage" }, PV_QUOTE_SIZES.find(item => item.id === "9-tri")), false);
  assert.equal(bundleMatchesPvSize({ name: "4,5 kW monophasé", category: "Photovoltaïque" }, PV_QUOTE_SIZES.find(item => item.id === "4.5-mono")), true);
});

test("le devis ouvre la page des puissances avant les groupes", () => {
  const wizard = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  assert.match(wizard, /setStep\("pv-sizes"\)/);
  assert.match(wizard, /taxonomyNamesEqual\(item\.name, "Photovoltaïque"\)/);
  assert.match(wizard, /bundleCount > 0 \|\| taxonomyNamesEqual\(item\.name, "Photovoltaïque"\)/);
  assert.match(wizard, /step === "pv-groups"/);
  assert.match(wizard, /pv-size-panels/);
});
