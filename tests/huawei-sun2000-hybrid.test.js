import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formToArticleRecord, matchesArticleSearch, validateArticlePayload } from "../app/lib/articles.js";
import { articleHasCommercialDoc } from "../app/lib/article-commercial-doc.js";
import {
  articlesForPath,
  brandsForPath,
  buildQuoteLineFromArticle,
  pickerCategories,
  pickerSubcategories,
} from "../app/lib/article-picker.js";
import {
  huaweiModelKeysIn,
  huaweiSun2000HybridArticles,
  huaweiSun2000HybridRecords,
  huaweiSun2000HybridUiArticles,
  normalizeHuaweiModelKey,
  planHuaweiSun2000Import,
  renderHuaweiSun2000ImportSql,
  renderHuaweiSun2000PreviewSql,
} from "../app/lib/huawei-sun2000-hybrid.js";

const articles = huaweiSun2000HybridArticles();

test("le catalogue Huawei contient exactement 13 références uniques", () => {
  assert.equal(articles.length, 13);
  assert.equal(new Set(articles.map(item => item.reference)).size, 13);
  assert.equal(new Set(articles.map(item => item.manufacturerReference)).size, 13);
  assert.equal(articles.filter(item => item.phase === "mono").length, 8);
  assert.equal(articles.filter(item => item.phase === "tri").length, 5);
  assert.ok(articles.every(item => item.reference === `HUA-${item.manufacturerReference}`));
  assert.ok(!articles.some(item => item.manufacturerReference.includes(",")));
  assert.ok(!articles.some(item => /LB00/.test(item.manufacturerReference)));
});

test("les puissances AC, PV et le nombre de MPPT sont ceux des fiches Huawei", () => {
  const byModel = Object.fromEntries(articles.map(item => [item.manufacturerReference, item]));
  assert.equal(byModel["SUN2000-3K-LB0"].powerW, 3000);
  assert.equal(byModel["SUN2000-3K-LB0"].pvW, 4500);
  assert.equal(byModel["SUN2000-3.68K-LB0"].powerW, 3680);
  assert.equal(byModel["SUN2000-3.68K-LB0"].pvW, 5520);
  assert.equal(byModel["SUN2000-4.6K-LB0"].powerW, 4600);
  assert.equal(byModel["SUN2000-4.6K-LB0"].pvW, 6900);
  assert.equal(byModel["SUN2000-8K-LC0"].mppt, 3);
  assert.equal(byModel["SUN2000-10K-LC0"].pvW, 15000);
  assert.equal(byModel["SUN2000-8K-MAP0"].pvW, 14600);
  assert.equal(byModel["SUN2000-12K-MAP0"].powerW, 12000);
  assert.equal(byModel["SUN2000-12K-MAP0"].pvW, 22000);
  assert.ok(articles.filter(item => item.family === "LB0").every(item => item.mppt === 2 && item.mpptRange === "40 à 560 V"));
  assert.ok(articles.filter(item => item.family === "LC0").every(item => item.mppt === 3 && item.dcMaxV === 600));
  assert.ok(articles.filter(item => item.family === "MAP0").every(item => item.mppt === 2 && item.mpptRange === "" && item.dcMaxV === 1100));
  assert.match(byModel["SUN2000-5K-MAP0"].descriptionTechnique, /Rendement maximal : 98,4 %/);
  assert.match(byModel["SUN2000-12K-MAP0"].descriptionTechnique, /Rendement maximal : 98,6 %/);
  assert.match(byModel["SUN2000-8K-MAP0"].descriptionTechnique, /Plage de fonctionnement PV : 160 à 1 000 V/);
  assert.doesNotMatch(byModel["SUN2000-8K-MAP0"].descriptionTechnique, /Plage MPPT/);
  assert.match(byModel["SUN2000-6K-LB0"].descriptionTechnique, /Plage MPPT : 40 à 560 V/);
});

test("les enregistrements passent la validation de l’API articles", () => {
  for (const article of huaweiSun2000HybridRecords()) {
    const record = formToArticleRecord(article, { organizationId: "org" });
    assert.deepEqual(validateArticlePayload(record, { allowedCategories: ["Photovoltaïque"] }), []);
    assert.equal(record.reference, article.reference);
    assert.equal(record.prix_achat_ht, 0);
    assert.equal(record.prix_vente_ht, 0);
    assert.equal(record.taux_tva, 20);
    assert.equal(record.unite, "Unité");
    assert.equal(record.power_w, article.power_w);
    assert.equal(record.categorie, "Photovoltaïque");
    assert.equal(record.sous_categorie, "Onduleurs");
    assert.equal(record.marque, "Huawei");
    assert.equal(record.fiche_nom, null);
    assert.equal(record.fiche_data, null);
    assert.equal(articleHasCommercialDoc({ ficheData: article.fiche_data || "" }), false);
  }
});

test("les onduleurs Huawei se choisissent dans Photovoltaïque puis Onduleurs", () => {
  const ui = huaweiSun2000HybridUiArticles();
  const pv = pickerCategories([], []).find(item => item.name === "Photovoltaïque");
  const tabs = pickerSubcategories(pv, [
    { id: "sub-ond", categoryId: pv.id, name: "Onduleurs", sortOrder: 20, active: true },
  ], ui);
  const onduleurs = tabs.find(item => item.name === "Onduleurs");
  const listed = articlesForPath(ui, { category: pv, subcategory: onduleurs, brand: "Huawei" });
  assert.equal(listed.length, 13);
  assert.deepEqual(brandsForPath(ui, { category: pv, subcategory: onduleurs }).map(item => item.name), ["Huawei"]);
  assert.equal(articlesForPath(ui, { category: pv, subcategory: onduleurs }, { query: "SUN2000-6K-LB0" }).length, 1);
  assert.equal(matchesArticleSearch(ui.find(item => item.code === "HUA-SUN2000-10K-MAP0"), "Huawei").valueOf(), true);
  assert.equal(matchesArticleSearch(ui.find(item => item.code === "HUA-SUN2000-12K-MAP0"), "Triphasé").valueOf(), true);
  const line = buildQuoteLineFromArticle(ui[0]);
  assert.equal(line.qty, 1);
  assert.equal(line.unit, 0);
  assert.equal(line.tax, 20);
  assert.match(line.description, /Fourniture d’un onduleur photovoltaïque hybride Huawei SUN2000/);
  assert.equal(line.name, ui[0].name);
});

test("un article déjà présent ou une variante n’est ni recréé ni modifié", () => {
  assert.equal(normalizeHuaweiModelKey(" hua-sun2000-4,6k-lb00 "), "SUN2000-4.6K-LB0");
  assert.deepEqual(huaweiModelKeysIn("Réf SUN2000 -5K- MAP0"), ["SUN2000-5K-MAP0"]);
  const existing = {
    id: "old",
    reference: "SUN2000-4,6K-LB00",
    designation: "Ancien onduleur saisi à la main",
    description: "Texte commercial conservé",
    sell: 999,
    prix_vente_ht: 999,
  };
  const before = { ...existing };
  const first = planHuaweiSun2000Import([existing, { reference: "SUN2000-600W-P", designation: "Optimiseur" }]);
  assert.deepEqual(existing, before);
  assert.equal(first.report.find(item => item.manufacturerReference === "SUN2000-4.6K-LB0").status, "conflit");
  assert.equal(first.toInsert.some(item => item.manufacturerReference === "SUN2000-4.6K-LB0"), false);
  assert.equal(first.toInsert.length, 12);
  const stored = first.toInsert.map(item => ({ reference: item.reference, designation: item.designation, sell: 0 }));
  const second = planHuaweiSun2000Import([existing, ...stored]);
  assert.equal(second.toInsert.length, 0);
  assert.equal(second.report.filter(item => item.status === "deja_present").length, 12);
  assert.equal(second.report.find(item => item.manufacturerReference === "SUN2000-4.6K-LB0").status, "conflit");
  assert.equal(existing.sell, 999);
  assert.equal(existing.description, "Texte commercial conservé");
});

test("la prévisualisation lit le catalogue sans écrire", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261106_huawei_sun2000_previsualisation.sql", import.meta.url), "utf8");
  assert.equal(sql, renderHuaweiSun2000PreviewSql());
  assert.match(sql, /Lecture seule/);
  assert.match(sql, /xqbjfytrssslnsxxdrou/);
  assert.doesNotMatch(sql, /insert\s+into/i);
  assert.doesNotMatch(sql, /update\s+/i);
  assert.doesNotMatch(sql, /delete\s+/i);
  assert.doesNotMatch(sql, /truncate/i);
  assert.doesNotMatch(sql, /create\s+/i);
  for (const article of articles) {
    assert.match(sql, new RegExp(article.reference.replace(".", "\\.")));
    assert.match(sql, new RegExp(`${article.powerW}`));
  }
});

test("l’import reste bloqué et ne réécrit ni les articles ni les devis", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261106_huawei_sun2000_import.sql", import.meta.url), "utf8");
  const retired = readFileSync(new URL("../supabase/migrations/20261106_huawei_sun2000_hybride.sql", import.meta.url), "utf8");
  assert.equal(sql, renderHuaweiSun2000ImportSql());
  assert.match(sql, /v_confirmation text := 'EN-ATTENTE'/);
  assert.match(sql, /CONFIRME-RECETTE-xqbjfytrssslnsxxdrou/);
  assert.ok(sql.indexOf("Import non confirmé") < sql.indexOf("insert into public.articles"));
  assert.match(sql, /status = 'absent'/);
  assert.doesNotMatch(sql, /update public\.articles/i);
  assert.doesNotMatch(sql, /devis_lignes/);
  assert.doesNotMatch(sql, /delete from public\.articles/i);
  assert.match(retired, /raise exception/);
  assert.doesNotMatch(retired, /insert into public\.articles/i);
  for (const article of articles) {
    assert.match(sql, new RegExp(article.reference.replace(".", "\\.")));
  }
});
