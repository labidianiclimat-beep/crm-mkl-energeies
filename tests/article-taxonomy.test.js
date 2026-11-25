import test from "node:test";
import assert from "node:assert/strict";
import {
  findCategoryByName,
  formToCategoryRecord,
  formToSubcategoryRecord,
  slugifyCatalogName,
  taxonomyNamesEqual,
  validateCategoryPayload,
  validateSubcategoryPayload,
} from "../app/lib/article-taxonomy.js";

test("category payload requires a name", () => {
  const record = formToCategoryRecord({ name: "  " }, { organizationId: "org-1" });
  const errors = validateCategoryPayload(record);
  assert.ok(errors.some(item => /nom/i.test(item)));
});

test("subcategory payload requires parent and name", () => {
  const record = formToSubcategoryRecord({ name: "Mono-split" }, { organizationId: "org-1" });
  const errors = validateSubcategoryPayload(record);
  assert.ok(errors.some(item => /parente/i.test(item)));
});

test("taxonomy names ignore accents and apostrophes", () => {
  assert.equal(taxonomyNamesEqual("Ballon d’eau chaude", "Ballon d'eau chaude"), true);
  assert.equal(taxonomyNamesEqual("Main-d’œuvre", "Main-d'oeuvre"), true);
});

test("slugify catalog names", () => {
  assert.equal(slugifyCatalogName("Pompe à chaleur"), "pompe-a-chaleur");
});

test("findCategoryByName is case-insensitive", () => {
  const rows = [{ id: "1", name: "Climatisation" }, { id: "2", name: "VMC" }];
  assert.equal(findCategoryByName(rows, "climatisation")?.id, "1");
  assert.equal(findCategoryByName(rows, "climatisation", { excludeId: "1" }), null);
});
