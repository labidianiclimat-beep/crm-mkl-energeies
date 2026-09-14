import test from "node:test";
import assert from "node:assert/strict";
import {
  brandToUi,
  findBrandByName,
  findBrandLogo,
  formToBrandRecord,
  validateBrandPayload,
} from "../app/lib/brands.js";
import { brandsForCategory } from "../app/lib/article-picker.js";

test("brand payload requires name and accepts data logo", () => {
  const record = formToBrandRecord(
    { name: " Dualsun ", logoUrl: "data:image/png;base64,aaa", status: "Actif" },
    { organizationId: "org-1", createdBy: "user-1" }
  );
  assert.equal(record.name, "Dualsun");
  assert.equal(record.logo_url.startsWith("data:image/"), true);
  assert.deepEqual(validateBrandPayload(record), []);
});

test("brand validation rejects empty name", () => {
  const errors = validateBrandPayload(formToBrandRecord({ name: "  " }, { organizationId: "org" }));
  assert.ok(errors.some(item => /nom/i.test(item)));
});

test("findBrandByName is case-insensitive", () => {
  const rows = [{ id: "1", name: "Daikin" }, { id: "2", name: "Toshiba" }];
  assert.equal(findBrandByName(rows, "daikin")?.id, "1");
  assert.equal(findBrandByName(rows, "daikin", { excludeId: "1" }), null);
});

test("brandToUi maps actif and logo", () => {
  const ui = brandToUi({ id: "b1", name: "BWT", logo_url: "https://x/logo.png", actif: true });
  assert.equal(ui.logoUrl, "https://x/logo.png");
  assert.equal(ui.status, "Actif");
});

test("picker brands expose logo from catalog", () => {
  const articles = [
    { id: "1", code: "A", name: "Split", category: "Climatisation", brand: "Daikin", sell: 1, tax: 20, status: "Actif" },
  ];
  const catalog = [{ name: "Daikin", logoUrl: "data:image/png;base64,xx", active: true }];
  const brands = brandsForCategory(articles, "climatisation", { brandCatalog: catalog });
  assert.equal(brands[0].logoUrl, "data:image/png;base64,xx");
  assert.equal(findBrandLogo(catalog, "daikin"), "data:image/png;base64,xx");
});
