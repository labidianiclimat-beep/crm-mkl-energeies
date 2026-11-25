import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import {
  appendPdfBytes,
  articleHasCommercialDoc,
  commercialDocFilename,
  commercialDocPath,
  quoteCommercialDocs,
  selectedCommercialDocs,
  selectedCommercialPdfPaths,
} from "../app/lib/article-commercial-doc.js";
import { devisAnnexChoices } from "../app/lib/devis-annex-choices.js";
import { collectDevisAnnexImages } from "../app/lib/devis-print.js";
import { documentToWizardState, emptyWizardState, wizardToPayload } from "../app/lib/devis-wizard.js";
import { formToDevisRecord } from "../app/lib/devis.js";

const SAMPLE_PDF = "data:application/pdf;base64,JVBERi0xLjQ=";

test("un article sans fichier n a pas de documentation commerciale", () => {
  assert.equal(articleHasCommercialDoc({ ficheName: "doc.pdf" }), false);
  assert.equal(articleHasCommercialDoc({ ficheData: SAMPLE_PDF, ficheName: "doc.pdf" }), true);
});

test("un devis propose seulement les documents charges, decocher par defaut", () => {
  const items = [
    { id: "l1", articleId: "a1", name: "UI Toshiba", code: "RAS-B10" },
    { id: "l2", articleId: "a2", name: "Accessoire", code: "ACC-1" },
  ];
  const articles = [
    { id: "a1", code: "RAS-B10", name: "UI Toshiba", ficheName: "brochure.pdf", ficheData: SAMPLE_PDF },
    { id: "a2", code: "ACC-1", name: "Accessoire" },
  ];
  const docs = quoteCommercialDocs(items, articles);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].key, "a1");
  assert.equal(docs[0].ficheName, "brochure.pdf");
  assert.equal(selectedCommercialDocs({ items }, articles).length, 0);
  assert.equal(selectedCommercialDocs({ items, printCommercialDocIds: [] }, articles).length, 0);
  assert.equal(selectedCommercialDocs({ items, printCommercialDocIds: ["a1"] }, articles).length, 1);
  assert.equal(commercialDocFilename(docs[0]), "brochure.pdf");
});

test("le choix de telechargement survit a l assistant devis", () => {
  const state = emptyWizardState();
  assert.deepEqual(state.printCommercialDocIds, []);
  state.clientId = "c1";
  state.printCommercialDocIds = ["a1"];
  state.items = [{ id: 1, articleId: "a1", name: "UI", qty: 1, unit: 100, tax: 20 }];
  const payload = wizardToPayload(state);
  assert.deepEqual(payload.printCommercialDocIds, ["a1"]);
  const restored = documentToWizardState({ ...payload, id: "11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(restored.printCommercialDocIds, ["a1"]);
  const { header } = formToDevisRecord(payload);
  assert.deepEqual(header.extra.printCommercialDocIds, ["a1"]);
});

test("le formulaire article et le recap devis exposent la documentation commerciale", () => {
  const fields = readFileSync(new URL("../app/components/article-commercial-doc-field.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../app/components/devis-wizard.js", import.meta.url), "utf8");
  const picker = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  const pac = readFileSync(new URL("../app/components/heat-pump-spec-fields.js", import.meta.url), "utf8");
  assert.match(fields, /Ajouter un PDF/);
  assert.match(fields, /PDF commercial/);
  assert.match(page, /ArticleCommercialDocField/);
  assert.match(page, /<ArticleCommercialDocField/);
  assert.match(picker, /ArticleCommercialDocField/);
  assert.match(wizard, /Documentation commerciale/);
  assert.match(wizard, /après le devis/);
  assert.match(wizard, /printCommercialDocIds/);
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  assert.match(print, /collectDevisAnnexImages/);
  assert.match(print, /selectedCommercialDocs/);
});

test("l impression colle les PDF commerciaux choisis", async () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const images = await collectDevisAnnexImages(
    {
      items: [
        { id: "l1", articleId: "a1", name: "UI" },
        { id: "l2", articleId: "a2", name: "Accessoire" },
      ],
      printCommercialDocIds: ["a2", "a1"],
    },
    {
      articles: [
        { id: "a1", ficheName: "ui.png", ficheData: png },
        { id: "a2", ficheName: "acc.png", ficheData: png },
      ],
      company: { cgvName: "cgv.png", cgvData: png },
    }
  );
  assert.equal(images.length, 2);
  assert.equal(images[0].data, png);
  assert.equal(images[1].data, png);
});

test("une facture ou pro forma n emporte ni CERFA ni documentation commerciale", async () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const quoteLike = {
    items: [{ id: "l1", articleId: "a1", name: "PAC", tax: 5.5 }],
    printCommercialDocIds: ["a1"],
    printCerfaTva: true,
  };
  const options = {
    articles: [{ id: "a1", ficheName: "fiche.png", ficheData: png }],
    company: { cgvName: "cgv.png", cgvData: png },
  };
  const facture = await collectDevisAnnexImages({ ...quoteLike, kind: "Facture" }, options);
  const proforma = await collectDevisAnnexImages({ ...quoteLike, kind: "Pro forma" }, options);
  assert.equal(facture.length, 0);
  assert.equal(proforma.length, 0);
});

test("la fiche Edel est proposée à la validation sans être collée dans l article", () => {
  const path = "/fiches/fiche-technique-edel-auer.pdf";
  assert.equal(commercialDocPath(path), path);
  assert.equal(commercialDocPath("../fiches/fiche.pdf"), "");
  assert.equal(commercialDocPath("https://example.com/fiche.pdf"), "");
  assert.equal(articleHasCommercialDoc({ ficheData: path, ficheName: "fiche-technique-edel-auer.pdf" }), true);
  const articles = [{
    id: "edel-270",
    code: "EDEL-270D-2",
    name: "Edel 270D/2",
    ficheName: "fiche-technique-edel-auer.pdf",
    ficheData: path,
  }];
  const doc = {
    kind: "Devis",
    items: [{ id: "l1", articleId: "edel-270", name: "Edel 270D/2" }],
    printCommercialDocIds: ["edel-270"],
  };
  const choices = devisAnnexChoices(doc, articles);
  assert.equal(choices.some(item => item.id === "commercial:edel-270" && item.checked), true);
  assert.deepEqual(selectedCommercialPdfPaths(doc, articles), [path]);
  assert.equal(selectedCommercialPdfPaths({ ...doc, printCommercialDocIds: [] }, articles).length, 0);
});

test("un PDF commercial servi par un chemin est ajouté à la fin du devis", async () => {
  const quote = await PDFDocument.create();
  quote.addPage();
  const quoteBlob = new Blob([await quote.save()], { type: "application/pdf" });
  quoteBlob.quotePageCount = 1;
  const annex = await PDFDocument.create();
  annex.addPage();
  annex.addPage();
  const merged = await appendPdfBytes(quoteBlob, [new Uint8Array(await annex.save())]);
  const out = await PDFDocument.load(await merged.arrayBuffer());
  assert.equal(out.getPageCount(), 3);
  assert.equal(merged.quotePageCount, 1);
});
