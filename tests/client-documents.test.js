import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CLIENT_DOCUMENT_KIND_GROUPS,
  CLIENT_DOCUMENT_KINDS,
  isPersistedClientId,
  nextAvailableDocumentKind,
  mergedDownloadName,
  normalizeDocumentIds,
  normalizeDocumentKind,
  normalizeDocumentTitle,
  buildStoredDocument,
  parseJpegPages,
  storagePathForDocument,
  documentToUi,
} from "../app/lib/client-documents.js";
import { normalizeClientPortalAccess } from "../app/lib/client-portal.js";
import { PDFDocument } from "pdf-lib";
import { extractJpegsFromPdf, inspectJpeg, jpegPagesToPdf, mergeJpegPdfs, mergeStoredPdfs } from "../app/lib/jpeg-pdf.js";

function tinyJpeg({ width = 1, height = 1 } = {}) {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b,
    0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00,
    0x3f, 0x00, 0x7f, 0xff, 0xd9,
  ]);
}

test("accepte seulement les fiches client persistées", () => {
  assert.equal(isPersistedClientId("2f1c6d5a-4b8e-4a11-9c2d-7e8f9a0b1c2d"), true);
  assert.equal(isPersistedClientId("1742160000000"), false);
  assert.equal(isPersistedClientId("client:abc"), false);
});

test("normalise le type et le libellé du justificatif", () => {
  assert.equal(normalizeDocumentKind("Avis d'imposition"), "Avis d'imposition");
  assert.equal(normalizeDocumentTitle("  CNI recto  ", "Pièce d'identité"), "CNI recto");
  assert.equal(normalizeDocumentTitle("", "RIB"), "RIB");
  assert.ok(CLIENT_DOCUMENT_KINDS.includes("Pièce d'identité"));
  assert.ok(CLIENT_DOCUMENT_KINDS.includes("Bulletin de paie"));
  assert.ok(CLIENT_DOCUMENT_KINDS.indexOf("Bulletin de paie") < CLIENT_DOCUMENT_KINDS.indexOf("Autre document"));
  assert.equal(CLIENT_DOCUMENT_KINDS.at(-1), "Autre document");
  assert.equal(CLIENT_DOCUMENT_KINDS[CLIENT_DOCUMENT_KINDS.indexOf("RIB") + 1], "AH");
  assert.ok(CLIENT_DOCUMENT_KINDS.indexOf("Bon de commande signé") < CLIENT_DOCUMENT_KINDS.indexOf("Autre document"));
  assert.ok(CLIENT_DOCUMENT_KINDS.indexOf("Rapport de prévisite") < CLIENT_DOCUMENT_KINDS.indexOf("Bon de commande signé"));
  assert.deepEqual(CLIENT_DOCUMENT_KIND_GROUPS.map(group => group.label), [
    "Identité",
    "Revenus",
    "Logement",
    "Bancaire",
    "Technique",
    "Commande",
    "Autre",
  ]);
  assert.equal(nextAvailableDocumentKind(["Pièce d'identité"], "Avis d'imposition"), "Bulletin de paie");
  assert.throws(() => normalizeDocumentKind("Passeport alien"), /type de document/i);
  const vault = readFileSync(new URL("../app/components/client-document-vault.js", import.meta.url), "utf8");
  assert.match(vault, /CLIENT_DOCUMENT_KIND_GROUPS/);
  assert.match(vault, /nextAvailableDocumentKind/);
  assert.match(vault, /CLIENT_PORTAL_FIELDS/);
  assert.match(vault, /application\/pdf/);
  assert.match(vault, /Photo ou PDF/);
  const portal = readFileSync(new URL("../app/lib/client-portal.js", import.meta.url), "utf8");
  assert.match(portal, /Identifiant EDF/);
  assert.match(portal, /Mdp EDF/);
  assert.match(portal, /Identifiant MPR/);
  assert.match(portal, /Mdp MPR/);
  const access = normalizeClientPortalAccess({
    edfLogin: "  alice  ",
    edfLoginOn: true,
    edfPassword: "secret",
    mprLogin: "mpr-1",
    mprPasswordOn: true,
  });
  assert.equal(access.edfLogin, "alice");
  assert.equal(access.edfLoginOn, true);
  assert.equal(access.edfPassword, "secret");
  assert.equal(access.edfPasswordOn, false);
  assert.equal(access.mprLogin, "mpr-1");
  assert.equal(access.mprLoginOn, false);
  assert.equal(access.mprPasswordOn, true);
});

test("construit le chemin Storage et la vue UI", () => {
  assert.equal(
    storagePathForDocument({
      organizationId: "org-1",
      clientId: "cli-1",
      documentId: "doc-1",
    }),
    "org-1/cli-1/doc-1.pdf"
  );
  const ui = documentToUi({
    id: "doc-1",
    client_id: "cli-1",
    kind: "RIB",
    title: "RIB CIC",
    page_count: 2,
    file_size: 12000,
    created_at: "2026-09-18T10:00:00.000Z",
    created_by: "user-1",
  });
  assert.equal(ui.pageCount, 2);
  assert.equal(ui.title, "RIB CIC");
});

test("un fichier PDF est conserve et telechargeable", async () => {
  const source = await PDFDocument.create();
  source.addPage();
  const pdf = Buffer.from(await source.save());
  const stored = buildStoredDocument([pdf]);
  assert.equal(stored.pdf.equals(pdf), true);
  assert.equal(stored.pageCount, 1);
  assert.throws(() => buildStoredDocument([pdf, tinyJpeg()]), /un seul fichier PDF/i);
  const photo = jpegPagesToPdf([tinyJpeg()]);
  const merged = await mergeStoredPdfs([photo, pdf]);
  assert.match(merged.toString("latin1"), /^%PDF-/);
  const opened = await PDFDocument.load(merged);
  assert.equal(opened.getPageCount(), 2);
});

test("refuse une page qui n’est pas un JPEG", () => {
  assert.throws(() => parseJpegPages([Buffer.from("%PDF-1.4")]), /JPEG/i);
  assert.throws(() => parseJpegPages([]), /photo/i);
});

test("lit la taille JPEG et assemble un PDF multi-pages", () => {
  const page = tinyJpeg({ width: 800, height: 1200 });
  const info = inspectJpeg(page);
  assert.equal(info.width, 800);
  assert.equal(info.height, 1200);
  assert.equal(info.components, 3);

  const pdf = jpegPagesToPdf([page, tinyJpeg({ width: 1200, height: 800 })]);
  const text = pdf.toString("latin1");
  assert.match(text, /^%PDF-1.4/);
  assert.match(text, /\/Type \/Pages/);
  assert.match(text, /\/Count 2/);
  assert.match(text, /\/Filter \/DCTDecode/);
  assert.match(text, /%%EOF/);
  assert.ok(pdf.includes(page));
});

test("extrait les photos et fusionne plusieurs PDF en un fichier", () => {
  const identity = tinyJpeg({ width: 400, height: 600 });
  const tax = tinyJpeg({ width: 600, height: 400 });
  const home = tinyJpeg({ width: 500, height: 700 });
  const merged = mergeJpegPdfs([
    jpegPagesToPdf([identity]),
    jpegPagesToPdf([tax]),
    jpegPagesToPdf([home]),
  ]);
  const photos = extractJpegsFromPdf(merged);
  assert.equal(photos.length, 3);
  assert.equal(inspectJpeg(photos[0]).height, 600);
  assert.equal(inspectJpeg(photos[1]).width, 600);
  assert.match(merged.toString("latin1"), /\/Count 3/);
});

test("normalise la sélection de justificatifs", () => {
  assert.deepEqual(
    normalizeDocumentIds(["2f1c6d5a-4b8e-4a11-9c2d-7e8f9a0b1c2d", "2f1c6d5a-4b8e-4a11-9c2d-7e8f9a0b1c2d"]),
    ["2f1c6d5a-4b8e-4a11-9c2d-7e8f9a0b1c2d"]
  );
  assert.throws(() => normalizeDocumentIds([]), /sélectionnez/i);
  assert.equal(mergedDownloadName([{ kind: "RIB" }, { kind: "RIB" }]), "RIB.pdf");
  assert.equal(
    mergedDownloadName([{ kind: "Pièce d'identité" }, { kind: "Avis d'imposition" }]),
    "justificatifs-client.pdf"
  );
});
