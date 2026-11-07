import assert from "node:assert/strict";
import test from "node:test";
import { computeDocumentTotals } from "../app/lib/devis.js";
import {
  PV_BATTERY_OPTION,
  PV_CONNECTION_OPTIONS,
  PV_OPTIMIZER_OPTION,
  applyPvBundleOptions,
  htForExactTtc,
  selectedPvOptions,
} from "../app/lib/pv-quote-options.js";

const group = [
  { id: "p1", code: "PV-P", name: "Panneau", category: "Photovoltaïque", qty: 8, unit: 180, tax: 5.5, bundleId: "g1", bundleName: "Pack PV" },
  { id: "o1", code: "HUA-SUN2000-6K-LB0", name: "Onduleur", category: "Photovoltaïque", qty: 1, unit: 0, tax: 20, bundleId: "g1", bundleName: "Pack PV" },
];

test("les montants TTC tombent juste avec la TVA 5,5 %", () => {
  for (const ttc of [400, 1000, 125, 5000]) {
    const ht = htForExactTtc(ttc, 5.5);
    const totals = computeDocumentTotals({ items: [{ qty: 1, unit: ht, tax: 5.5 }], tax: 20 });
    assert.equal(Number(totals.totalTTC.toFixed(2)), ttc);
  }
});

test("raccordement, optimiseur et batterie s ajoutent sous le groupe", () => {
  let items = applyPvBundleOptions(group, 1, { connection: "linky" });
  items = applyPvBundleOptions(items, 1, { optimizer: PV_OPTIMIZER_OPTION.id });
  items = applyPvBundleOptions(items, 1, { battery: PV_BATTERY_OPTION.id });
  assert.deepEqual(items.map(item => item.code), [
    "PV-P",
    "HUA-SUN2000-6K-LB0",
    "PV-RACCORD-LINKY",
    "PV-OPTIMISEUR",
    "PV-BAT-MARSTEK",
  ]);
  assert.equal(items[2].name, "Raccordement avec Linky en place");
  assert.equal(items[3].name, "OPTIMISEUR");
  assert.equal(items[4].name, "BAT-MARTEK VENUS-E");
  const withCatalog = applyPvBundleOptions(group, 1, { battery: PV_BATTERY_OPTION.id }, [{
    code: "MARSTEK-VENUS-E",
    name: "BAT-MARTEK VENUS-E",
    description: "BAT-MARTEK VENUS-E\n\nBATTERIE\n\nTension nominale batterie : 51,2 V",
  }]);
  const battery = withCatalog.find(item => item.code === PV_BATTERY_OPTION.code);
  assert.match(battery.description, /Tension nominale batterie/);
  assert.match(battery.lineComment, /Tension nominale batterie/);
  assert.match(battery.description, /BATTERIE/);
  const totals = computeDocumentTotals({ items, tax: 20 });
  assert.equal(Number(totals.lines[2].totalTTC.toFixed(2)), 400);
  assert.equal(Number(totals.lines[3].totalTTC.toFixed(2)), 125);
  assert.equal(Number(totals.lines[4].totalTTC.toFixed(2)), 5000);
  assert.equal(items[2].bundleId, "g1");
});

test("sans optimiseur la ligne n apparait pas", () => {
  let items = applyPvBundleOptions(group, 0, { optimizer: PV_OPTIMIZER_OPTION.id, connection: "sans-linky" });
  assert.equal(selectedPvOptions(items, 0).optimizer, PV_OPTIMIZER_OPTION.id);
  items = applyPvBundleOptions(items, 0, { optimizer: "" });
  assert.equal(items.some(item => item.code === PV_OPTIMIZER_OPTION.code), false);
  assert.equal(items.some(item => item.code === PV_CONNECTION_OPTIONS[1].code), true);
  assert.equal(items.find(item => item.code === PV_CONNECTION_OPTIONS[1].code).name, "Raccordement sans Linky en place");
});

test("un groupe chauffage ne recoit pas ces lignes", () => {
  const heating = [{ id: "pac", code: "PAC", name: "PAC", category: "Chauffage", qty: 1, unit: 1000, tax: 5.5, bundleId: "h1", bundleName: "Pack PAC" }];
  const next = applyPvBundleOptions(heating, 0, { connection: "linky", optimizer: PV_OPTIMIZER_OPTION.id, battery: PV_BATTERY_OPTION.id });
  assert.equal(next.length, 1);
});
