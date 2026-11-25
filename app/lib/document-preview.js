"use client";

import { downloadHtmlAsPdf, printHtml } from "./html-to-pdf.js";
import { omitEmptyMaintenanceFields } from "./maintenance-pdf.js";
import { omitEmptyPrevisitFields } from "./previsit-report-fields.js";
import { documentPdfFilename } from "./record-documents.js";

function safeTitle(value) {
  return String(value || "Document")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const DOCUMENT_PREVIEW_BAR_CSS = `
.doc-preview-bar{position:sticky;top:0;z-index:80;display:flex;align-items:center;justify-content:center;gap:12px;padding:10px 16px;background:#152347;color:#fff;font:700 13px Arial,sans-serif}
.doc-preview-bar span{opacity:.85;font-weight:600}
.doc-preview-bar button{border:0;border-radius:8px;padding:9px 16px;background:#ffcc00;color:#152347;font:800 13px Arial,sans-serif;cursor:pointer}
.doc-preview-body .previsit-app,.doc-preview-body .study-document{padding-top:24px}
@media print{
  .doc-preview-bar,.no-print,.form-toolbar,.study-toolbar,.save-toast{display:none!important}
  .doc-preview-body .previsit-app,.doc-preview-body .study-document{padding:0!important}
}
`;

export function documentPreviewBarHtml(title = "Document") {
  return `<div class="doc-preview-bar no-print"><span>${safeTitle(title)}</span><button type="button" onclick="window.print()">Imprimer</button></div>`;
}

function syncFormControls(root) {
  root.querySelectorAll("input, textarea, select").forEach(field => {
    if (field.type === "checkbox" || field.type === "radio") {
      if (field.checked) field.setAttribute("checked", "");
      else field.removeAttribute("checked");
      return;
    }
    field.setAttribute("value", field.value ?? "");
    if (field.tagName === "TEXTAREA") field.textContent = field.value ?? "";
    if (field.tagName === "SELECT") {
      [...field.options].forEach(option => {
        if (option.selected) option.setAttribute("selected", "");
        else option.removeAttribute("selected");
      });
    }
  });
}

function replaceCanvases(source, clone) {
  const originals = source.querySelectorAll("canvas");
  clone.querySelectorAll("canvas").forEach((canvas, index) => {
    const from = originals[index];
    if (!from) return;
    try {
      const image = document.createElement("img");
      image.src = from.toDataURL("image/png");
      image.alt = "Signature";
      image.style.width = "100%";
      image.style.display = "block";
      canvas.replaceWith(image);
    } catch {}
  });
}

export async function openHtmlPreview(html, { title = "Document", toast, autoPrint = false, filename } = {}) {
  if (autoPrint) {
    printHtml(html);
    return true;
  }
  await downloadHtmlAsPdf(html, { title, filename, toast });
  return true;
}

export async function openCurrentFormPreview({
  title = "Document",
  rootSelector = ".paper",
  toast,
  omitEmpty = false,
} = {}) {
  const source = document.querySelector(rootSelector) || document.querySelector("main");
  if (!source) return false;
  const clone = source.cloneNode(true);
  syncFormControls(clone);
  replaceCanvases(source, clone);
  if (clone.classList?.contains("maintenance-app")) {
    omitEmptyMaintenanceFields(clone);
    clone.classList.add("maintenance-pdf");
  } else if (omitEmpty) omitEmptyPrevisitFields(clone);
  clone.querySelectorAll(".form-toolbar, .study-toolbar, .save-toast, .thermal-screen-only, .no-print, .directory-search").forEach(node => node.remove());
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map(node => `<link rel="stylesheet" href="${node.href}">`)
    .join("");
  const styles = [...document.querySelectorAll("style")].map(node => node.outerHTML).join("");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${safeTitle(title)}</title>${links}${styles}<style>${DOCUMENT_PREVIEW_BAR_CSS}</style></head><body class="doc-preview-body">${documentPreviewBarHtml(title)}${clone.outerHTML}</body></html>`;
  const field = name => String(document.querySelector(`[name="${name}"]`)?.value || "").trim();
  const filename = documentPdfFilename({
    kind: title || "Document",
    title: field("number"),
    source: {
      lastName: field("lastName"),
      firstName: field("firstName"),
      client: field("client") || field("clientName"),
    },
  });
  return openHtmlPreview(html, { title, filename, toast });
}
