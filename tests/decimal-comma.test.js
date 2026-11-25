import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyCommaInsertion, withDecimalComma } from "../app/lib/decimal-comma.js";

test("une virgule française devient un nombre", () => {
  assert.equal(withDecimalComma("214,50"), "214.50");
  assert.equal(withDecimalComma("1 214,50"), "1214.50");
  assert.equal(withDecimalComma("214.50"), "214.50");
  assert.equal(applyCommaInsertion("214", ","), "214.");
  assert.equal(applyCommaInsertion("214.", ","), "214.");
  assert.equal(applyCommaInsertion("21", ",", { selectionStart: 1, selectionEnd: 1 }), "2.1");
  assert.equal(applyCommaInsertion("", "214,50", { replaceAll: true }), "214.50");
});

test("le contrat d’entretien et tous les champs nombre acceptent la virgule", () => {
  const layout = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const field = readFileSync(new URL("../app/components/decimal-comma.js", import.meta.url), "utf8");
  assert.match(layout, /<DecimalComma \/>/);
  assert.match(field, /step = "any"/);
  assert.match(field, /beforeinput/);
  assert.equal(page.match(/name="amount" type="number" min="0" step="any"/g)?.length, 2);
});
