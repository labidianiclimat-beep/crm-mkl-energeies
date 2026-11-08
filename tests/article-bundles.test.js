import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formToBundleRecord,
  validateBundlePayload,
  bundleToUi,
  bundleRecordWithoutForfait,
  groupBundlesByBrand,
  isMissingBundleForfaitColumn,
  matchesBundleSearch,
  outdoorBundleDrafts,
  heatPumpBundleDrafts,
  applyClimStandardAccessories,
  climBundlesNeedingStandardAccessories,
  BUNDLE_SELECT,
  BUNDLE_SELECT_LEGACY,
  readBundleRows,
} from "../app/lib/article-bundles.js";
import { bundlesForPath, isBundleActive, pickerCategories, pickerSubcategories } from "../app/lib/article-picker.js";

test("un groupe exige un nom, une categorie et un materiel principal", () => {
  const record = formToBundleRecord({
    name: "",
    category: "",
    items: [{ code: "PF-1", name: "Fourniture", role: "supply", qty: 1, price: 10 }],
  }, { organizationId: "org-1" });
  const errors = validateBundlePayload(record);
  assert.ok(errors.some(item => /nom/i.test(item)));
  assert.ok(errors.some(item => /catégorie/i.test(item)));
  assert.ok(errors.some(item => /matériel principal/i.test(item)));
});

test("un groupe actif est enregistre avec ses lignes", () => {
  const record = formToBundleRecord({
    name: "Pack PAC Daikin",
    category: "Chauffage",
    subcategory: "Pompe à chaleur",
    brand: "Daikin",
    status: "Actif",
    items: [
      { code: "PAC-8KW", name: "PAC 8 kW", qty: 1, price: 6200, role: "principal" },
      { code: "PF-PAC", name: "Petite fourniture", qty: 1, price: 850, role: "supply" },
    ],
  }, { organizationId: "org-1", createdBy: "user-1" });
  assert.equal(validateBundlePayload(record).length, 0);
  assert.equal(record.actif, true);
  assert.equal(record.items.length, 2);
  const ui = bundleToUi({ ...record, id: "11111111-1111-4111-8111-111111111111", actif: true });
  assert.equal(ui.active, true);
  assert.equal(ui.status, "Actif");
});

test("desactiver un groupe le retire du devis", () => {
  const heat = pickerCategories([], []).find(item => item.name === "Chauffage");
  const pac = pickerSubcategories(heat, [], [])[0];
  const fromUi = formToBundleRecord({
    name: "Pack",
    category: "Chauffage",
    subcategory: "Pompe à chaleur",
    brand: "Daikin",
    active: true,
    status: "Inactif",
    items: [{ code: "PAC-X", name: "PAC", qty: 1, price: 1, role: "principal" }],
  }, { organizationId: "org-1" });
  assert.equal(fromUi.actif, false);
  const ui = bundleToUi({
    id: "22222222-2222-4222-8222-222222222222",
    name: "Pack",
    category: "Chauffage",
    subcategory: "Pompe à chaleur",
    brand: "Daikin",
    items: fromUi.items,
    actif: false,
  });
  assert.equal(isBundleActive(ui), false);
  assert.equal(bundlesForPath([ui], { category: heat, subcategory: pac, brand: "Daikin" }).length, 0);
  assert.equal(bundlesForPath([ui], { category: heat, subcategory: pac, brand: "Daikin" }, { includeInactive: true }).length, 1);
});

test("le groupe reste sur la liste pour cocher et reordonner les articles", () => {
  const wizard = readFileSync(new URL("../app/components/bundle-builder-wizard.js", import.meta.url), "utf8");
  assert.match(wizard, /restartPath/);
  assert.match(wizard, /Ajouter un autre article/);
  assert.match(wizard, /Terminer le groupe/);
  assert.match(wizard, /toggleArticle/);
  assert.match(wizard, /QuoteBundleHeading/);
  assert.match(wizard, /moveItem/);
  assert.match(wizard, /moveBundleItems/);
  assert.match(wizard, /type="checkbox"/);
  assert.match(wizard, /aria-label="Monter"/);
  assert.match(wizard, /aria-label="Descendre"/);
  assert.doesNotMatch(wizard, /Continuer vers les fournitures/);
  assert.doesNotMatch(wizard, /Continuer vers la main-d’œuvre/);
  assert.match(wizard, /wizard-bundle-star/);
  assert.match(wizard, /bundlesContainingArticle/);
  assert.match(wizard, /\bStar\b/);
  assert.match(wizard, /searchArticlesByReference/);
  assert.match(wizard, /addArticleFromSearch/);
  assert.match(wizard, /Référence article/);
  assert.match(wizard, /const composeCopy/);
  assert.match(wizard, /Articles du groupe/);
});

test("la liste des groupes a le bouton en haut et trois colonnes", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /Créer un groupe/);
  assert.match(page, /bundle-grid/);
  assert.match(page, /bundle-brand-nav/);
  assert.match(page, /groupBundlesByBrand/);
  assert.match(page, /matchesBundleSearch/);
  assert.match(page, /Rechercher un groupe, une référence, une marque/);
  assert.match(page, /QuoteBundleHeading title=\{bundle\.name\}/);
  assert.match(css, /\.bundle-grid\{[^}]*repeat\(3/);
  assert.match(css, /\.module-actions>\.bundle-grid/);
  assert.match(css, /\.module-actions>\.bundle-toolbar/);
  assert.match(css, /\.bundle-card>\.quote-bundle-heading[^{]*\{[^}]*#ffcc00/);
  assert.match(css, /\.bundle-card p b\{/);
  assert.doesNotMatch(css, /\.bundle-card b\{font-size:9px;color:var\(--ink\)\}/);
});

test("la recherche de groupe trouve le nom la marque et une reference", () => {
  const bundle = {
    name: "Pack PAC Daikin",
    category: "Chauffage",
    subcategory: "Pompe à chaleur",
    brand: "Daikin",
    items: [{ code: "PAC-8KW", name: "Altherma 8 kW", brand: "Daikin" }],
  };
  assert.equal(matchesBundleSearch(bundle, ""), true);
  assert.equal(matchesBundleSearch(bundle, "daikin pac"), true);
  assert.equal(matchesBundleSearch(bundle, "PAC-8KW"), true);
  assert.equal(matchesBundleSearch(bundle, "altherma"), true);
  assert.equal(matchesBundleSearch(bundle, "toshiba"), false);
});

test("la fiche article met a jour le prix dans les groupes", () => {
  const api = readFileSync(new URL("../app/api/articles/[id]/route.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(api, /syncArticlePriceIntoBundles/);
  assert.match(page, /prix mis à jour dans/);
});

test("les groupes ne passent plus par le stockage navigateur", () => {
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.ok(!/useStored\("mkl-article-bundles"/.test(source));
  assert.match(source, /authFetch\("\/api\/article-bundles"\)/);
  const api = readFileSync(new URL("../app/api/article-bundles/route.js", import.meta.url), "utf8");
  const patch = readFileSync(new URL("../app/api/article-bundles/[id]/route.js", import.meta.url), "utf8");
  assert.match(api, /article_bundles/);
  assert.match(api, /canReadArticles/);
  assert.match(api, /applyClimStandardAccessories/);
  assert.match(patch, /applyClimStandardAccessories/);
});

test("les groupes extérieurs se créent par marque sans doubler Toshiba", () => {
  const toshiba = {
    id: "ue-tos",
    code: "TOS-UE",
    name: "Groupe bi-split Toshiba",
    category: "Climatisation",
    subcategory: "Bi-split",
    brand: "Toshiba",
    status: "Actif",
    active: true,
  };
  const daikin = {
    id: "ue-dai",
    code: "DAI-UE",
    name: "Groupe bi-split Daikin",
    category: "Climatisation",
    subcategory: "Bi-split",
    brand: "Daikin",
    status: "Actif",
    active: true,
  };
  const indoor = {
    id: "ui-dai",
    code: "DAI-UI",
    name: "Unité intérieure Daikin",
    category: "Climatisation",
    subcategory: "Unités intérieures",
    brand: "Daikin",
    status: "Actif",
    active: true,
  };
  const existing = [{
    id: "b-tos",
    name: toshiba.name,
    brand: "Toshiba",
    items: [{ articleId: "ue-tos", code: "TOS-UE", name: toshiba.name, role: "principal" }],
  }];
  const drafts = outdoorBundleDrafts([toshiba, daikin, indoor], existing);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].brand, "Daikin");
  assert.equal(drafts[0].items[0].articleId, "ue-dai");
  const grouped = groupBundlesByBrand([
    { name: "Pack Daikin", brand: "Daikin", items: [] },
    { name: "Pack Toshiba", brand: "Toshiba", items: [] },
    { name: "Pack sans marque", brand: "", items: [] },
  ]);
  assert.deepEqual(grouped.map(item => item.brand), ["Daikin", "Toshiba", "Sans marque"]);
  const generate = readFileSync(new URL("../app/api/article-bundles/generate-outdoor/route.js", import.meta.url), "utf8");
  assert.match(generate, /outdoorBundleDrafts/);
  assert.match(generate, /heatPumpBundleDrafts/);
  assert.match(generate, /climBundlesNeedingStandardAccessories/);
});

test("une pompe à chaleur sans groupe reçoit les fournitures et la pose RO", () => {
  const daikin = {
    id: "pac-dai",
    code: "PAC-DAI",
    name: "Altherma 8 kW",
    category: "Chauffage",
    subcategory: "Pompe à chaleur",
    brand: "Daikin",
    status: "Actif",
    active: true,
  };
  const panasonic = {
    id: "pac-pan",
    code: "PAC-PAN",
    name: "Aquarea 9 kW",
    category: "Pompe à chaleur",
    subcategory: "Air/eau",
    brand: "Panasonic",
    status: "Actif",
    active: true,
  };
  const supply = {
    id: "pac-frn",
    code: "FRN-PAC-RO",
    name: "Fournitures pour pompe à chaleur RO",
    category: "Chauffage",
    subcategory: "Fourniture",
    status: "Actif",
    active: true,
  };
  const labor = {
    id: "pac-inst",
    code: "INST-PAC-RO",
    name: "Installations pour pompe à chaleur RO",
    category: "Chauffage",
    subcategory: "Installation",
    status: "Actif",
    active: true,
  };
  const ballon = {
    id: "ballon-1",
    code: "BAL-1",
    name: "Ballon thermodynamique 200 L",
    category: "Ballon thermodynamique",
    subcategory: "Ballon",
    status: "Actif",
    active: true,
  };
  const inactive = {
    id: "pac-off",
    code: "PAC-OFF",
    name: "PAC archivée",
    category: "Pompe à chaleur",
    subcategory: "PAC",
    status: "Inactif",
    active: false,
  };
  const existing = [{
    name: daikin.name,
    category: "Chauffage",
    subcategory: "Pompe à chaleur",
    items: [
      { articleId: "pac-dai", code: "PAC-DAI", name: daikin.name, role: "principal" },
      { articleId: "pac-frn", code: "FRN-PAC-RO", name: supply.name, role: "supply" },
      { articleId: "pac-inst", code: "INST-PAC-RO", name: labor.name, role: "labor" },
    ],
  }];
  const articles = [daikin, panasonic, supply, labor, ballon, inactive];
  const drafts = heatPumpBundleDrafts(articles, existing);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].brand, "Panasonic");
  assert.equal(drafts[0].name, "Aquarea 9 kW");
  assert.deepEqual(drafts[0].items.map(item => item.code), ["PAC-PAN", "FRN-PAC-RO", "INST-PAC-RO"]);
  assert.deepEqual(drafts[0].items.map(item => item.role), ["principal", "supply", "labor"]);
  const fresh = heatPumpBundleDrafts([panasonic, supply, labor], []);
  assert.equal(fresh.length, 1);
  assert.equal(validateBundlePayload(formToBundleRecord(fresh[0], { organizationId: "org-1" })).length, 0);
  assert.equal(heatPumpBundleDrafts([panasonic, supply], []).length, 0);
  assert.equal(outdoorBundleDrafts(articles, []).length, 0);
});

test("un groupe clim recoit FRN-R.R et INST-R.R sans les dupliquer", () => {
  const outdoor = {
    id: "ue-dai",
    code: "DAI-UE",
    name: "Groupe bi-split Daikin",
    category: "Climatisation",
    subcategory: "Bi-split",
    brand: "Daikin",
    status: "Actif",
    active: true,
  };
  const frn = {
    id: "frn-1",
    code: "FRN-R.R",
    name: "Fourniture clim",
    category: "Climatisation",
    subcategory: "Fourniture",
    sourceReference: "picker:fourniture",
    sell: 90,
    tax: 20,
    status: "Actif",
    active: true,
  };
  const inst = {
    id: "inst-1",
    code: "INST-R.R",
    name: "Installation clim",
    category: "Climatisation",
    subcategory: "Installation",
    sourceReference: "picker:installation",
    sell: 220,
    tax: 20,
    status: "Actif",
    active: true,
  };
  const drafts = outdoorBundleDrafts([outdoor, frn, inst], []);
  assert.deepEqual(drafts[0].items.map(item => item.code), ["DAI-UE", "FRN-R.R", "INST-R.R"]);
  const again = applyClimStandardAccessories(drafts[0], [outdoor, frn, inst]);
  assert.equal(again, drafts[0]);
  const already = {
    id: "b-1",
    category: "Climatisation",
    items: [
      { articleId: "ue-dai", code: "DAI-UE", name: outdoor.name, role: "principal" },
      { articleId: "frn-1", code: "FRN-R.R", name: frn.name, role: "supply" },
    ],
  };
  const patched = climBundlesNeedingStandardAccessories([already], [outdoor, frn, inst]);
  assert.equal(patched.length, 1);
  assert.deepEqual(patched[0].items.map(item => item.code), ["DAI-UE", "FRN-R.R", "INST-R.R"]);
  const heating = applyClimStandardAccessories({
    category: "Chauffage",
    items: [{ code: "PAC-8", name: "PAC", role: "principal" }],
  }, [frn, inst]);
  assert.deepEqual(heating.items.map(item => item.code), ["PAC-8"]);
  assert.equal(outdoorBundleDrafts([outdoor], []).length, 1);
  assert.deepEqual(outdoorBundleDrafts([outdoor], [])[0].items.map(item => item.code), ["DAI-UE"]);
});

test("les groupes restent lisibles si les colonnes forfait ne sont pas encore en base", async () => {
  const missing = new Error("column article_bundles.pricing_mode does not exist");
  missing.code = "42703";
  assert.equal(isMissingBundleForfaitColumn(missing), true);
  assert.equal(bundleRecordWithoutForfait({ name: "Pack", pricing_mode: "detail", forfait_ht: 10 }).pricing_mode, undefined);
  const calls = [];
  const rows = await readBundleRows(async path => {
    calls.push(path);
    if (path.includes("pricing_mode")) throw missing;
    return [{ id: "b1", name: "Pack créé" }];
  }, `/rest/v1/article_bundles?select=${BUNDLE_SELECT}`);
  assert.equal(rows[0].name, "Pack créé");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].includes(BUNDLE_SELECT_LEGACY), true);
  assert.equal(calls[1].includes("pricing_mode"), false);
});
