import test from "node:test";
import assert from "node:assert/strict";
import {
  DEVIS_PICKER_CATEGORIES,
  articlesForPickerCategory,
  brandsForCategory,
  buildQuoteLineFromArticle,
  materialsForBrand,
} from "../app/lib/article-picker.js";

const sample = [
  { id: "1", code: "CLIM-1", name: "Split Toshiba", category: "Climatisation", brand: "Toshiba", sell: 900, tax: 20, status: "Actif" },
  { id: "2", code: "CLIM-2", name: "Split Daikin", category: "Climatisation", brand: "Daikin", sell: 1100, tax: 20, status: "Actif" },
  { id: "3", code: "PV-1", name: "Panneau Dualsun", category: "Photovoltaïque", brand: "Dualsun", sell: 189, tax: 20, status: "Actif" },
  { id: "4", code: "PV-MO", name: "Pose photovoltaïque", category: "Photovoltaïque", subcategory: "Main-d’œuvre", brand: "MKL", sell: 65, tax: 20, status: "Actif" },
  { id: "5", code: "OLD", name: "Ancien", category: "Climatisation", brand: "Toshiba", sell: 1, tax: 20, status: "Inactif" },
];

test("picker categories include PV and exclude main oeuvre as root", () => {
  const labels = DEVIS_PICKER_CATEGORIES.map(item => item.label);
  assert.ok(labels.includes("Photovoltaïque"));
  assert.ok(labels.includes("Climatisation"));
  assert.ok(labels.includes("Radiateur électrique"));
  assert.ok(labels.includes("Adoucisseur d’eau"));
  assert.equal(labels.includes("Main-d’œuvre"), false);
});

test("radiateur and adoucisseur are distinct picker families", () => {
  const catalog = [
    { id: "r1", code: "RAD-1", name: "Radiateur inertie", category: "Radiateur électrique", brand: "Atlantic", sell: 400, tax: 20, status: "Actif" },
    { id: "a1", code: "ADO-1", name: "Adoucisseur 20L", category: "Adoucisseur d’eau", brand: "BWT", sell: 890, tax: 20, status: "Actif" },
    { id: "c1", code: "PAC-1", name: "PAC air/eau", category: "Chauffage", brand: "Daikin", sell: 5000, tax: 20, status: "Actif" },
  ];
  assert.equal(articlesForPickerCategory(catalog, "radiateur-electrique").length, 1);
  assert.equal(articlesForPickerCategory(catalog, "adoucisseur-eau").length, 1);
  assert.equal(articlesForPickerCategory(catalog, "chauffage").length, 1);
});

test("brands and materials are scoped by category", () => {
  const brands = brandsForCategory(sample, "climatisation");
  assert.deepEqual(brands.map(b => b.name).sort(), ["Daikin", "Toshiba"]);
  const toshiba = materialsForBrand(sample, "climatisation", "Toshiba");
  assert.equal(toshiba.length, 1);
  assert.equal(toshiba[0].code, "CLIM-1");
});

test("photovoltaic category includes labor articles inside the family", () => {
  const list = articlesForPickerCategory(sample, "photovoltaique");
  assert.equal(list.length, 2);
  assert.ok(list.some(item => item.code === "PV-MO"));
});

test("inactive articles are hidden by default", () => {
  assert.equal(articlesForPickerCategory(sample, "climatisation").length, 2);
  assert.equal(articlesForPickerCategory(sample, "climatisation", { includeInactive: true }).length, 3);
});

test("buildQuoteLineFromArticle snapshots editable designation", () => {
  const line = buildQuoteLineFromArticle(sample[0], { qty: 2, name: "Split salon", discountValue: 5 });
  assert.equal(line.articleId, "1");
  assert.equal(line.qty, 2);
  assert.equal(line.name, "Split salon");
  assert.equal(line.code, "CLIM-1");
});
