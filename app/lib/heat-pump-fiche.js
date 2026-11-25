import { DOCUMENT_PREVIEW_BAR_CSS, documentPreviewBarHtml } from "./document-preview.js";
import {
  HEAT_PUMP_FIELDS,
  isHeatPumpPath,
  isHeatPumpSpecText,
  parseHeatPumpDescription,
} from "./heat-pump-specs.js";

function safe(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function heatPumpFicheKey(item = {}) {
  return String(item.articleId || item.id || item.code || item.reference || "").trim();
}

export function resolveQuoteArticle(item, articles = []) {
  if (!item) return null;
  return (
    (articles || []).find(article => item.articleId && String(article.id) === String(item.articleId)) ||
    (articles || []).find(article => item.code && String(article.code) === String(item.code)) ||
    null
  );
}

export function quoteHeatPumpFiches(items = [], articles = []) {
  return (items || [])
    .map(item => {
      const article = resolveQuoteArticle(item, articles);
      const description = item.description || article?.description || "";
      const specs = parseHeatPumpDescription(description);
      const path = isHeatPumpPath({
        category: item.category || article?.category,
        subcategory: item.subcategory || article?.subcategory,
      });
      if (!path && !specs.matched && !article?.ficheData && !article?.ficheName) return null;
      return {
        key: heatPumpFicheKey(item) || heatPumpFicheKey(article),
        name: item.name || article?.name || "",
        code: item.code || article?.code || "",
        brand: item.brand || article?.brand || specs.brand || "",
        title: item.name || article?.name || "",
        specs,
        ficheName: article?.ficheName || "",
        ficheData: article?.ficheData || "",
      };
    })
    .filter(item => item?.key);
}

export function selectedHeatPumpFiches(doc = {}, articles = []) {
  const wanted = Array.isArray(doc.printHeatPumpFicheIds)
    ? doc.printHeatPumpFicheIds.map(String).filter(Boolean)
    : [];
  if (!wanted.length) return [];
  const selected = new Set(wanted);
  return quoteHeatPumpFiches(doc.items, articles).filter(item => selected.has(String(item.key)));
}

export function buildHeatPumpFicheSheetHtml({
  title = "",
  brand = "",
  code = "",
  specs = {},
  ficheData = "",
  ficheName = "",
} = {}) {
  const rows = HEAT_PUMP_FIELDS.map(field => {
    const value = String(specs[field.key] || "").trim();
    return `<div class="hp-fiche-row"><span>${safe(field.label)}</span><b>${safe(value) || "—"}</b></div>`;
  }).join("");
  const warranty = String(specs.warranty || "").trim();
  const uploaded = String(ficheData || "").startsWith("data:image/")
    ? `<main class="sheet hp-fiche-sheet" style="page-break-before:always"><img class="hp-fiche-upload" src="${ficheData}" alt="${safe(ficheName || "Document constructeur")}"></main>`
    : "";
  return `<main class="sheet hp-fiche-sheet" style="page-break-before:always"><header><div><small>FICHE TECHNIQUE — POMPE À CHALEUR</small><h1>${safe(title || "Pompe à chaleur")}</h1><p>${[brand && `Marque : ${brand}`, code && `Réf. ${code}`].filter(Boolean).map(safe).join(" · ")}</p></div></header><div class="hp-fiche-eprel"><span>N° EPREL</span><b>${safe(specs.eprel) || "—"}</b></div><div class="hp-fiche-grid">${rows}</div>${warranty ? `<section class="hp-fiche-warranty"><b>Garantie</b><p>${safe(warranty).replace(/\n/g, "<br>")}</p></section>` : ""}<footer>Document généré depuis la fiche article — les cases sont remplies automatiquement (EPREL, ADEME, performances…).</footer></main>${uploaded}`;
}

const FICHE_CSS = `.hp-fiche-sheet{width:210mm;min-height:297mm;padding:14mm 16mm;page-break-before:always;background:#fff;color:#152347;font:12px "DM Sans",Arial,sans-serif}.hp-fiche-sheet header{border-bottom:5px solid #ffdb62;padding-bottom:8mm;margin-bottom:8mm}.hp-fiche-sheet small{color:#405fae;font-weight:800;letter-spacing:1.2px}.hp-fiche-sheet h1{margin:4px 0 6px;font:700 22px Manrope,Arial}.hp-fiche-sheet header p{margin:0;color:#5d6a80}.hp-fiche-eprel{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;margin-bottom:8mm;background:#152347;color:#ffdb62;border-radius:8px}.hp-fiche-eprel span{font:800 11px Arial;letter-spacing:.8px}.hp-fiche-eprel b{font:700 20px Manrope,Arial}.hp-fiche-grid{display:grid;grid-template-columns:1fr 1fr;gap:0}.hp-fiche-row{display:flex;flex-direction:column;gap:3px;padding:7px 10px;border:1px solid #d7deea}.hp-fiche-row span{color:#6d7788;font-size:9px;font-weight:700}.hp-fiche-row b{font-size:12px;color:#12264c}.hp-fiche-warranty{margin-top:8mm;padding:10px 12px;background:#f7f8fb;border-left:4px solid #ffdb62}.hp-fiche-warranty p{white-space:pre-wrap;margin:6px 0 0}.hp-fiche-sheet footer{margin-top:10mm;color:#7d8799;font-size:10px}.hp-fiche-upload{width:178mm;height:269mm;object-fit:contain;display:block}@media print{.hp-fiche-sheet{margin:0;box-shadow:none}}`;

export function buildHeatPumpFicheDocumentHtml(fiche, { previewBar = true } = {}) {
  const body = buildHeatPumpFicheSheetHtml(fiche);
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>${safe(fiche.title || "Fiche pompe à chaleur")}</title><style>@page{size:A4;margin:0}body{margin:0;background:#e5e7eb}${DOCUMENT_PREVIEW_BAR_CSS}${FICHE_CSS}.sheet{width:210mm;min-height:297mm;margin:10mm auto;background:#fff;box-shadow:0 4px 25px #15234722}@media print{body{background:#fff}.sheet{margin:0;box-shadow:none}}</style><body>${previewBar ? documentPreviewBarHtml("Fiche pompe à chaleur") : ""}${body}</body></html>`;
}

export function buildHeatPumpFicheAnnexHtml(doc, { articles = [] } = {}) {
  const fiches = selectedHeatPumpFiches(doc, articles);
  if (!fiches.length) return "";
  return `<style>${FICHE_CSS}</style>${fiches.map(fiche => buildHeatPumpFicheSheetHtml(fiche)).join("")}`;
}
