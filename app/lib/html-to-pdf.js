"use client";

import { paginateMaintenanceSheets } from "./maintenance-pdf.js";
import { paginateFlowSheets } from "./pdf-paginate.js";

const HTML2CANVAS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
const JSPDF_SRC = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const A4 = { width: 210, height: 297 };
const A4_PX = { width: 794, height: 1123 };

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-html2pdf-src="${src}"]`);
    if (existing) {
      if (existing.getAttribute("data-loaded") === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Générateur PDF indisponible.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.html2pdfSrc = src;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error("Générateur PDF indisponible."));
    document.head.appendChild(script);
  });
}

export function pdfFilename(title, fallback = "document") {
  const base = String(title || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

export function downloadPdfName(filename, title, fallback = "document") {
  const raw = String(filename || "").trim();
  if (/\.pdf$/i.test(raw) && /\s/.test(raw)) {
    const cleaned = raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w .'’-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
    return cleaned || pdfFilename(title, fallback);
  }
  return pdfFilename(filename || title, fallback);
}

export function asPdfBlob(blob) {
  if (!blob) return blob;
  if (blob.type === "application/pdf") return blob;
  return new Blob([blob], { type: "application/pdf" });
}

export function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  return Boolean(window.navigator?.standalone)
    || window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: fullscreen)").matches
    || window.matchMedia("(display-mode: minimal-ui)").matches;
}

export function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "");
  return /iPad|iPhone|iPod/i.test(ua)
    || (navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1);
}

export function needsInAppPdfViewer() {
  if (typeof window === "undefined") return false;
  return isStandaloneDisplay() || isIosDevice();
}

function showStandalonePdfViewer(url, filename, blob) {
  document.getElementById("mkl-pdf-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "mkl-pdf-overlay";
  overlay.className = "mkl-pdf-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", filename || "PDF");
  overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:#152347;display:flex;flex-direction:column;";
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:max(14px,env(safe-area-inset-top)) 14px max(12px,env(safe-area-inset-bottom));background:#152347;flex-shrink:0;";
  const back = document.createElement("button");
  back.type = "button";
  back.textContent = "Retour à l’application";
  back.style.cssText = "border:0;border-radius:8px;padding:12px 16px;background:#fff;color:#152347;font:800 15px/1 'DM Sans',sans-serif;cursor:pointer;touch-action:manipulation";
  const share = document.createElement("button");
  share.type = "button";
  share.textContent = "Enregistrer";
  share.style.cssText = "border:0;border-radius:8px;padding:12px 16px;background:#ffcc00;color:#1a2850;font:800 15px/1 'DM Sans',sans-serif;cursor:pointer;touch-action:manipulation";
  let closed = false;
  function close(fromPop = false) {
    if (closed) return;
    closed = true;
    overlay.remove();
    window.removeEventListener("popstate", onPop);
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    if (!fromPop && window.history.state?.mklPdfOverlay) window.history.back();
  }
  function onPop() {
    close(true);
  }
  back.addEventListener("click", () => close());
  share.addEventListener("click", async () => {
    try {
      const file = new File([blob], filename || "document.pdf", { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: filename || "document.pdf" });
        return;
      }
    } catch {
      /* repli ci-dessous */
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "document.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
  });
  const label = document.createElement("span");
  label.textContent = filename || "document.pdf";
  label.style.cssText = "flex:1;min-width:160px;color:#fff;font:700 13px/1.3 'DM Sans',sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
  bar.append(back, label, share);
  overlay.append(bar);
  const frame = document.createElement("embed");
  frame.type = "application/pdf";
  frame.src = url;
  frame.title = filename || "PDF";
  frame.style.cssText = "flex:1;width:100%;min-height:0;border:0;background:#fff";
  overlay.append(frame);
  document.body.appendChild(overlay);
  window.history.pushState({ mklPdfOverlay: 1 }, "");
  window.addEventListener("popstate", onPop);
}

export function reservePdfTab() {
  if (typeof window === "undefined" || needsInAppPdfViewer()) return null;
  const tab = window.open("about:blank", "_blank");
  if (!tab) return null;
  try {
    tab.document.write("<!doctype html><title>Préparation du PDF…</title><body style=\"margin:0;padding:28px;font:16px/1.4 'DM Sans',sans-serif;color:#152347;background:#f7f9fe\">Préparation du PDF…</body>");
    tab.document.close();
  } catch {
    /* onglet déjà navigué */
  }
  return tab;
}

function pdfFrameHtml(url, filename) {
  const title = String(filename || "document.pdf")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title><style>html,body{margin:0;height:100%;background:#323639}embed{border:0;width:100%;height:100%;display:block}</style></head><body><embed type="application/pdf" src="${url}" title="${title}"></body></html>`;
}

function presentPdfInTab(tab, blob, filename) {
  let url = "";
  try {
    url = tab.URL.createObjectURL(blob);
  } catch {
    url = URL.createObjectURL(blob);
  }
  try {
    const doc = tab.document;
    doc.open();
    doc.write(pdfFrameHtml(url, filename));
    doc.close();
    tab.focus?.();
  } catch {
    try { tab.location.replace(url); } catch { /* onglet bloqué */ }
  }
  window.setTimeout(() => {
    try { (tab.URL || URL).revokeObjectURL(url); } catch { /* ignore */ }
  }, 120_000);
  return url;
}

export function triggerBlobDownload(blob, filename, tab = null) {
  if (typeof document === "undefined") return "";
  const typed = asPdfBlob(blob);
  const name = filename || "document.pdf";
  if (needsInAppPdfViewer()) {
    try { tab?.close(); } catch { /* ignore */ }
    const url = URL.createObjectURL(typed);
    showStandalonePdfViewer(url, name, typed);
    return url;
  }
  try { tab?.close(); } catch { /* ignore */ }
  const url = URL.createObjectURL(typed);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener noreferrer";
  link.title = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return url;
}

async function waitForImages(root) {
  const images = [...(root.querySelectorAll?.("img") || [])];
  await Promise.all(
    images.map(image => {
      if (image.complete) return Promise.resolve();
      return new Promise(resolve => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    })
  );
  if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
}

function mountPrintableHtml(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const host = document.createElement("div");
  host.dataset.pdfHost = "1";
  host.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    "width:210mm",
    "background:#fff",
    "color:#1f2d4f",
    "z-index:2147483000",
    "opacity:1",
    "pointer-events:none",
  ].join(";");
  parsed.querySelectorAll("style, link[rel='stylesheet']").forEach(node => host.appendChild(node.cloneNode(true)));
  const body = parsed.body.cloneNode(true);
  body.querySelectorAll(".doc-preview-bar, .no-print, .form-toolbar, .study-toolbar, .save-toast").forEach(node => node.remove());
  while (body.firstChild) host.appendChild(body.firstChild);
  host.querySelectorAll(".sheet").forEach(lockCapturedSheet);
  document.body.appendChild(host);
  return host;
}

function lockCapturedSheet(sheet) {
  if (!sheet || sheet.classList.contains("sheet-flow")) {
    if (sheet) {
      sheet.style.height = "auto";
      sheet.style.minHeight = "0";
      sheet.style.maxHeight = "none";
      sheet.style.overflow = "visible";
    }
    return;
  }
  sheet.style.margin = "0";
  sheet.style.boxShadow = "none";
  sheet.style.pageBreakBefore = "auto";
  sheet.style.background = "#fff";
  sheet.style.width = "210mm";
  sheet.style.maxWidth = "210mm";
  sheet.style.height = "297mm";
  sheet.style.minHeight = "297mm";
  sheet.style.maxHeight = "297mm";
  sheet.style.overflow = "hidden";
  sheet.style.boxSizing = "border-box";
}

function pdfError(error) {
  const message = String(error?.message || error || "");
  if (/is not defined|html2canvas|jspdf|html2pdf/i.test(message)) {
    return new Error("Génération du PDF impossible. Réessayez dans quelques secondes.");
  }
  return error instanceof Error ? error : new Error(message || "Génération du PDF impossible.");
}

function jsPdfCtor() {
  return window.jspdf?.jsPDF || window.jsPDF;
}

function addCanvasPage(pdf, canvas, isFirstSheet) {
  const image = canvas.toDataURL("image/jpeg", 0.92);
  if (!isFirstSheet) pdf.addPage();
  pdf.addImage(image, "JPEG", 0, 0, A4.width, A4.height);
}

async function renderElement(element) {
  const html2canvas = window.html2canvas;
  return html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    imageTimeout: 8_000,
    width: A4_PX.width,
    height: A4_PX.height,
    windowWidth: A4_PX.width,
    windowHeight: A4_PX.height,
    scrollX: 0,
    scrollY: 0,
    onclone(clonedDoc) {
      const clone = clonedDoc.querySelector("[data-pdf-host]");
      if (clone) {
        clone.style.opacity = "1";
        clone.style.transform = "none";
        clone.style.left = "0";
        clone.style.top = "0";
      }
      clonedDoc.querySelectorAll(".sheet").forEach(lockCapturedSheet);
    },
  });
}

export async function htmlToPdfBlob(html) {
  if (typeof window === "undefined") throw new Error("Téléchargement PDF uniquement dans le navigateur.");
  await Promise.all([loadScript(HTML2CANVAS_SRC), loadScript(JSPDF_SRC)]);
  if (typeof window.html2canvas !== "function") throw new Error("Générateur PDF indisponible.");
  const JsPDF = jsPdfCtor();
  if (typeof JsPDF !== "function") throw new Error("Générateur PDF indisponible.");

  const host = mountPrintableHtml(html);
  await waitForImages(host);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  paginateFlowSheets(host);
  paginateMaintenanceSheets(host);
  host.querySelectorAll(".sheet").forEach(lockCapturedSheet);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const sheets = [...host.querySelectorAll(".sheet")];
  const targets = sheets.length ? sheets : [host];
  try {
    const pdf = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    for (const [index, target] of targets.entries()) {
      targets.forEach((sheet, sheetIndex) => {
        if (sheet === host) return;
        sheet.style.display = sheetIndex === index ? "" : "none";
      });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const canvas = await renderElement(target);
      if (!canvas?.width || !canvas?.height) throw new Error("PDF vide.");
      addCanvasPage(pdf, canvas, index === 0);
    }
    const blob = pdf.output("blob");
    if (!blob || !blob.size) throw new Error("PDF vide.");
    return blob;
  } catch (error) {
    throw pdfError(error);
  } finally {
    host.remove();
  }
}

export async function captureSheetsPdf(selector, { orientation = "portrait", filename, title, toast } = {}) {
  if (typeof window === "undefined") throw new Error("Téléchargement PDF uniquement dans le navigateur.");
  await Promise.all([loadScript(HTML2CANVAS_SRC), loadScript(JSPDF_SRC)]);
  if (typeof window.html2canvas !== "function") throw new Error("Générateur PDF indisponible.");
  const JsPDF = jsPdfCtor();
  if (typeof JsPDF !== "function") throw new Error("Générateur PDF indisponible.");
  const sheets = [...document.querySelectorAll(selector)];
  if (!sheets.length) throw new Error("Aucune page à exporter.");
  const landscape = orientation === "landscape";
  const page = landscape ? { width: 297, height: 210 } : A4;
  const px = landscape ? { width: 1123, height: 794 } : A4_PX;
  const name = downloadPdfName(filename, title, "document");
  const tab = reservePdfTab();
  toast?.("Préparation du PDF…");
  try {
    const pdf = new JsPDF({ unit: "mm", format: "a4", orientation: landscape ? "landscape" : "portrait" });
    for (const [index, sheet] of sheets.entries()) {
      const canvas = await window.html2canvas(sheet, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        imageTimeout: 8_000,
        width: Math.max(sheet.offsetWidth, px.width),
        height: Math.max(sheet.offsetHeight, px.height),
        windowWidth: Math.max(sheet.offsetWidth, px.width),
        windowHeight: Math.max(sheet.offsetHeight, px.height),
        scrollX: 0,
        scrollY: 0,
      });
      if (!canvas?.width || !canvas?.height) throw new Error("PDF vide.");
      const image = canvas.toDataURL("image/jpeg", 0.92);
      if (index) pdf.addPage([page.width, page.height], landscape ? "landscape" : "portrait");
      pdf.addImage(image, "JPEG", 0, 0, page.width, page.height);
    }
    const blob = pdf.output("blob");
    if (!blob || !blob.size) throw new Error("PDF vide.");
    triggerBlobDownload(blob, name, tab);
    toast?.("PDF ouvert");
    return blob;
  } catch (error) {
    try { tab?.close(); } catch { /* ignore */ }
    const wrapped = pdfError(error);
    toast?.(wrapped.message);
    throw wrapped;
  }
}

export async function downloadHtmlAsPdf(html, { filename, title, toast } = {}) {
  const name = downloadPdfName(filename, title, "document");
  const tab = reservePdfTab();
  toast?.("Préparation du PDF…");
  try {
    const blob = await htmlToPdfBlob(html);
    triggerBlobDownload(blob, name, tab);
    toast?.("PDF ouvert");
    return blob;
  } catch (error) {
    try { tab?.close(); } catch { /* ignore */ }
    const wrapped = pdfError(error);
    toast?.(wrapped.message);
    throw wrapped;
  }
}

export function printPdfBlob(blob) {
  if (typeof document === "undefined") return false;
  const typed = asPdfBlob(blob);
  const url = URL.createObjectURL(typed);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = "Impression";
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0";
  iframe.src = url;
  document.body.appendChild(iframe);
  const cleanup = () => {
    if (!iframe.isConnected) return;
    iframe.remove();
    URL.revokeObjectURL(url);
  };
  iframe.onload = () => {
    window.setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        iframe.contentWindow.onafterprint = cleanup;
      } catch {
        const tab = window.open(url, "_blank");
        if (!tab) cleanup();
      }
    }, 400);
  };
  window.setTimeout(cleanup, 120_000);
  return true;
}

export function printHtml(html) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => iframe.remove();
  iframe.contentWindow.onafterprint = cleanup;
  window.setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      cleanup();
    }
    window.setTimeout(cleanup, 60_000);
  }, 350);
  return true;
}
