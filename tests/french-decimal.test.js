import assert from "node:assert/strict";
import test from "node:test";
import { formatTaxRate, frenchDecimalText, parseFrenchDecimal } from "../app/lib/article-picker.js";

test("une virgule française se lit comme un montant", () => {
  assert.equal(parseFrenchDecimal("1 250,5"), 1250.5);
  assert.equal(parseFrenchDecimal("12,50"), 12.5);
  assert.equal(parseFrenchDecimal(""), null);
  assert.equal(frenchDecimalText(5.5), "5,5");
  assert.equal(formatTaxRate(5.5), "5,5 %");
  assert.equal(formatTaxRate(20), "20 %");
});
