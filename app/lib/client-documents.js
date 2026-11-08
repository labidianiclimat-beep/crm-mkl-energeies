import { jpegPagesToPdf } from "./jpeg-pdf.js";

export const CLIENT_DOCUMENTS_BUCKET = "client-documents";
export const MAX_CLIENT_DOCUMENT_PAGES = 8;
export const MAX_CLIENT_DOCUMENT_PAGE_BYTES = 4 * 1024 * 1024;
export const MAX_CLIENT_DOCUMENT_TOTAL_BYTES = 3_800_000;

export const CLIENT_DOCUMENT_KIND_GROUPS = [
  { id: "identite", label: "Identité", kinds: ["Pièce d'identité"] },
  { id: "revenus", label: "Revenus", kinds: ["Avis d'imposition", "Bulletin de paie"] },
  { id: "logement", label: "Logement", kinds: ["Justificatif de domicile", "Taxe foncière"] },
  { id: "bancaire", label: "Bancaire", kinds: ["RIB", "AH"] },
  { id: "technique", label: "Technique", kinds: ["Rapport de prévisite"] },
  { id: "commande", label: "Commande", kinds: ["Bon de commande signé"] },
  { id: "autre", label: "Autre", kinds: ["Autre document"] },
];

export const CLIENT_DOCUMENT_KINDS = CLIENT_DOCUMENT_KIND_GROUPS.flatMap(group => group.kinds);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPersistedClientId(id) {
  return UUID_RE.test(String(id || "").trim());
}

export function normalizeDocumentKind(kind) {
  const value = String(kind || "").trim();
  if (CLIENT_DOCUMENT_KINDS.includes(value)) return value;
  throw new Error("Choisissez le type de document.");
}

export function nextAvailableDocumentKind(usedKinds = [], afterKind = "") {
  const used = new Set((usedKinds || []).map(item => String(item || "").trim()).filter(Boolean));
  if (afterKind) used.add(String(afterKind).trim());
  return CLIENT_DOCUMENT_KINDS.find(item => !used.has(item)) || CLIENT_DOCUMENT_KINDS[0];
}

export function normalizeDocumentTitle(title, kind) {
  const value = String(title || "").trim().replace(/\s+/g, " ");
  return (value || kind).slice(0, 120);
}

export function storagePathForDocument({ organizationId, clientId, ownerId, documentId }) {
  return `${organizationId}/${clientId || ownerId}/${documentId}.pdf`;
}

export function parseJpegPages(buffers) {
  if (!buffers?.length) throw new Error("Ajoutez au moins une photo.");
  if (buffers.length > MAX_CLIENT_DOCUMENT_PAGES) {
    throw new Error(`${MAX_CLIENT_DOCUMENT_PAGES} pages maximum par document.`);
  }

  let total = 0;
  return buffers.map((raw, index) => {
    const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    total += bytes.length;
    if (bytes.length > MAX_CLIENT_DOCUMENT_PAGE_BYTES) {
      throw new Error(`La page ${index + 1} est trop lourde.`);
    }
    if (total > MAX_CLIENT_DOCUMENT_TOTAL_BYTES) {
      throw new Error("Le document dépasse la taille maximale. Reprenez moins de pages, ou plus près.");
    }
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new Error(`La page ${index + 1} n’est pas une photo JPEG.`);
    }
    return bytes;
  });
}

export function isPdfBuffer(raw) {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw || []);
  return bytes.length >= 5 && bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

function pdfPageCount(pdf) {
  const matches = pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g);
  return Math.max(1, matches?.length || 1);
}

/** Photos JPEG assemblées en PDF, ou un fichier PDF conservé tel quel. */
export function buildStoredDocument(buffers) {
  const pages = (buffers || []).map(raw => (Buffer.isBuffer(raw) ? raw : Buffer.from(raw || [])));
  if (!pages.length) throw new Error("Ajoutez au moins une photo ou un PDF.");
  const pdfs = pages.filter(isPdfBuffer);
  if (pdfs.length) {
    if (pdfs.length !== 1 || pages.length !== 1) {
      throw new Error("Ajoutez des photos, ou un seul fichier PDF.");
    }
    const pdf = pdfs[0];
    if (pdf.length > MAX_CLIENT_DOCUMENT_TOTAL_BYTES) {
      throw new Error("Le PDF est trop lourd.");
    }
    return { pdf, pageCount: pdfPageCount(pdf) };
  }
  const jpegs = parseJpegPages(pages);
  return { pdf: jpegPagesToPdf(jpegs), pageCount: jpegs.length };
}

export function documentToUi(row) {
  if (!row) return null;
  return {
    id: row.id,
    clientId: row.client_id || row.prospect_id,
    prospectId: row.prospect_id || null,
    kind: row.kind,
    title: row.title,
    pageCount: Number(row.page_count || 1),
    fileSize: Number(row.file_size || 0),
    createdAt: row.created_at,
    createdBy: row.created_by || null,
  };
}

export function normalizeDocumentIds(ids) {
  const list = [...new Set((ids || []).map(id => String(id || "").trim()).filter(isPersistedClientId))];
  if (!list.length) throw new Error("Sélectionnez au moins un document.");
  if (list.length > 20) throw new Error("20 documents maximum par fichier.");
  return list;
}

export function mergedDownloadName(documents = []) {
  const kinds = [...new Set(documents.map(doc => doc.kind).filter(Boolean))];
  if (kinds.length === 1) return `${kinds[0]}.pdf`;
  return "justificatifs-client.pdf";
}
