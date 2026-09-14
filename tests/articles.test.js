import test from "node:test";
import assert from "node:assert/strict";
import {
  findArticleByReference,
  formToArticleRecord,
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

test("rejects unknown category", () => {
  const record = formToArticleRecord({
    code: "X-1",
    name: "Test",
    category: "Inconnue",
    buy: 1,
    sell: 2,
    tax: 20,
    unit: "Unité",
  });
  const errors = validateArticlePayload(record);
  assert.ok(errors.some(error => /catégorie/i.test(error)));
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
