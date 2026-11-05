import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  findArticleByReference,
  formToArticleRecord,
  filterCatalogArticles,
  matchesArticleBrand,
  matchesArticleCategory,
  matchesArticleSearch,
  validateArticlePayload,
} from "../app/lib/articles.js";

test("requires reference and designation", () => {
  const record = formToArticleRecord({
    code: "",
    name: "",
    category: "Photovoltaïque",
    buy: 10,
    sell: 20,
    tax: 20,
    unit: "Unité",
  });
  const errors = validateArticlePayload(record);
  assert.ok(errors.some(error => /référence/i.test(error)));
  assert.ok(errors.some(error => /désignation/i.test(error)));
});

test("rejects empty category", () => {
  const record = formToArticleRecord({
    code: "X-1",
    name: "Test",
    category: "",
    buy: 1,
    sell: 2,
    tax: 20,
    unit: "Unité",
  });
  record.categorie = "";
  const errors = validateArticlePayload(record);
  assert.ok(errors.some(error => /catégorie/i.test(error)));
});

test("rejects unknown category when a catalog whitelist is provided", () => {
  const record = formToArticleRecord({
    code: "X-2",
    name: "Test",
    category: "Inconnue",
    buy: 1,
    sell: 2,
    tax: 20,
    unit: "Unité",
  });
  const errors = validateArticlePayload(record, { allowedCategories: ["Climatisation", "Photovoltaïque"] });
  assert.ok(errors.some(error => /catégorie/i.test(error)));
});

test("accepte une famille catalogue meme si le whitelist n a que des sous-noms", () => {
  const record = formToArticleRecord({
    code: "PAC-1",
    name: "Alfea",
    category: "Chauffage",
    buy: 1,
    sell: 2,
    tax: 20,
    unit: "Unité",
  });
  const errors = validateArticlePayload(record, { allowedCategories: ["Pompe à chaleur", "Climatisation"] });
  assert.equal(errors.length, 0);
});

test("maps legacy grand matériel category", () => {
  const record = formToArticleRecord({
    code: "gm-1",
    name: "Onduleur",
    category: "Grand matériel",
    buy: 100,
    sell: 150,
    tax: 20,
    unit: "Unité",
  });
  assert.equal(record.categorie, "Autre");
  assert.equal(record.reference, "GM-1");
  assert.equal(validateArticlePayload(record).length, 0);
});

test("detects duplicate reference case-insensitively", () => {
  const record = formToArticleRecord({
    code: "pv-450w",
    name: "Panneau",
    category: "Photovoltaïque",
    buy: 100,
    sell: 180,
    tax: 20,
    unit: "Unité",
  });
  const duplicate = findArticleByReference(
    [{ id: "1", reference: "PV-450W", designation: "Existant" }],
    record.reference
  );
  assert.ok(duplicate);
});

test("search matches reference brand designation category", () => {
  const article = {
    code: "PAC-8KW",
    name: "Pompe à chaleur 8 kW",
    brand: "Daikin",
    category: "Pompe à chaleur",
  };
  assert.equal(matchesArticleSearch(article, "daikin pac"), true);
  assert.equal(matchesArticleSearch(article, "photovolta"), false);
});

test("filtre le catalogue par categorie et marque", () => {
  const catalog = [
    { code: "ATL-6", name: "Alfea 6", brand: "Atlantic", category: "Chauffage", subcategory: "Pompe à chaleur" },
    { code: "TOS-35", name: "Split 3,5", brand: "Toshiba", category: "Climatisation", subcategory: "Mono-split" },
    { code: "DS-450", name: "Panneau 450", brand: "DualSun", category: "Photovoltaïque" },
  ];
  assert.equal(matchesArticleCategory(catalog[0], "Chauffage"), true);
  assert.equal(matchesArticleCategory(catalog[1], "Chauffage"), false);
  assert.equal(matchesArticleBrand(catalog[0], "atlantic"), true);
  assert.deepEqual(filterCatalogArticles(catalog, { category: "Chauffage" }).map(item => item.code), ["ATL-6"]);
  assert.deepEqual(filterCatalogArticles(catalog, { brand: "Toshiba" }).map(item => item.code), ["TOS-35"]);
  assert.deepEqual(filterCatalogArticles(catalog, { category: "Photovoltaïque", brand: "DualSun" }).map(item => item.code), ["DS-450"]);
});

test("la liste articles a des filtres categorie et marque", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /Filtrer par catégorie/);
  assert.match(page, /Filtrer par marque/);
  assert.match(page, /filterCatalogArticles/);
  assert.match(page, /article-name/);
});

test("valid article passes", () => {
  const record = formToArticleRecord({
    code: "INST-POSE",
    name: "Pose et mise en service",
    category: "Installation",
    brand: "MKL",
    description: "Pose complète",
    buy: 40,
    sell: 65,
    tax: 20,
    unit: "Heure",
    status: "Actif",
  });
  assert.equal(validateArticlePayload(record).length, 0);
  assert.equal(record.actif, true);
});

test("articles ne passent plus par le blob crm_state", () => {
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.ok(!/useStored\("mkl-articles"/.test(source));
  assert.match(source, /authFetch\("\/api\/articles"\)/);
  assert.ok(!/mkl-products-import-2026-07-24/.test(source));
  assert.match(source, /data\.article\?\.id/);
  assert.match(source, /canAccessModule\(currentProfile,"Maintenance"\)/);
});

test("la modification d article n exige pas une sous-categorie et propose le parcours catalogue", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /articleFormSubcategories/);
  assert.match(page, /name="subcategoryChoice"/);
  assert.doesNotMatch(page, /required=\{Boolean\(categoryId&&scopedSubs\.length\)\}/);
});

test("la suppression d article est une fonction a cocher", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const roles = readFileSync(new URL("../app/lib/roles.js", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/articles/[id]/route.js", import.meta.url), "utf8");
  assert.match(page, /Fonctions spéciales/);
  assert.match(page, /ACTION_PERMISSIONS/);
  assert.match(page, /canDeleteArticles/);
  assert.match(page, /\/api\/articles\/\$\{article\.id\}\?hard=1/);
  assert.match(roles, /action:delete_articles/);
  assert.match(roles, /Supprimer des articles/);
  assert.match(api, /canDeleteArticles/);
});
