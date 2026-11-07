import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PV_QUOTE_SIZES, bundleMatchesPvSize, bundleUsesMicroInverter } from "../app/lib/pv-quote-sizes.js";

test("les puissances comptent les panneaux", () => {
  assert.deepEqual(
    PV_QUOTE_SIZES.map(item => [item.kwLabel, item.phaseLabel, item.panels]),
    [
      ["3 kW", "monophasé", 6],
      ["4,5 kW", "monophasé", 9],
      ["4,5 kW", "triphasé", 9],
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
  const tri45 = PV_QUOTE_SIZES.find(item => item.id === "4.5-tri");
  assert.equal(bundleMatchesPvSize({ name: "4,5 kW triphasé Jinko", category: "Photovoltaïque" }, tri45), true);
  assert.equal(bundleMatchesPvSize({ name: "4,5 kW monophasé", category: "Photovoltaïque" }, tri45), false);
  assert.equal(bundleMatchesPvSize({ name: "Jinko Solar 54HL4M-BDV-500 W", category: "Photovoltaïque" }, tri45), false);
  const jinko = {
    name: "Jinko Solar — JINKO SOLAR  54HL4M-BDV-500 W",
    category: "Photovoltaïque",
    items: [
      { name: "JINKO SOLAR  54HL4M-BDV-500 W", subcategory: "Panneaux", qty: 9, description: "Puissance maximale (Pmax) STC : 500 Wp" },
      { name: "Onduleur hybride Huawei SUN2000-5K-MAP0 — 5 kW — Triphasé", subcategory: "Onduleurs", qty: 1 },
    ],
  };
  assert.equal(bundleMatchesPvSize(jinko, tri45), true);
  assert.equal(bundleMatchesPvSize(jinko, PV_QUOTE_SIZES.find(item => item.id === "4.5-mono")), false);
  assert.equal(bundleMatchesPvSize({
    ...jinko,
    items: [
      jinko.items[0],
      { name: "Onduleur 4 kW monophasé", subcategory: "Onduleurs", qty: 1 },
    ],
  }, PV_QUOTE_SIZES.find(item => item.id === "4.5-mono")), true);
});

test("le devis ouvre la page des puissances avant les groupes", () => {
  const wizard = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  assert.match(wizard, /setStep\("pv-sizes"\)/);
  assert.match(wizard, /taxonomyNamesEqual\(item\.name, "Photovoltaïque"\)/);
  assert.match(wizard, /bundleCount > 0 \|\| taxonomyNamesEqual\(item\.name, "Photovoltaïque"\)/);
  assert.match(wizard, /step === "pv-groups"/);
  assert.match(wizard, /pv-size-panels/);
  assert.match(wizard, /Photovoltaïque — onduleur centralisé/);
  assert.match(wizard, /Micro-onduleur/);
});

test("un groupe micro-onduleur se distingue de l onduleur centralisé", () => {
  const micro = { items: [{ name: "MICRO-ONDULEUR ENPHASE IQ9N-A-INT", subcategory: "Micro-onduleur", code: "IQ9N-A-INT" }] };
  const central = { items: [{ name: "Onduleur hybride Huawei SUN2000-5K-MAP0 — 5 kW — Triphasé", subcategory: "Onduleurs", code: "HUA-SUN2000-5K-MAP0" }] };
  assert.equal(bundleUsesMicroInverter(micro), true);
  assert.equal(bundleUsesMicroInverter(central), false);
});
