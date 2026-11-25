"use client";

const PDFJS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_WORKER_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const TESSERACT_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-scan-src="${src}"]`);
    if (existing) {
      if (existing.getAttribute("data-loaded") === "1") resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.scanSrc = src;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error("Impossible de charger le scanner."));
    document.head.appendChild(script);
  });
}

async function loadPdfJs() {
  await loadScript(PDFJS_SRC);
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) throw new Error("Scanner PDF indisponible.");
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  return pdfjsLib;
}

async function loadTesseract() {
  await loadScript(TESSERACT_SRC);
  if (!window.Tesseract) throw new Error("Scanner OCR indisponible.");
  return window.Tesseract;
}

function textFromPdfContent(content) {
  const buckets = new Map();
  for (const item of content.items || []) {
    const str = String(item.str || "");
    if (!str.trim()) continue;
    const y = Math.round((item.transform?.[5] || 0) / 3) * 3;
    const x = item.transform?.[4] || 0;
    if (!buckets.has(y)) buckets.set(y, []);
    buckets.get(y).push({ x, str });
  }
  return [...buckets.entries()]
    .sort((left, right) => right[0] - left[0])
    .map(([, cells]) => cells.sort((left, right) => left.x - right.x).map(cell => cell.str).join(" "))
    .join("\n");
}

async function recognizeImage(source, onProgress) {
  const Tesseract = await loadTesseract();
  const result = await Tesseract.recognize(source, "fra+eng", {
    logger(info) {
      if (info?.status === "recognizing text" && typeof onProgress === "function") {
        onProgress(`Lecture OCR… ${Math.round((info.progress || 0) * 100)} %`);
      }
    },
  });
  return String(result?.data?.text || "").trim();
}

async function ocrPdfPages(pdf, onProgress) {
  const maxPages = Math.min(pdf.numPages, 4);
  const parts = [];
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    onProgress?.(`Scan page ${pageNumber}/${maxPages}…`);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    parts.push(await recognizeImage(canvas, onProgress));
  }
  return parts.filter(Boolean).join("\n");
}

export async function extractTextFromHeatPumpFile(file, { onProgress } = {}) {
  if (!file) return "";
  const type = String(file.type || "").toLowerCase();
  if (type.startsWith("image/")) {
    onProgress?.("Lecture de l’image…");
    return recognizeImage(file, onProgress);
  }
  onProgress?.("Lecture du PDF…");
  const pdfjsLib = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const parts = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    parts.push(textFromPdfContent(await page.getTextContent()));
  }
  const text = parts.join("\n").replace(/[ \t]+\n/g, "\n").trim();
  if (text.replace(/\s+/g, " ").length >= 180) return text;
  onProgress?.("Peu de texte trouvé, scan visuel…");
  const ocr = await ocrPdfPages(pdf, onProgress);
  return [text, ocr].filter(Boolean).join("\n");
}
