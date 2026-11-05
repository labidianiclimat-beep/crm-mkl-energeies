import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { articleToUi, articleUsesVat55, formToArticleRecord, isElectricWaterHeaterArticle } from "../app/lib/articles.js";
import { buildQuoteLineFromArticle, buildQuoteLinesFromBundle } from "../app/lib/article-picker.js";

test("la climatisation et la pompe à chaleur RO sont en TVA 5,5", () => {
  const clim = formToArticleRecord({
    code: "CLIM-1",
    name: "Split Toshiba",
    category: "Climatisation",
    subcategory: "Mono-split",
    tax: 20,
    unit: "Unité",
    buy: 100,
    sell: 900,
  }, { organizationId: "org" });
  assert.equal(clim.taux_tva, 5.5);
  assert.equal(articleToUi({ ...clim, actif: true }).tax, 5.5);

  const ro = formToArticleRecord({
    code: "FRN-PAC-RO",
    name: "Fournitures pour pompe à chaleur RO",
    category: "Chauffage",
    subcategory: "Fourniture",
    tax: 10,
    unit: "Forfait",
    buy: 80,
    sell: 200,
  }, { organizationId: "org" });
  assert.equal(ro.taux_tva, 5.5);
  assert.equal(articleUsesVat55({ code: "INST-PAC-RO", name: "Installations pour pompe à chaleur RO", category: "Chauffage" }), true);

  const pac = formToArticleRecord({
    code: "PAC-8",
    name: "PAC air/eau 8 kW",
    category: "Pompe à chaleur",
    tax: 20,
    unit: "Unité",
    buy: 1000,
    sell: 4000,
  }, { organizationId: "org" });
  assert.equal(pac.taux_tva, 20);

  const line = buildQuoteLineFromArticle(
    { id: "1", code: "CLIM-1", name: "Split", category: "Climatisation", sell: 900, tax: 20 },
    { tax: 20 }
  );
  assert.equal(line.tax, 5.5);
  const pack = buildQuoteLinesFromBundle(
    { id: "b", name: "Pack", items: [{ code: "FRN-PAC-RO", name: "Fournitures pour pompe à chaleur RO", price: 200, qty: 1 }] },
    [{ code: "FRN-PAC-RO", name: "Fournitures pour pompe à chaleur RO", category: "Chauffage", sell: 200, tax: 10 }],
    { tax: 20, idBase: 1 }
  );
  assert.equal(pack[0].tax, 5.5);

  const sql = readFileSync(new URL("../supabase/migrations/20261012_clim_pac_ro_vat.sql", import.meta.url), "utf8");
  assert.match(sql, /taux_tva = 5\.5/);
  assert.match(sql, /climatis%/);
  assert.match(sql, /ro/);
});

test("le ballon électrique et son installation sont en TVA 10", () => {
  const tank = formToArticleRecord({
    code: "053005",
    name: "Chauffeo Plus vertical mural 50 L",
    category: "Ballon d’eau chaude",
    subcategory: "Ballon électrique",
    tax: 20,
    unit: "Unité",
    buy: 0,
    sell: 0,
  }, { organizationId: "org" });
  assert.equal(tank.taux_tva, 10);
  assert.equal(articleToUi({ ...tank, actif: true }).tax, 10);

  const pose = formToArticleRecord({
    code: "INST-BALLON-ELEC",
    name: "Installation ballons électriques",
    category: "Ballon d’eau chaude",
    subcategory: "Ballon électrique",
    tax: 20,
    unit: "Forfait",
    buy: 0,
    sell: 0,
  }, { organizationId: "org" });
  assert.equal(pose.taux_tva, 10);

  const thermo = formToArticleRecord({
    code: "BAL-TH",
    name: "Ballon thermodynamique 200 L",
    category: "Ballon d’eau chaude",
    subcategory: "Ballon thermodynamique",
    tax: 5.5,
    unit: "Unité",
    buy: 0,
    sell: 0,
  }, { organizationId: "org" });
  assert.equal(thermo.taux_tva, 5.5);
  assert.equal(isElectricWaterHeaterArticle(thermo), false);

  const pack = buildQuoteLinesFromBundle(
    {
      id: "b",
      name: "Chauffeo Plus vertical mural 50 L",
      category: "Ballon d’eau chaude",
      subcategory: "Ballon électrique",
      items: [
        { code: "053005", name: "Chauffeo Plus vertical mural 50 L", price: 0, qty: 1, tax: 20, role: "principal" },
        { code: "INST-BALLON-ELEC", name: "Installation ballons électriques", price: 0, qty: 1, tax: 20, role: "labor" },
      ],
    },
    [],
    { tax: 20, idBase: 1 }
  );
  assert.deepEqual(pack.map(line => line.tax), [10, 10]);
});
