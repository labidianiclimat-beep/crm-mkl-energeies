import assert from "node:assert/strict";
import test from "node:test";
import { buildQuoteLinesFromBundle, bundleDisplayedTotalHt, normalizeBundle } from "../app/lib/article-picker.js";
import { bundleToUi, formToBundleRecord, validateBundlePayload } from "../app/lib/article-bundles.js";
import { computeDocumentTotals, lineToDb, lineToUi } from "../app/lib/devis.js";
import { buildDevisArticleHtml } from "../app/lib/devis-print.js";

const panels = { code: "PV-P", name: "Panneau 500 W", price: 180, qty: 10, role: "principal", category: "Photovoltaïque", subcategory: "Panneaux" };
const inverter = { code: "HUA-SUN2000-6K-LB0", name: "Onduleur 6 kW", price: 1200, qty: 1, role: "principal", category: "Photovoltaïque", subcategory: "Onduleurs" };
const optimizer = { code: "PV-OPT", name: "Optimiseur", price: 70, qty: 10, role: "supply", category: "Photovoltaïque", subcategory: "Optimiseur" };

test("un groupe photovoltaïque peut porter un forfait saisi", () => {
  const bundle = normalizeBundle({
    name: "Pack 6 kWc",
    category: "Photovoltaïque",
    subcategory: "Onduleurs",
    pricingMode: "forfait",
    forfaitHt: 12500,
    forfaitTax: 20,
    items: [panels, inverter, optimizer],
  });
  assert.equal(bundle.pricingMode, "forfait");
  assert.equal(bundle.forfaitHt, 12500);
  assert.equal(bundleDisplayedTotalHt(bundle), 12500);
  assert.equal(bundle.items[0].price, 180);
  const record = formToBundleRecord(bundle);
  assert.equal(record.pricing_mode, "forfait");
  assert.equal(record.forfait_ht, 12500);
  assert.equal(record.forfait_tva, 20);
  assert.deepEqual(validateBundlePayload(record), []);
});

test("un groupe hors photovoltaïque garde le détail des prix", () => {
  const bundle = normalizeBundle({
    name: "Pack PAC",
    category: "Chauffage",
    pricingMode: "forfait",
    forfaitHt: 4000,
    items: [{ code: "PAC", name: "PAC", price: 6200, qty: 1, role: "principal" }],
  });
  assert.equal(bundle.pricingMode, "detail");
  assert.equal(bundle.forfaitHt, null);
  assert.equal(bundleDisplayedTotalHt(bundle), 6200);
});

test("le devis d un forfait liste les articles et ne compte que le montant saisi", () => {
  const bundle = normalizeBundle({
    id: "groupe-pv",
    name: "Pack 6 kWc",
    category: "Photovoltaïque",
    pricingMode: "forfait",
    forfaitHt: 10000,
    forfaitTax: 10,
    items: [panels, inverter, optimizer],
  });
  const lines = buildQuoteLinesFromBundle(bundle, [], { idBase: 1 });
  assert.equal(lines.length, 3);
  assert.equal(lines[0].name, "Panneau 500 W");
  assert.equal(lines[0].qty, 10);
  assert.equal(lines[0].unit, 0);
  assert.equal(lines[0].forfaitHt, 10000);
  assert.equal(lines[1].forfaitHt, null);
  assert.equal(lines[2].forfait, true);
  const totals = computeDocumentTotals({ items: lines, tax: 20 });
  assert.equal(totals.totalHT, 10000);
  assert.equal(Number(totals.totalTTC.toFixed(2)), 11000);
  assert.equal(totals.lines[1].totalHT, 0);
  const stored = lineToDb(lines[0], 0);
  const restored = lineToUi({ ...stored, id: "ligne-1", forfait: stored.forfait, forfait_montant_ht: stored.forfait_montant_ht });
  assert.equal(restored.forfait, true);
  assert.equal(restored.forfaitHt, 10000);
  const memberHtml = buildDevisArticleHtml(totals.lines[1]);
  assert.equal(memberHtml.includes("1 200"), false);
  assert.match(memberHtml, /Onduleur 6 kW/);
  const carrierHtml = buildDevisArticleHtml(totals.lines[0]);
  assert.match(carrierHtml, /10[\s\u202f\u00a0]000/);
  assert.match(carrierHtml, /10 %/);
  assert.match(carrierHtml, /11[\s\u202f\u00a0]000/);
  assert.equal(carrierHtml.includes("180,00"), false);
  assert.equal(memberHtml.includes("0,00"), false);
  assert.equal(memberHtml.includes("—"), false);
});

test("le forfait relu depuis la base reste un prix unique", () => {
  const ui = bundleToUi({
    id: "33333333-3333-4333-8333-333333333333",
    name: "Jinko Solar — JINKO SOLAR  54HL4M-BDV-500 W",
    category: "Photovoltaïque",
    subcategory: "Main-d’œuvre",
    family: "Main-d’œuvre",
    brand: "Jinko Solar",
    pricing_mode: "forfait",
    forfait_ht: "13300",
    forfait_tva: "20",
    actif: true,
    items: [
      { code: "54HL4M-BDV-500-W", name: "JINKO SOLAR  54HL4M-BDV-500 W", subcategory: "Panneaux", qty: 9, price: 650, role: "principal" },
      { code: "HUA-SUN2000-5K-MAP0", name: "Onduleur", subcategory: "Onduleurs", qty: 1, price: 0, role: "principal" },
    ],
  });
  assert.equal(ui.pricingMode, "forfait");
  assert.equal(ui.forfaitHt, 13300);
  const lines = buildQuoteLinesFromBundle(ui, []);
  assert.equal(lines[0].forfaitHt, 13300);
  assert.equal(lines[1].unit, 0);
  assert.equal(lines[1].forfaitHt, null);
});

test("un forfait sans montant est refusé", () => {
  const record = formToBundleRecord({
    name: "Pack",
    category: "Photovoltaïque",
    pricingMode: "forfait",
    forfaitHt: "",
    items: [inverter],
  });
  assert.ok(validateBundlePayload(record).includes("Indiquez le montant du forfait."));
});
