/** CGV particulières, imprimées à la fin de chaque devis, avant les autres annexes. */

import { PDFDocument } from "pdf-lib";

export const CGV_PDF_PATH = "/cgv/cgv-mkl-energies.pdf";

export function quotePrintsCgv(doc = {}) {
  return String(doc?.kind || "Devis") === "Devis";
}

export async function fetchCgvPdfBytes() {
  const response = await fetch(CGV_PDF_PATH);
  if (!response.ok) throw new Error("Conditions générales introuvables.");
  return new Uint8Array(await response.arrayBuffer());
}

export async function insertCgvAfterQuote(pdfBlob, quotePageCount, cgvBytes) {
  if (!cgvBytes?.byteLength) return pdfBlob;
  const pdf = await PDFDocument.load(await pdfBlob.arrayBuffer());
  const cgv = await PDFDocument.load(cgvBytes);
  const pages = await pdf.copyPages(cgv, cgv.getPageIndices());
  let index = Number(quotePageCount);
  if (!Number.isFinite(index) || index < 0) index = pdf.getPageCount();
  index = Math.min(index, pdf.getPageCount());
  for (const page of pages) {
    pdf.insertPage(index, page);
    index += 1;
  }
  return new Blob([await pdf.save()], { type: "application/pdf" });
}
