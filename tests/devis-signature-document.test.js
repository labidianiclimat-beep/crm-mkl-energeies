import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { isPdfBuffer } from "../app/lib/client-documents.js";
import { devisPdfBytesFromDocument } from "../app/lib/devis-signature-document.js";

test("le devis enregistré devient un PDF sans fichier téléchargé", async () => {
  const bytes = await devisPdfBytesFromDocument({
    kind: "Devis",
    number: "DEV-2026-000088",
    client: "Client",
    date: "2026-11-16",
    due: "2026-12-16",
    deliveryDate: "2026-12-31",
    items: [{ name: "Prestation", qty: 1, unit: 100, tax: 20 }],
  });
  assert.equal(isPdfBuffer(bytes), true);
  const pdf = await PDFDocument.load(bytes);
  const cgv = await PDFDocument.load(readFileSync(new URL("../public/cgv/cgv-mkl-energies.pdf", import.meta.url)));
  assert.equal(pdf.getPageCount(), 2);
  assert.deepEqual(pdf.getPage(1).getSize(), cgv.getPage(0).getSize());
});

test("la validation ne redemande pas de télécharger le PDF", () => {
  const panel = readFileSync(new URL("../app/components/commercial-sale-panel.js", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../app/components/devis-wizard.js", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/devis/[id]/signature/route.js", import.meta.url), "utf8");
  assert.match(panel, /Soumettre à la validation/);
  assert.match(panel, /useStoredDevis: true/);
  assert.doesNotMatch(panel, /Superadmin|Admin VIP|type="file"|Action impossible/);
  assert.match(wizard, /Soumettre à la validation/);
  assert.doesNotMatch(wizard, /Faire signer/);
  assert.match(route, /useStoredDevis === true/);
  assert.match(route, /storedDevisPdfBytes/);
});
