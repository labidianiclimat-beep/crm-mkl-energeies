import test from "node:test";
import assert from "assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { insertCgvAfterQuote, quotePrintsCgv } from "../app/lib/devis-cgv.js";

const cgvPath = new URL("../public/cgv/cgv-mkl-energies.pdf", import.meta.url);

test("les conditions generales sont une page A4 livree avec l application", async () => {
  assert.equal(existsSync(cgvPath), true);
  const bytes = readFileSync(cgvPath);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  const { width, height } = pdf.getPage(0).getSize();
  assert.ok(Math.abs(width - 595) < 5);
  assert.ok(Math.abs(height - 842) < 5);
});

test("chaque devis recoit les CGV avant les autres annexes", async () => {
  const quote = await PDFDocument.create();
  quote.addPage([100, 100]);
  quote.addPage([200, 200]);
  const cgv = await PDFDocument.create();
  cgv.addPage([300, 400]);
  const blob = new Blob([await quote.save()], { type: "application/pdf" });
  const result = await insertCgvAfterQuote(blob, 1, await cgv.save());
  const pdf = await PDFDocument.load(await result.arrayBuffer());
  assert.equal(pdf.getPageCount(), 3);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 100, height: 100 });
  assert.deepEqual(pdf.getPage(1).getSize(), { width: 300, height: 400 });
  assert.deepEqual(pdf.getPage(2).getSize(), { width: 200, height: 200 });
});

test("une facture ou un pro forma n ajoute pas les CGV", () => {
  assert.equal(quotePrintsCgv({ kind: "Devis" }), true);
  assert.equal(quotePrintsCgv({}), true);
  assert.equal(quotePrintsCgv({ kind: "Facture" }), false);
  assert.equal(quotePrintsCgv({ kind: "Pro forma" }), false);
});

test("l impression place les CGV juste apres les pages du devis", () => {
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  const picker = readFileSync(new URL("../app/components/devis-annex-picker.js", import.meta.url), "utf8");
  const choices = readFileSync(new URL("../app/lib/devis-annex-choices.js", import.meta.url), "utf8");
  assert.match(print, /insertCgvAfterQuote\(blob, blob\.quotePageCount/);
  assert.match(print, /quotePageCount/);
  assert.doesNotMatch(choices, /id: "cgv"/);
  assert.doesNotMatch(picker, /Joindre les conditions/);
  assert.match(picker, /puis les conditions générales/);
});
