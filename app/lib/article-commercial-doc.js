import { triggerBlobDownload } from "./html-to-pdf.js";
import { resolveQuoteArticle } from "./heat-pump-fiche.js";

export const COMMERCIAL_DOC_MAX_BYTES = 1.8 * 1024 * 1024;

export function articleCommercialDocKey(item = {}) {
  return String(item.articleId || item.id || item.code || item.reference || "").trim();
}

export function articleHasCommercialDoc(article = {}) {
  return String(article?.ficheData || "").startsWith("data:");
}

export function commercialDocFilename(doc = {}, fallback = "documentation-commerciale") {
  const raw = String(doc.ficheName || doc.name || doc.code || fallback).trim() || fallback;
  const base = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
  if (/\.(pdf|png|jpe?g|webp)$/i.test(base)) return base;
  const mime = String(doc.ficheData || "").slice(5, 40);
  if (mime.startsWith("image/png")) return `${base}.png`;
  if (mime.startsWith("image/webp")) return `${base}.webp`;
  if (mime.startsWith("image/")) return `${base}.jpg`;
  return `${base}.pdf`;
}

export function quoteCommercialDocs(items = [], articles = []) {
  const seen = new Set();
  return (items || [])
    .map(item => {
      const article = resolveQuoteArticle(item, articles);
      if (!articleHasCommercialDoc(article)) return null;
      const key = articleCommercialDocKey(item) || articleCommercialDocKey(article);
      if (!key || seen.has(key)) return null;
      seen.add(key);
      return {
        key,
        name: item.name || article.name || "",
        code: item.code || article.code || "",
        brand: item.brand || article.brand || "",
        ficheName: article.ficheName || "",
        ficheData: article.ficheData || "",
      };
    })
    .filter(Boolean);
}

export function selectedCommercialDocs(doc = {}, articles = []) {
  const wanted = Array.isArray(doc.printCommercialDocIds)
    ? doc.printCommercialDocIds.map(String).filter(Boolean)
    : [];
  if (!wanted.length) return [];
  const selected = new Set(wanted);
  return quoteCommercialDocs(doc.items, articles).filter(item => selected.has(String(item.key)));
}

export function dataUrlToBlob(dataUrl) {
  const raw = String(dataUrl || "");
  const comma = raw.indexOf(",");
  if (!raw.startsWith("data:") || comma < 0) throw new Error("Document commercial illisible.");
  const meta = raw.slice(0, comma);
  const payload = raw.slice(comma + 1);
  const mime = /data:([^;,]+)/.exec(meta)?.[1] || "application/octet-stream";
  const binaryString = meta.includes(";base64")
    ? (typeof atob === "function" ? atob(payload) : Buffer.from(payload, "base64").toString("binary"))
    : decodeURIComponent(payload);
  const bytes = new Uint8Array(binaryString.length);
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

export function downloadArticleCommercialDoc(doc = {}) {
  if (typeof document === "undefined") return false;
  if (!articleHasCommercialDoc(doc)) return false;
  const blob = dataUrlToBlob(doc.ficheData);
  const filename = commercialDocFilename(doc);
  if (String(blob.type || "").includes("pdf") || /\.pdf$/i.test(filename)) {
    triggerBlobDownload(blob, filename);
    return true;
  }
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return true;
}

export async function downloadSelectedCommercialDocs(quote = {}, articles = []) {
  const docs = selectedCommercialDocs(quote, articles);
  for (let index = 0; index < docs.length; index += 1) {
    downloadArticleCommercialDoc(docs[index]);
    if (index < docs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 350));
    }
  }
  return docs.length;
}

function imageFormatFromDataUrl(dataUrl) {
  const value = String(dataUrl || "");
  if (value.startsWith("data:image/jpeg") || value.startsWith("data:image/jpg")) return "JPEG";
  if (value.startsWith("data:image/webp")) return "WEBP";
  return "PNG";
}

async function loadPdfJs() {
  if (typeof window === "undefined") return null;
  const src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const worker = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-annex-pdfjs="${src}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Lecture PDF indisponible.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.annexPdfjs = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Lecture PDF indisponible."));
      document.head.appendChild(script);
    });
  }
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) return null;
  pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
  return pdfjsLib;
}

async function pdfDataUrlToImages(dataUrl, maxPages = 12) {
  const pdfjsLib = await loadPdfJs();
  if (!pdfjsLib) return [];
  const blob = dataUrlToBlob(dataUrl);
  const data = new Uint8Array(await blob.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const images = [];
  const count = Math.min(pdf.numPages, maxPages);
  for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    images.push({ data: canvas.toDataURL("image/jpeg", 0.82), format: "JPEG" });
  }
  return images;
}

export async function commercialDocPreview(dataUrl) {
  const value = String(dataUrl || "");
  if (value.startsWith("data:image/")) return value;
  if (value.startsWith("data:application/pdf") || value.includes("application/pdf")) {
    const images = await pdfDataUrlToImages(value, 1);
    return images[0]?.data || "";
  }
  return "";
}

export async function commercialDocsToAnnexImages(docs = []) {
  const images = [];
  for (const doc of docs || []) {
    const dataUrl = String(doc?.ficheData || "");
    if (dataUrl.startsWith("data:image/")) {
      images.push({ data: dataUrl, format: imageFormatFromDataUrl(dataUrl) });
      continue;
    }
    if (dataUrl.startsWith("data:application/pdf")) {
      images.push(...await pdfDataUrlToImages(dataUrl));
    }
  }
  return images;
}
