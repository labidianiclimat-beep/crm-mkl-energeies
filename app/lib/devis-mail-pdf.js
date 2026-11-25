/** PDF officiel d’un devis enregistré : pages du devis, puis les CGV. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDevisPdfBlob } from "./devis-pdf.js";
import { insertCgvAfterQuote } from "./devis-cgv.js";

export function readPublicAsset(name) {
  const candidates = [
    join(process.cwd(), "public", name),
    join(process.cwd(), name),
  ];
  let lastError;
  for (const file of candidates) {
    try {
      return readFileSync(file);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function imageDataUrl(name) {
  const type = name.endsWith(".png") ? "png" : "jpeg";
  return `data:image/${type};base64,${readPublicAsset(name).toString("base64")}`;
}

export async function buildStoredDevisPdf(doc, { clients = [], company } = {}) {
  const blob = await buildDevisPdfBlob(doc, {
    clients,
    company,
    logoData: imageDataUrl("mkl-energies.png"),
    rgeLogoData: imageDataUrl("rge-qualifelec.png"),
    annexImages: [],
  });
  const withCgv = await insertCgvAfterQuote(blob, blob.quotePageCount, readPublicAsset("cgv/cgv-mkl-energies.pdf"));
  return Buffer.from(await withCgv.arrayBuffer());
}

export function mklLogoAttachment() {
  return {
    filename: "mkl-energies.png",
    content: readPublicAsset("mkl-energies.png").toString("base64"),
    contentType: "image/png",
    cid: "mkl-logo",
  };
}
