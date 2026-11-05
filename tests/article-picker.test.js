import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  articlesForPath,
  brandsForPath,
  priceTtc,
  sellHtFromInput,
  brandsForCreate,
  buildPickerCrumbs,
  buildBundleItemFromArticle,
  buildQuoteLineFromArticle,
  buildQuoteLinesFromBundle,
  bundleItemSellPrice,
  bundlesForPath,
  articleFormSubcategories,
  catalogPathIds,
  formatArticlePower,
  isPersistedTaxonomyId,
  isBundleActive,
  mergeBrandsWithBundles,
  brandsForPickerIntent,
  articleBundleRole,
  articlesForBundleRole,
  articleIsInBundles,
  bundlesContainingArticle,
  syncArticlePriceIntoBundles,
  bundleTotalHt,
  moveBundleItems,
  normalizeBundle,
  suggestBundleName,
  PICKER_FAMILIES,
  PICKER_SUBFAMILIES,
  pickerCategories,
  pickerSubcategories,
  persistPickerSubcategory,
  pickerVariants,
  resolveBundlePath,
  searchArticlesByReference,
} from "../app/lib/article-picker.js";
import { isHeatPumpPath } from "../app/lib/heat-pump-specs.js";

const categories = [
  { id: "cat-clim", name: "Climatisation", icon: "Snowflake", sortOrder: 10, active: true },
  { id: "cat-pv", name: "Photovoltaïque", icon: "Sun", sortOrder: 20, active: true },
  { id: "cat-iso", name: "Isolation", icon: "Home", sortOrder: 30, active: true },
];

const subcategories = [
  { id: "sub-mono", categoryId: "cat-clim", name: "Mono-split", sortOrder: 10, active: true },
  { id: "sub-bi", categoryId: "cat-clim", name: "Bi-split", sortOrder: 20, active: true },
  { id: "sub-ite", categoryId: "cat-iso", name: "Isolation extérieure", sortOrder: 10, active: true },
  { id: "sub-panels", categoryId: "cat-pv", name: "Panneaux", sortOrder: 10, active: true },
  { id: "sub-labor", categoryId: "cat-pv", name: "Main-d’œuvre", sortOrder: 20, active: true },
];

const sample = [
  { id: "1", code: "CLIM-1", name: "Split Toshiba", category: "Climatisation", categoryId: "cat-clim", subcategory: "Mono-split", subcategoryId: "sub-mono", brand: "Toshiba", sell: 900, tax: 20, status: "Actif", powerW: 2500 },
  { id: "2", code: "CLIM-2", name: "Split Daikin", category: "Climatisation", categoryId: "cat-clim", subcategory: "Mono-split", subcategoryId: "sub-mono", brand: "Daikin", sell: 1100, tax: 20, status: "Actif" },
  { id: "3", code: "CLIM-3", name: "Bi-split Midea", category: "Climatisation", categoryId: "cat-clim", subcategory: "Bi-split", subcategoryId: "sub-bi", brand: "Midea", sell: 1800, tax: 20, status: "Actif" },
  { id: "4", code: "PV-1", name: "Panneau Dualsun", category: "Photovoltaïque", categoryId: "cat-pv", subcategory: "Panneaux", subcategoryId: "sub-panels", brand: "Dualsun", sell: 189, tax: 20, status: "Actif" },
  { id: "5", code: "PV-MO", name: "Pose photovoltaïque", category: "Photovoltaïque", categoryId: "cat-pv", subcategory: "Main-d’œuvre", subcategoryId: "sub-labor", brand: "MKL", sell: 65, tax: 20, status: "Actif" },
  { id: "6", code: "OLD", name: "Ancien", category: "Climatisation", categoryId: "cat-clim", subcategory: "Mono-split", brand: "Toshiba", sell: 1, tax: 20, status: "Inactif" },
  { id: "7", code: "CLIM-LEGACY", name: "Console sans sous-cat", category: "Climatisation", categoryId: "cat-clim", subcategory: "", brand: "Panasonic", sell: 1200, tax: 20, status: "Actif" },
];

test("picker categories follow the commercial family order", () => {
  const labels = pickerCategories(categories, sample).map(item => item.name);
  assert.deepEqual(labels, PICKER_FAMILIES.map(item => item.name));
  assert.ok(!labels.includes("Main-d’œuvre"));
  assert.ok(!labels.includes("Pompe à chaleur"));
});

test("heating aliases land in the Chauffage family", () => {
  const families = pickerCategories(categories, [
    ...sample,
    { id: "8", code: "PAC-1", name: "PAC air/eau", category: "Pompe à chaleur", sell: 4200, tax: 20, status: "Actif" },
    { id: "9", code: "RAD-1", name: "Radiateur inertie", category: "Chauffage électrique", sell: 380, tax: 20, status: "Actif" },
  ]);
  assert.equal(families[0].name, "Chauffage");
  assert.equal(families[0].count, 2);
  assert.equal(families.find(item => item.name === "Climatisation").count, 4);
});

test("le formulaire article propose PAC meme si la base n a que Radiateur", () => {
  const chauffage = { id: "cat-heat", name: "Chauffage", icon: "Flame", active: true };
  const dbSubs = [{ id: "sub-rad", categoryId: "cat-heat", name: "Radiateur électrique", active: true }];
  const options = articleFormSubcategories(chauffage, dbSubs, {
    category: "Chauffage",
    subcategory: "Pompe à chaleur Duo",
  });
  const names = options.map(item => item.name);
  assert.ok(names.includes("Pompe à chaleur"));
  assert.ok(names.includes("Pompe à chaleur Duo"));
  assert.ok(!names.includes("Fourniture"));
  assert.ok(!names.includes("Installation"));
  assert.ok(names.includes("Brique réfractaire partielle standard blanc"));
  assert.ok(names.includes("Accessoires"));
  assert.equal(options.find(item => item.name === "Pompe à chaleur Duo")?.name, "Pompe à chaleur Duo");
});

test("Chauffage opens four commercial sub-tabs", () => {
  const heatingArticles = [
    { id: "8", code: "PAC-1", name: "PAC air/eau", category: "Pompe à chaleur", sell: 4200, tax: 20, status: "Actif" },
    { id: "9", code: "RAD-1", name: "Radiateur inertie", category: "Chauffage électrique", sell: 380, tax: 20, status: "Actif" },
    { id: "10", code: "GAZ-1", name: "Chaudière condensation", category: "Chauffage", subcategory: "Chaudière gaz", sell: 2100, tax: 20, status: "Actif" },
    { id: "11", code: "POELE-1", name: "Poêle à granulés", category: "Chauffage", subcategory: "Poêle", sell: 890, tax: 20, status: "Actif" },
  ];
  const heat = pickerCategories([], heatingArticles).find(item => item.name === "Chauffage");
  const tabs = pickerSubcategories(heat, [], heatingArticles);
  assert.deepEqual(
    tabs.map(item => item.name),
    PICKER_SUBFAMILIES.Chauffage.map(item => item.name)
  );
  assert.equal(tabs.find(item => item.name === "Pompe à chaleur").count, 1);
  assert.equal(tabs.find(item => item.name === "Radiateur électrique").count, 1);
  assert.equal(tabs.find(item => item.name === "Chaudière gaz").count, 1);
  assert.equal(tabs.find(item => item.name === "Autre").count, 1);
});

test("climatisation propose unites interieures et console basse", () => {
  const clim = pickerCategories([], []).find(item => item.name === "Climatisation");
  const names = pickerSubcategories(clim, [], []).map(item => item.name);
  assert.deepEqual(names, [
    "Mono-split",
    "Bi-split",
    "Tri-split",
    "Quadri-split",
    "5 unités",
    "Unités intérieures",
    "Console basse",
    "Gainable",
    "Fourniture",
    "Installation",
  ]);
  const consoleBasse = pickerSubcategories(clim, [
    { id: "sub-console", categoryId: clim.id, name: "Console", sortOrder: 60, active: true },
  ], [
    { id: "c1", code: "CON-1", name: "Console Toshiba", category: "Climatisation", subcategory: "Console", sell: 890, tax: 20, status: "Actif" },
  ]).find(item => item.name === "Console basse");
  assert.equal(consoleBasse.count, 1);
});

test("VMC isolation and hot water open their commercial sub-tabs", () => {
  const catalog = [
    { id: "v1", code: "VMC-S", name: "VMC SF", category: "VMC", subcategory: "Simple flux", sell: 420, tax: 20, status: "Actif" },
    { id: "v2", code: "VMC-D", name: "VMC DF", category: "VMC", subcategory: "Double flux", sell: 980, tax: 20, status: "Actif" },
    { id: "i1", code: "ISO-C", name: "Laine combles", category: "Isolation", subcategory: "Isolation des combles", sell: 18, tax: 20, status: "Actif" },
    { id: "i2", code: "ISO-R", name: "Laine rampants", category: "Isolation", subcategory: "Rampants", sell: 22, tax: 20, status: "Actif" },
    { id: "i3", code: "ISO-E", name: "ITE", category: "Isolation extérieure", sell: 45, tax: 20, status: "Actif" },
    { id: "i4", code: "ISO-I", name: "ITI", category: "Isolation", subcategory: "Isolation intérieure", sell: 28, tax: 20, status: "Actif" },
    { id: "b1", code: "BAL-T", name: "Ballon thermo", category: "Ballon thermodynamique", sell: 1200, tax: 20, status: "Actif" },
    { id: "b2", code: "BAL-E", name: "Ballon élec", category: "Ballon d'eau chaude", subcategory: "Ballon électrique", sell: 380, tax: 20, status: "Actif" },
  ];
  const families = pickerCategories([], catalog);

  const vmc = pickerSubcategories(families.find(item => item.name === "VMC"), [], catalog);
  assert.deepEqual(vmc.map(item => item.name), ["VMC simple flux", "VMC double flux"]);
  assert.equal(vmc.find(item => item.name === "VMC simple flux").count, 1);
  assert.equal(vmc.find(item => item.name === "VMC double flux").count, 1);

  const isolation = pickerSubcategories(families.find(item => item.name === "Isolation"), [], catalog);
  assert.deepEqual(isolation.map(item => item.name), [
    "Isolation des combles",
    "Isolation des rampants",
    "Isolation extérieure",
    "Isolation intérieure",
    "Isolation du plancher bas",
  ]);
  assert.equal(isolation.find(item => item.name === "Isolation des combles").count, 1);
  assert.equal(isolation.find(item => item.name === "Isolation des rampants").count, 1);
  assert.equal(isolation.find(item => item.name === "Isolation extérieure").count, 1);
  assert.equal(isolation.find(item => item.name === "Isolation intérieure").count, 1);
  assert.equal(isolation.find(item => item.name === "Isolation du plancher bas").count, 0);

  const ballon = pickerSubcategories(families.find(item => item.name === "Ballon d’eau chaude"), [], catalog);
  assert.deepEqual(ballon.map(item => item.name), ["Ballon thermodynamique", "Ballon électrique"]);
  assert.equal(ballon.find(item => item.name === "Ballon thermodynamique").count, 1);
  assert.equal(ballon.find(item => item.name === "Ballon électrique").count, 1);
});

test("family cards expose subcategories from aliased taxonomy rows", () => {
  const clim = pickerCategories(categories, sample).find(item => item.name === "Climatisation");
  const names = pickerSubcategories(clim, subcategories, sample).map(item => item.name);
  assert.ok(names.includes("Mono-split"));
  assert.ok(names.includes("Bi-split"));
  assert.ok(names.includes("Unités intérieures"));
  assert.ok(names.includes("Console basse"));
  assert.ok(!names.includes("Console"));
});

test("subcategories are scoped to the selected category", () => {
  const clim = categories[0];
  const names = pickerSubcategories(clim, subcategories, sample).map(item => item.name);
  assert.deepEqual(names, PICKER_SUBFAMILIES.Climatisation.map(item => item.name));
  assert.ok(!names.includes("Panneaux"));
  assert.ok(!names.includes("Isolation extérieure"));
});

test("brands and articles are scoped by category + subcategory", () => {
  const path = { category: categories[0], subcategory: subcategories[0] };
  const brands = brandsForPath(sample, path);
  assert.deepEqual(brands.map(item => item.name).sort(), ["Daikin", "Toshiba"]);
  const toshiba = articlesForPath(sample, { ...path, brand: "Toshiba" });
  assert.equal(toshiba.length, 1);
  assert.equal(toshiba[0].code, "CLIM-1");
});

test("photovoltaic labor stays inside the family as a subcategory", () => {
  const list = articlesForPath(sample, {
    category: categories[1],
    subcategory: subcategories[4],
    brand: "MKL",
  });
  assert.equal(list.length, 1);
  assert.equal(list[0].code, "PV-MO");
});

test("photovoltaique propose micro-onduleur a cote des onduleurs", () => {
  const pv = pickerCategories([], []).find(item => item.name === "Photovoltaïque");
  const names = pickerSubcategories(pv, [], []).map(item => item.name);
  assert.deepEqual(names, ["Panneaux", "Onduleurs", "Micro-onduleur", "Batteries", "Optimiseur", "Main-d’œuvre"]);
  const catalog = [
    { id: "p1", code: "PV-P", name: "Panneau Dualsun", category: "Photovoltaïque", subcategory: "Panneaux", sell: 189, tax: 20, status: "Actif" },
    { id: "o1", code: "PV-O", name: "Onduleur 6 kW", category: "Photovoltaïque", subcategory: "Onduleurs", sell: 980, tax: 20, status: "Actif" },
    { id: "m1", code: "PV-M", name: "Micro-onduleur IQ8", category: "Photovoltaïque", subcategory: "Onduleurs", sell: 210, tax: 20, status: "Actif" },
    { id: "m2", code: "PV-M2", name: "IQ8P", category: "Photovoltaïque", subcategory: "Micro-onduleur", sell: 220, tax: 20, status: "Actif" },
    { id: "b1", code: "PV-B", name: "Batterie 5 kWh", category: "Photovoltaïque", subcategory: "Batteries", sell: 3200, tax: 20, status: "Actif" },
    { id: "opt1", code: "PV-OPT", name: "Optimiseur P401", category: "Photovoltaïque", subcategory: "Optimiseur", sell: 70, tax: 20, status: "Actif" },
    { id: "l1", code: "PV-L", name: "Pose photovoltaïque", category: "Photovoltaïque", subcategory: "Main-d’œuvre", sell: 65, tax: 20, status: "Actif" },
  ];
  const tabs = pickerSubcategories(pv, [
    { id: "sub-ond", categoryId: pv.id, name: "Onduleurs", sortOrder: 20, active: true },
    { id: "sub-micro", categoryId: pv.id, name: "Micro-onduleur", sortOrder: 25, active: true },
  ], catalog);
  const onduleurs = tabs.find(item => item.name === "Onduleurs");
  const micro = tabs.find(item => item.name === "Micro-onduleur");
  const optimiseur = tabs.find(item => item.name === "Optimiseur");
  const labor = tabs.find(item => item.name === "Main-d’œuvre");
  assert.equal(onduleurs.count, 1);
  assert.equal(micro.count, 2);
  assert.equal(optimiseur.count, 1);
  assert.equal(labor.count, 1);
  assert.ok(tabs.findIndex(item => item.name === "Optimiseur") === tabs.findIndex(item => item.name === "Main-d’œuvre") - 1);
  assert.deepEqual(articlesForPath(catalog, { category: pv, subcategory: onduleurs }).map(item => item.code), ["PV-O"]);
  assert.deepEqual(articlesForPath(catalog, { category: pv, subcategory: micro }).map(item => item.code).sort(), ["PV-M", "PV-M2"]);
  const sql = readFileSync(new URL("../supabase/migrations/20260933_pv_micro_onduleur.sql", import.meta.url), "utf8");
  assert.match(sql, /Micro-onduleur/);
  const optimiseurSql = readFileSync(new URL("../supabase/migrations/20261004_pv_optimiseur.sql", import.meta.url), "utf8");
  assert.match(optimiseurSql, /Optimiseur/);
});

test("inactive articles are hidden by default", () => {
  const path = { category: categories[0], subcategory: subcategories[0] };
  assert.equal(articlesForPath(sample, path).length, 2);
  assert.equal(articlesForPath(sample, path, { includeInactive: true }).length, 3);
});

test("la recherche de groupe trouve une reference dans tout le catalogue", () => {
  const hits = searchArticlesByReference(sample, "CLIM-1");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, "CLIM-1");
  assert.equal(searchArticlesByReference(sample, "C").length, 0);
  const prefix = searchArticlesByReference(sample, "CLIM");
  assert.ok(prefix.every(item => String(item.code).startsWith("CLIM") || /clim/i.test(item.name)));
});

test("breadcrumb jumps back to brands without restarting the path", () => {
  const crumbs = buildPickerCrumbs({
    category: categories[0],
    subcategory: subcategories[0],
    brand: "Mitsubishi Electric",
    step: "articles",
  });
  assert.deepEqual(
    crumbs.map(item => item.label),
    ["Catalogue", "Climatisation", "Mono-split", "Mitsubishi Electric", "Articles"]
  );
  assert.equal(crumbs.find(item => item.label === "Mono-split").step, "brands");
});

test("buildQuoteLineFromArticle snapshots editable designation", () => {
  const line = buildQuoteLineFromArticle(sample[0], { qty: 2, name: "Split salon", discountValue: 5 });
  assert.equal(line.articleId, "1");
  assert.equal(line.qty, 2);
  assert.equal(line.name, "Split salon");
  assert.equal(line.code, "CLIM-1");
});

test("formatArticlePower uses watts or kilowatts", () => {
  assert.equal(formatArticlePower({ powerW: 2500 }), "2,5 kW");
  assert.equal(formatArticlePower({ powerW: 2000 }), "2 kW");
  assert.equal(formatArticlePower({ powerW: 450 }), "450 W");
});

test("without taxonomy tables, the same seven families stay in order", () => {
  const derived = pickerCategories([], sample);
  assert.deepEqual(derived.map(item => item.name), PICKER_FAMILIES.map(item => item.name));
  assert.ok(derived.find(item => item.name === "Climatisation").count >= 1);
  assert.ok(derived.find(item => item.name === "Photovoltaïque").count >= 1);
});

test("create mode lists catalog brands even without articles", () => {
  const heat = pickerCategories([], []).find(item => item.name === "Chauffage");
  const pac = pickerSubcategories(heat, [], [])[0];
  const list = brandsForCreate([], { category: heat, subcategory: pac }, {
    brandCatalog: [{ id: "b1", name: "Daikin", logoUrl: "", status: "Actif" }],
  });
  assert.equal(list.some(item => item.name === "Daikin"), true);
  assert.equal(list.find(item => item.name === "Daikin").count, 0);
});

test("create crumbs end on the article form", () => {
  const crumbs = buildPickerCrumbs({
    category: { name: "VMC" },
    subcategory: { name: "VMC simple flux" },
    brand: "Aldes",
    step: "form",
  });
  assert.deepEqual(crumbs.map(item => item.label), ["Catalogue", "VMC", "VMC simple flux", "Aldes", "Fiche article"]);
});

test("persisted taxonomy ids ignore virtual family keys", () => {
  assert.equal(isPersistedTaxonomyId("family:Chauffage"), false);
  assert.equal(isPersistedTaxonomyId("2f1e3d4c-1111-4111-8111-aaaaaaaaaaaa"), true);
  assert.deepEqual(
    catalogPathIds(
      { id: "family:Chauffage", sourceIds: ["2f1e3d4c-1111-4111-8111-aaaaaaaaaaaa"] },
      { id: "subfamily:x" }
    ),
    { categoryId: "2f1e3d4c-1111-4111-8111-aaaaaaaaaaaa", subcategoryId: "" }
  );
});

test("Pompe à chaleur propose d abord le simple et le Duo avant la marque", () => {
  const heat = pickerCategories([], []).find(item => item.name === "Chauffage");
  const pac = pickerSubcategories(heat, [], []).find(item => item.name === "Pompe à chaleur");
  const catalog = [
    { id: "p1", code: "PAC-S", name: "Alfea Extensa", category: "Chauffage", subcategory: "Pompe à chaleur", brand: "Atlantic", sell: 8000, tax: 20, status: "Actif" },
    { id: "p2", code: "PAC-D", name: "Alfea Duo", category: "Chauffage", subcategory: "Pompe à chaleur Duo", brand: "Atlantic", sell: 9200, tax: 20, status: "Actif" },
  ];
  const variants = pickerVariants(pac, catalog);
  assert.deepEqual(variants.map(item => item.name), [
    "Pompe à chaleur",
    "Pompe à chaleur Duo",
    "Fourniture",
    "Installation",
  ]);
  assert.equal(variants.find(item => item.name === "Pompe à chaleur").count, 1);
  assert.equal(variants.find(item => item.name === "Pompe à chaleur Duo").count, 1);
  assert.equal(variants.find(item => item.name === "Fourniture").count, 0);
  assert.equal(variants.find(item => item.name === "Installation").count, 0);
  const simple = variants[0];
  const duo = variants[1];
  assert.deepEqual(articlesForPath(catalog, { category: heat, subcategory: simple }).map(item => item.code), ["PAC-S"]);
  assert.equal(articlesForPath(catalog, { category: heat, subcategory: duo }).map(item => item.code).join(","), "PAC-D");
  const crumbs = buildPickerCrumbs({
    category: heat,
    subcategory: pac,
    variant: duo,
    brand: "Atlantic",
    step: "articles",
  });
  assert.deepEqual(
    crumbs.map(item => item.label),
    ["Catalogue", "Chauffage", "Pompe à chaleur", "Pompe à chaleur Duo", "Atlantic", "Articles"]
  );
  assert.equal(crumbs.find(item => item.label === "Pompe à chaleur").step, "variants");
});

test("une PAC Duo Atlantic reste visible dans le parcours pompe a chaleur", () => {
  const heat = pickerCategories([], []).find(item => item.name === "Chauffage");
  const pac = pickerSubcategories(heat, [], []).find(item => item.name === "Pompe à chaleur");
  const article = {
    id: "ex1",
    code: "EXCELLIA-S-DUO-MO-ATLANTIC",
    name: "EXCELLIA-S-DUO-MO-ATLANTIC",
    category: "Chauffage",
    subcategory: "Pompe à chaleur",
    brand: "Atlantic",
    sell: 1,
    tax: 20,
    status: "Actif",
  };
  const variants = pickerVariants(pac, [article]);
  const simple = variants.find(item => item.name === "Pompe à chaleur");
  const duo = variants.find(item => item.name === "Pompe à chaleur Duo");
  assert.equal(simple.count, 0);
  assert.equal(duo.count, 1);
  assert.equal(articlesForPath([article], { category: heat, subcategory: simple, brand: "Atlantic" }).length, 0);
  assert.equal(articlesForPath([article], { category: heat, subcategory: duo, brand: "Atlantic" }).length, 1);
  const loose = {
    ...article,
    subcategory: "",
    category: "Chauffage",
  };
  assert.equal(articlesForPath([loose], { category: heat, subcategory: simple, brand: "Atlantic" }).length, 0);
  assert.equal(articlesForPath([loose], { category: heat, subcategory: duo, brand: "Atlantic" }).length, 1);
});

test("legacy PAC family maps onto the Chauffage / Pompe à chaleur path", () => {
  const path = resolveBundlePath({ name: "Pack PAC résidentiel", family: "Pompe à chaleur" });
  assert.equal(path.category, "Chauffage");
  assert.equal(path.subcategory, "Pompe à chaleur");
  assert.equal(path.brand, "");
  const duo = resolveBundlePath({ name: "Pack Duo", family: "Pompe à chaleur Duo" });
  assert.equal(duo.category, "Chauffage");
  assert.equal(duo.subcategory, "Pompe à chaleur Duo");
});

test("bundles without a brand appear on every brand of the same path", () => {
  const heat = pickerCategories([], []).find(item => item.name === "Chauffage");
  const pac = pickerSubcategories(heat, [], [])[0];
  const pack = { id: 1, name: "Pack PAC", family: "Pompe à chaleur", items: [{ code: "PAC-8KW", name: "PAC 8 kW", price: 6200 }] };
  const daikin = bundlesForPath([pack], { category: heat, subcategory: pac, brand: "Daikin" });
  const clim = pickerCategories([], []).find(item => item.name === "Climatisation");
  assert.equal(daikin.length, 1);
  assert.equal(bundlesForPath([pack], { category: clim, subcategory: { name: "Mono-split" }, brand: "Daikin" }).length, 0);
});

test("un groupe radiateur se trouve sous Radiateur électrique", () => {
  const heat = pickerCategories([], []).find(item => item.name === "Chauffage");
  const radiateur = pickerSubcategories(heat, [], []).find(item => item.name === "Radiateur électrique");
  const plat = pickerVariants(radiateur, []).find(item => item.name === "Plat standard blanc");
  const brique = pickerVariants(radiateur, []).find(item => item.name === "Brique réfractaire partielle standard blanc");
  const pac = pickerSubcategories(heat, [], []).find(item => item.name === "Pompe à chaleur");
  const pack = {
    id: "rad-1",
    name: "TT-KS Flat 500",
    category: "Chauffage",
    subcategory: "Plat standard blanc",
    brand: "Technotherm",
    items: [{ code: "FLAT", name: "TT-KS Flat 500", role: "principal" }],
  };
  assert.equal(bundlesForPath([pack], { category: heat, subcategory: radiateur, brand: "Technotherm" }).length, 1);
  assert.equal(bundlesForPath([pack], { category: heat, subcategory: plat, brand: "Technotherm" }).length, 1);
  assert.equal(bundlesForPath([pack], { category: heat, subcategory: brique, brand: "Technotherm" }).length, 0);
  assert.equal(bundlesForPath([pack], { category: heat, subcategory: pac, brand: "Technotherm" }).length, 0);
  const wizard = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  assert.match(wizard, /taxonomyNamesEqual\(item\.name, "Radiateur électrique"\)/);
  assert.match(wizard, /isRadiatorBundle/);
});

test("a branded bundle stays on its brand only", () => {
  const heat = pickerCategories([], []).find(item => item.name === "Chauffage");
  const pac = pickerSubcategories(heat, [], [])[0];
  const pack = { id: 2, name: "Pack Daikin", category: "Chauffage", subcategory: "Pompe à chaleur", brand: "Daikin", items: [{ code: "PAC-D", name: "PAC Daikin", price: 1 }] };
  assert.equal(bundlesForPath([pack], { category: heat, subcategory: pac, brand: "Daikin" }).length, 1);
  assert.equal(bundlesForPath([pack], { category: heat, subcategory: pac, brand: "Atlantic" }).length, 0);
});

test("bundle brands merge into the picker brand list", () => {
  const heat = pickerCategories([], []).find(item => item.name === "Chauffage");
  const pac = pickerSubcategories(heat, [], [])[0];
  const merged = mergeBrandsWithBundles(
    [{ name: "Atlantic", count: 2, logoUrl: "" }],
    [{ name: "Pack Daikin", category: "Chauffage", subcategory: "Pompe à chaleur", brand: "Daikin", items: [] }],
    { category: heat, subcategory: pac }
  );
  assert.deepEqual(merged.map(item => item.name), ["Atlantic", "Daikin"]);
  assert.equal(merged.find(item => item.name === "Daikin").bundleCount, 1);
});

test("group intent keeps only brands that actually have bundles", () => {
  const heat = pickerCategories([], []).find(item => item.name === "Chauffage");
  const pac = pickerSubcategories(heat, [], [])[0];
  const catalog = [
    { id: "a1", name: "PAC Atlantic", category: "Pompe à chaleur", brand: "Atlantic", sell: 1, status: "Actif" },
    { id: "d1", name: "PAC Daikin", category: "Pompe à chaleur", brand: "Daikin", sell: 1, status: "Actif" },
  ];
  const bundles = [
    { id: 1, name: "Pack Daikin", category: "Chauffage", subcategory: "Pompe à chaleur", brand: "Daikin", items: [] },
  ];
  const groups = brandsForPickerIntent({
    articles: catalog,
    bundles,
    category: heat,
    subcategory: pac,
    intent: "groups",
  });
  assert.deepEqual(groups.map(item => item.name), ["Daikin"]);
  const articles = brandsForPickerIntent({
    articles: catalog,
    bundles,
    category: heat,
    subcategory: pac,
    intent: "articles",
  });
  assert.deepEqual(articles.map(item => item.name), ["Atlantic", "Daikin"]);
});

test("article intent hides brands that only exist on a group", () => {
  const heat = pickerCategories([], []).find(item => item.name === "Chauffage");
  const pac = pickerSubcategories(heat, [], [])[0];
  const onlyGroup = brandsForPickerIntent({
    articles: [{ id: "a1", name: "PAC Atlantic", category: "Pompe à chaleur", brand: "Atlantic", sell: 1, status: "Actif" }],
    bundles: [{ id: 1, name: "Pack Daikin", category: "Chauffage", subcategory: "Pompe à chaleur", brand: "Daikin", items: [] }],
    category: heat,
    subcategory: pac,
    intent: "articles",
  });
  assert.deepEqual(onlyGroup.map(item => item.name), ["Atlantic"]);
});

test("inactive bundles stay out of the devis picker", () => {
  const heat = pickerCategories([], []).find(item => item.name === "Chauffage");
  const pac = pickerSubcategories(heat, [], [])[0];
  const pack = {
    id: 3,
    name: "Pack inactif",
    category: "Chauffage",
    subcategory: "Pompe à chaleur",
    brand: "Daikin",
    status: "Inactif",
    items: [{ code: "PAC-X", name: "PAC", price: 1 }],
  };
  assert.equal(isBundleActive(pack), false);
  assert.equal(bundlesForPath([pack], { category: heat, subcategory: pac, brand: "Daikin" }).length, 0);
  assert.equal(bundlesForPath([pack], { category: heat, subcategory: pac, brand: "Daikin" }, { includeInactive: true }).length, 1);
  const normalized = normalizeBundle(pack);
  assert.equal(normalized.active, false);
  assert.equal(normalized.status, "Inactif");
});

test("moveBundleItems reordonne les articles du groupe sans sortir des bornes", () => {
  const items = [
    { code: "UE", name: "Groupe extérieur" },
    { code: "UI", name: "Unité intérieure" },
    { code: "SUP", name: "Liaison frigo" },
  ];
  assert.deepEqual(moveBundleItems(items, 0, 1).map(item => item.code), ["UI", "UE", "SUP"]);
  assert.deepEqual(moveBundleItems(items, 2, -1).map(item => item.code), ["UE", "SUP", "UI"]);
  assert.deepEqual(moveBundleItems(items, 0, -1).map(item => item.code), ["UE", "UI", "SUP"]);
  assert.deepEqual(moveBundleItems(items, 2, 1).map(item => item.code), ["UE", "UI", "SUP"]);
});

test("le prix d un article de groupe ne lit pas l unite de mesure", () => {
  assert.equal(bundleItemSellPrice({ price: 80, unit: "Unité" }), 80);
  assert.equal(bundleItemSellPrice({ sell: 200, unit: "Forfait" }), 200);
  assert.equal(bundleItemSellPrice({ unit: "Unité" }), 0);
  assert.equal(buildBundleItemFromArticle({ name: "Fournitures", price: 80, unit: "Unité" }).price, 80);
  const lines = buildQuoteLinesFromBundle(
    { id: 1, name: "Pack", items: [{ code: "CLIM-FOUR", name: "Fournitures", price: 80, unit: "Unité", qty: 1 }] },
    [{ code: "CLIM-FOUR", sell: 80, unit: "Unité" }],
    { idBase: 1 }
  );
  assert.equal(lines[0].unit, 80);
});

test("un nouveau prix catalogue met a jour l article dans le groupe pas le devis", () => {
  const bundles = [
    {
      id: "b1",
      name: "Pack PAC",
      category: "Chauffage",
      items: [
        { articleId: "a1", code: "PAC-8", name: "PAC 8 kW", price: 6200, buy: 4000, tax: 10, qty: 1, role: "principal" },
        { articleId: "a2", code: "KIT", name: "Kit", price: 180, buy: 90, tax: 20, qty: 1, role: "supply" },
      ],
    },
    {
      id: "b2",
      name: "Autre pack",
      category: "Chauffage",
      items: [{ articleId: "a9", code: "AUTRE", name: "Autre", price: 100, qty: 1, role: "principal" }],
    },
  ];
  const updated = syncArticlePriceIntoBundles({ id: "a1", code: "PAC-8", sell: 7100, buy: 4500, tax: 10 }, bundles);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, "b1");
  assert.equal(updated[0].items[0].price, 7100);
  assert.equal(updated[0].items[0].buy, 4500);
  assert.equal(updated[0].items[1].price, 180);
  assert.equal(bundles[1].items[0].price, 100);
  const quote = buildQuoteLinesFromBundle(
    { id: "old", name: "Devis déjà créé", items: [{ articleId: "a1", code: "PAC-8", name: "PAC 8 kW", price: 6200, qty: 1 }] },
    [{ id: "a1", code: "PAC-8", sell: 7100 }],
    { idBase: 1 }
  );
  assert.equal(quote[0].unit, 6200);
});

test("buildQuoteLinesFromBundle keeps the pack identity on each line", () => {
  const lines = buildQuoteLinesFromBundle(
    { id: 9, name: "Pack PAC", items: [{ code: "PAC-8KW", name: "PAC 8 kW", category: "Grand matériel", price: 6200, qty: 2 }] },
    [{ code: "PAC-8KW", description: "Air/eau", tax: 10, sell: 5000 }],
    { tax: 20, idBase: 100 }
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0].bundleId, 9);
  assert.equal(lines[0].bundleName, "Pack PAC");
  assert.equal(lines[0].unit, 6200);
  assert.equal(lines[0].qty, 2);
  assert.equal(lines[0].tax, 10);
  assert.equal(lines[0].description, "Air/eau");
});

test("bundle roles split principal, supplies and labor from catalog articles", () => {
  assert.equal(articleBundleRole({ name: "PAC Aquarea 9 kW", category: "Chauffage" }), "principal");
  assert.equal(articleBundleRole({ name: "Kit hydraulique", category: "Petite fourniture" }), "supply");
  assert.equal(articleBundleRole({ name: "Installation PAC", category: "Installation" }), "labor");
  assert.equal(articleBundleRole({ name: "Mise en service", unit: "Heure" }), "labor");
});

test("principal picker stays on the chosen brand path", () => {
  const heat = pickerCategories([], []).find(item => item.name === "Chauffage");
  const pac = pickerSubcategories(heat, [], [])[0];
  const catalog = [
    { id: "p1", code: "PAC-P", name: "PAC Panasonic", category: "Pompe à chaleur", brand: "Panasonic", sell: 9000, tax: 20, status: "Actif" },
    { id: "p2", code: "PAC-D", name: "PAC Daikin", category: "Pompe à chaleur", brand: "Daikin", sell: 8800, tax: 20, status: "Actif" },
    { id: "s1", code: "KIT-H", name: "Kit hydraulique", category: "Petite fourniture", brand: "MKL", sell: 180, tax: 20, status: "Actif" },
    { id: "l1", code: "MO-PAC", name: "Installation PAC", category: "Installation", sell: 2200, tax: 20, status: "Actif" },
  ];
  const principal = articlesForBundleRole(catalog, "principal", { category: heat, subcategory: pac, brand: "Panasonic" });
  assert.equal(principal.length, 1);
  assert.equal(principal[0].code, "PAC-P");
  const supplies = articlesForBundleRole(catalog, "supply", { category: heat, subcategory: pac });
  assert.ok(supplies.some(item => item.code === "KIT-H"));
  const labor = articlesForBundleRole(catalog, "labor", { category: heat });
  assert.ok(labor.some(item => item.code === "MO-PAC"));
});

test("normalizeBundle keeps quantities and suggests a name from the main article", () => {
  const bundle = normalizeBundle({
    family: "Pompe à chaleur",
    items: [{ code: "PAC-P", name: "PAC Panasonic 9 kW", brand: "Panasonic", price: 9000, qty: 1 }],
  });
  assert.equal(bundle.category, "Chauffage");
  assert.equal(bundle.subcategory, "Pompe à chaleur");
  assert.equal(bundleTotalHt({ items: bundle.items }), 9000);
  assert.match(suggestBundleName({ ...bundle, brand: "Panasonic" }), /PAC Panasonic 9 kW/);
});

test("les wizards catalogue ouvrent le choix PAC / Duo avant la marque", () => {
  const picker = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  const groups = readFileSync(new URL("../app/components/bundle-builder-wizard.js", import.meta.url), "utf8");
  assert.match(picker, /step === "variants"/);
  assert.match(groups, /step === "variants"/);
  assert.match(picker, /PAC, Duo, fourniture ou installation/);
  assert.match(picker, /item\?\.accessory/);
  assert.match(picker, /persistPickerSubcategory/);
  assert.match(picker, /createPortal/);
});

test("fourniture et installation PAC se creent sans fiche technique", () => {
  const heat = pickerCategories([], []).find(item => item.name === "Chauffage");
  const pac = pickerSubcategories(heat, [], []).find(item => item.name === "Pompe à chaleur");
  const catalog = [
    { id: "p1", code: "PAC-S", name: "Alfea Extensa", category: "Chauffage", subcategory: "Pompe à chaleur", brand: "Atlantic", sell: 8000, tax: 20, status: "Actif" },
    { id: "f1", code: "PAC-FOUR", name: "Liaison frigorifique", category: "Chauffage", subcategory: "Fourniture", brand: "Atlantic", sell: 180, tax: 20, status: "Actif" },
    { id: "i1", code: "PAC-INST", name: "Pose PAC", category: "Chauffage", subcategory: "Installation", brand: "MKL", sell: 650, tax: 20, status: "Actif" },
  ];
  const variants = pickerVariants(pac, catalog);
  const fourniture = variants.find(item => item.name === "Fourniture");
  const installation = variants.find(item => item.name === "Installation");
  assert.equal(fourniture.count, 1);
  assert.equal(installation.count, 1);
  assert.deepEqual(articlesForPath(catalog, { category: heat, subcategory: fourniture }).map(item => item.code), ["PAC-FOUR"]);
  assert.deepEqual(articlesForPath(catalog, { category: heat, subcategory: installation }).map(item => item.code), ["PAC-INST"]);
  assert.ok(!articlesForPath(catalog, { category: heat, subcategory: variants[0] }).some(item => item.code === "PAC-FOUR"));
  assert.equal(persistPickerSubcategory(pac, fourniture)?.name, "Pompe à chaleur");
  assert.equal(persistPickerSubcategory(pac, installation)?.name, "Pompe à chaleur");
  assert.equal(isHeatPumpPath({ category: heat.name, subcategory: fourniture.name }), false);
  assert.equal(isHeatPumpPath({ category: heat.name, subcategory: installation.name }), false);
  assert.equal(isHeatPumpPath({ category: heat.name, subcategory: "Pompe à chaleur", sourceReference: "picker:fourniture" }), false);
  assert.equal(isHeatPumpPath({ category: heat.name, subcategory: variants[0].name }), true);
});

test("fourniture et installation clim apparaissent seulement sous climatisation", () => {
  const clim = pickerCategories([], []).find(item => item.name === "Climatisation");
  const heat = pickerCategories([], []).find(item => item.name === "Chauffage");
  const tabs = pickerSubcategories(clim, [], []);
  const fourniture = tabs.find(item => item.name === "Fourniture");
  const installation = tabs.find(item => item.name === "Installation");
  const mono = tabs.find(item => item.name === "Mono-split");
  const radiateur = pickerSubcategories(heat, [], []).find(item => item.name === "Radiateur électrique");
  const pac = pickerSubcategories(heat, [], []).find(item => item.name === "Pompe à chaleur");
  assert.equal(Boolean(fourniture?.accessory), true);
  assert.equal(Boolean(installation?.accessory), true);
  assert.deepEqual(pickerVariants(mono, []).map(item => item.name), []);
  assert.ok(pickerVariants(radiateur, []).some(item => item.name === "Brique réfractaire partielle standard blanc"));
  assert.equal(pickerVariants(radiateur, []).at(-1).name, "Autres radiateurs");
  assert.ok(pickerVariants(pac, []).some(item => item.name === "Fourniture"));
  const catalog = [
    { id: "m1", code: "UE-1", name: "Groupe extérieur", category: "Climatisation", subcategory: "Mono-split", brand: "Toshiba", sell: 1200, tax: 20, status: "Actif" },
    { id: "f1", code: "CLIM-FOUR", name: "Liaison clim", category: "Climatisation", subcategory: "Fourniture", sourceReference: "picker:fourniture", sell: 80, tax: 20, status: "Actif" },
    { id: "i1", code: "CLIM-INST", name: "Pose clim", category: "Climatisation", subcategory: "Installation", sourceReference: "picker:installation", sell: 200, tax: 20, status: "Actif" },
    { id: "pf", code: "PAC-FOUR", name: "Liaison PAC", category: "Chauffage", subcategory: "Fourniture", brand: "Atlantic", sell: 180, tax: 20, status: "Actif" },
    { id: "pi", code: "PAC-INST", name: "Pose PAC", category: "Chauffage", subcategory: "Installation", brand: "MKL", sell: 650, tax: 20, status: "Actif" },
  ];
  const live = pickerSubcategories(clim, [], catalog);
  assert.equal(live.find(item => item.name === "Fourniture").count, 1);
  assert.equal(live.find(item => item.name === "Installation").count, 1);
  assert.deepEqual(articlesForPath(catalog, { category: clim, subcategory: live.find(item => item.name === "Fourniture") }).map(item => item.code), ["CLIM-FOUR"]);
  assert.deepEqual(articlesForPath(catalog, { category: clim, subcategory: live.find(item => item.name === "Installation") }).map(item => item.code), ["CLIM-INST"]);
  assert.ok(!articlesForPath(catalog, { category: clim, subcategory: live.find(item => item.name === "Fourniture") }).some(item => item.code === "PAC-FOUR"));
  const pacFour = pickerVariants(pac, catalog).find(item => item.name === "Fourniture");
  assert.deepEqual(articlesForPath(catalog, { category: heat, subcategory: pacFour }).map(item => item.code), ["PAC-FOUR"]);
  assert.ok(!articlesForPath(catalog, { category: heat, subcategory: pacFour }).some(item => item.code === "CLIM-FOUR"));
});

test("un article déjà dans un groupe est détecté par id ou code", () => {
  const bundles = [{
    name: "Pack PAC Daikin",
    items: [{ articleId: "1", code: "PAC-8KW", name: "PAC 8 kW" }],
  }];
  assert.equal(articleIsInBundles({ id: "1", code: "PAC-8KW" }, bundles), true);
  assert.equal(articleIsInBundles({ id: "99", code: "PAC-8KW" }, bundles), true);
  assert.equal(articleIsInBundles({ id: "2", code: "PAC-9KW" }, bundles), false);
  assert.deepEqual(bundlesContainingArticle({ id: "1" }, bundles).map(item => item.name), ["Pack PAC Daikin"]);
});

test("les gammes Technotherm restent dans Radiateur électrique sans se mélanger", () => {
  const heat = pickerCategories([], []).find(item => item.name === "Chauffage");
  const radiateur = pickerSubcategories(heat, [], []).find(item => item.name === "Radiateur électrique");
  const catalog = [
    { id: "a", code: "450605985", name: "TT-KS 500 S", category: "Chauffage", subcategory: "Brique réfractaire partielle standard blanc", brand: "Technotherm", sell: 1928.5, tax: 20, status: "Actif" },
    { id: "b", code: "450605185", name: "TT-KS Flat 500 S", category: "Chauffage", subcategory: "Plat standard blanc", brand: "Technotherm", sell: 1817.13, tax: 20, status: "Actif" },
    { id: "c", code: "450912965", name: "Roulettes", category: "Chauffage", subcategory: "Accessoires", brand: "Technotherm", sell: 150.92, tax: 20, status: "Actif" },
    { id: "d", code: "RAD-OLD", name: "Radiateur inertie", category: "Chauffage", subcategory: "Radiateur électrique", sell: 380, tax: 20, status: "Actif" },
  ];
  const variants = pickerVariants(radiateur, catalog);
  assert.equal(variants.find(item => item.name === "Brique réfractaire partielle standard blanc").count, 1);
  assert.equal(variants.find(item => item.name === "Plat standard blanc").count, 1);
  assert.equal(variants.find(item => item.name === "Accessoires").count, 1);
  assert.equal(variants.find(item => item.name === "Autres radiateurs").count, 1);
  assert.deepEqual(
    articlesForPath(catalog, { category: heat, subcategory: variants.find(item => item.name === "Brique réfractaire partielle standard blanc") }).map(item => item.code),
    ["450605985"]
  );
  const sql = readFileSync(new URL("../supabase/migrations/20261004_technotherm_radiateurs.sql", import.meta.url), "utf8");
  assert.equal((sql.match(/Référence constructeur/g) || []).length, 53);
  assert.match(sql, /'450605985', 'TT-KS 500 S — blanc'.*275\.50, 1377\.50/);
  assert.match(sql, /150-IPX4-TT-KS/);
  assert.match(sql, /96\.25/);
  assert.match(sql, /prix_achat_ht \* 5/);
  assert.match(sql, /Brique réfractaire partielle standard blanc/);
  assert.match(sql, /brique réfractaire/);
  assert.match(sql, /replace\(name, 'Accumulation', 'Brique réfractaire'\)/);
  assert.match(sql, /taux_tva = 10/);
  assert.doesNotMatch(sql, /TVA 20/);
  assert.doesNotMatch(sql, /Partial Storage|Heater|anthracite surcharge/i);
});

test("le prix de vente saisi en TTC est enregistré en HT", () => {
  assert.equal(sellHtFromInput(120, 20, "ttc"), 100);
  assert.equal(sellHtFromInput(105.5, 5.5, "ttc"), 100);
  assert.equal(sellHtFromInput(189, 20, "ht"), 189);
  assert.equal(Number(priceTtc(100, 20).toFixed(2)), 120);
  const field = readFileSync(new URL("../app/components/article-sell-price-field.js", import.meta.url), "utf8");
  const picker = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(field, /Saisir le prix en HT ou TTC/);
  assert.match(picker, /<ArticleSellPriceField/);
  assert.match(page, /<ArticleSellPriceField/);
  assert.match(picker, /disabled=\{saving \|\| \(!accessoryKind && !brandName\)\}/);
  assert.doesNotMatch(picker, /!selectedBrand\?\.id/);
});
