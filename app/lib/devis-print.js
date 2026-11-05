import {
  companyDisplayName,
  companyHasCgv,
  companyEmitterLines,
  DEFAULT_COMPANY,
  DOCUMENT_HEAD_CSS,
  DOCUMENT_PARTIES_CSS,
  documentPartiesHtml,
} from "./company.js";
import { formatClientNumber } from "./client-number.js";
import { computeDocumentTotals, ELECTRICITY_OPERATORS, firstMonthlyDelayLabel, quoteBillingAddress, quoteWorksiteAddress } from "./devis.js";
import { buildDevisPdfBlob, loadRgeLogo } from "./devis-pdf.js";
import { DOCUMENT_PREVIEW_BAR_CSS, documentPreviewBarHtml } from "./document-preview.js";
import { reservePdfTab, triggerBlobDownload } from "./html-to-pdf.js";
import { documentPdfFilename } from "./record-documents.js";
import { authFetch } from "./supabase-rest.js";
import { buildCerfaTvaAnnexHtml, cerfaTvaToAnnexImages } from "./cerfa-tva.js";
import { anahMandatToAnnexImages, buildAnahMandatAnnexHtml } from "./anah-mandat.js";
import { buildPvMandatAnnexHtml, pvMandatToAnnexImages } from "./pv-mandat.js";
import { commercialDocsToAnnexImages, selectedCommercialDocs } from "./article-commercial-doc.js";

const euro = value =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

const percent = value =>
  value === "" || value == null || !Number.isFinite(Number(value))
    ? "—"
    : `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))} %`;

function safe(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDocDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-FR");
}

function taxLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: n % 1 ? 1 : 0, maximumFractionDigits: 2 }).format(n)} %`;
}

const DEVIS_PRINT_CSS = `
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{margin:0;background:#e5e7eb;font:12px Arial,sans-serif;color:#1f2d4f}
${DOCUMENT_PREVIEW_BAR_CSS}
.sheet{width:210mm;margin:0 auto;background:#fff;box-sizing:border-box}
.sheet-flow{height:auto;min-height:0;max-height:none;overflow:visible;padding:18mm 17mm 14mm}
.sheet-page{height:297mm;max-height:297mm;padding:14mm 17mm 0;overflow:hidden;display:flex;flex-direction:column}
.sheet-body{flex:1 1 auto;min-height:0;overflow:hidden}
.mandate-sheet,.hp-fiche-sheet{position:relative;height:297mm;min-height:297mm;padding:12mm 12mm 16mm;display:flex;flex-direction:column;overflow:hidden}
${DOCUMENT_HEAD_CSS}
${DOCUMENT_PARTIES_CSS}
.quote-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:4px solid #ffdb62;padding-bottom:8mm;margin:0 0 6mm}
.quote-head .logo{width:65mm;height:auto;display:block}
.doc-info{text-align:right;color:#1f2d4f}
.doc-info b{display:block;font-size:18px;color:#405fae;font-weight:700}
.doc-info p{margin:5px 0}
.projet-mark{position:absolute;top:14mm;right:17mm;border:2px solid #405fae;color:#405fae;font:bold 11px Arial;padding:3px 7px;transform:rotate(-7deg);z-index:2}
.sheet-flow,.sheet-page{position:relative}
.lines-head,.article-main{display:grid;grid-template-columns:minmax(88mm,1fr) 10mm 18mm 18mm 13mm 20mm 22mm;gap:2mm;align-items:start}
.lines-head{background:#405fae;color:#fff;padding:2.2mm 1.5mm;font-size:9px;font-weight:700;margin:4mm 0 0}
.worksite-address{margin:0 0 3mm;padding:2.5mm 3mm;border:1px solid #b7c9ee;border-radius:2mm;background:#fff}
.worksite-address b{display:block;color:#405fae;font-size:9px;letter-spacing:.04em;text-transform:uppercase}
.worksite-address span{display:block;margin-top:1mm;color:#1f2d4f;font-size:11px}
.lines-head span:not(:first-child),.article-main .num{text-align:right}
.article-block{border-bottom:1px solid #e4e7ee;break-inside:auto}
.article-main{padding:2.5mm 1.5mm}
.article-main .name{font-size:11px;font-weight:700;color:#1f2d4f;line-height:1.25}
.article-main small{display:block;color:#7d8799;margin-top:1mm;font-size:10px}
.article-main .num{font-size:10px;font-variant-numeric:tabular-nums;white-space:nowrap;line-height:1.25;padding-top:1px}
.article-desc{margin-top:2mm;font-size:9px;line-height:1.35;color:#374151;white-space:pre-line}
.article-continue-label{padding:2.5mm 1.5mm 0;font-size:10px;font-weight:700;color:#405fae}
.article-continued .article-detail{padding:1mm 1.5mm 2.5mm}
.closing-totals{display:grid;grid-template-columns:1fr 82mm;align-items:end;gap:8mm;margin-top:6mm;break-inside:avoid;page-break-inside:avoid}
.closing-totals.is-totals-only{grid-template-columns:1fr}
.finance-box{border:2px solid #405fae;border-radius:3mm;padding:4mm}
.finance-box b.title{display:block;color:#405fae;font-size:12px;margin-bottom:3mm}
.finance-box p{margin:1.2mm 0}
.finance-box span{display:block;color:#7b8798;font-size:9px}
.summary{width:82mm;margin:6mm 0 0 auto}
.closing-totals .summary{margin:0 0 0 auto}
.summary p{display:flex;justify-content:space-between;margin:2mm 0}
.total{font-size:18px;border-top:2px solid #405fae;padding-top:10px}
.free-note{margin-top:4mm;border-left:4px solid #ffdb62;background:#f7f8fb;padding:3mm}
.free-note b{color:#405fae;font-size:10px}
.free-note p{margin:2mm 0 0}
.accept-boxes{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:4mm;break-inside:avoid;page-break-inside:avoid}
.accept-boxes>div{min-height:28mm;border:1px solid #aeb7c7;background:#f7f8fc;padding:3mm}
.note{color:#7d8799;border-top:1px solid #e4e7ee;padding:3mm 0 8mm;display:flex;justify-content:space-between;font-size:9px;flex:0 0 auto}
.mandate-sheet .note{position:absolute;left:12mm;right:12mm;bottom:8mm}
.spacer{flex:1 1 auto;min-height:4mm}
h2{margin-top:12mm;color:#405fae}
table{width:100%;border-collapse:collapse;margin-top:4mm}
th{background:#405fae;color:#fff}
th,td{padding:7px 6px;border-bottom:1px solid #e4e7ee;text-align:left;vertical-align:top}
@media print{
  body{background:#fff}
  .sheet-flow{height:auto!important;max-height:none!important;overflow:visible!important}
  .sheet-page{page-break-after:always;break-after:page}
  .article-main,.closing-totals,.accept-boxes{break-inside:avoid;page-break-inside:avoid}
  .document-parties{display:grid!important;grid-template-columns:1fr 1fr!important}
}
`;

export function articleDescriptionText(item) {
  const name = String(item.name || "").trim();
  let note = String(item.lineComment || item.description || "").trim();
  if (name && note) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    note = note.replace(new RegExp(`^${escaped}(?:\\s*\\n)+`, "i"), "").trim();
  }
  return note;
}

export function buildDevisArticleHtml(item) {
  const note = articleDescriptionText(item);
  const code = String(item.code || item.reference || "").trim();
  const unitTtc = Number(item.unit) * (1 + Number(item.tax || 0) / 100);
  return `<article class="article-block" data-flow-block>
    <div class="article-main">
      <div class="article-detail">
        <b class="name" data-article-name>${safe(item.name)}</b>
        ${code ? `<small>Réf. ${safe(code)}</small>` : ""}
        ${note ? `<div class="article-desc" data-split-text>${safe(note)}</div>` : ""}
      </div>
      <div class="num">${safe(item.qty)}</div>
      <div class="num">${euro(Number(item.unit))}</div>
      <div class="num">${euro(unitTtc)}</div>
      <div class="num">${taxLabel(item.tax)}</div>
      <div class="num"><b>${euro(item.totalHT)}</b></div>
      <div class="num"><b>${euro(item.totalTTC)}</b></div>
    </div>
  </article>`;
}

async function loadPrintLogo() {
  if (typeof window === "undefined") return "/mkl-energies.png";
  try {
    const response = await fetch("/mkl-energies.png");
    if (!response.ok) return "/mkl-energies.png";
    const logoBlob = await response.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve("/mkl-energies.png");
      reader.readAsDataURL(logoBlob);
    });
  } catch {
    return "/mkl-energies.png";
  }
}

export async function buildDevisPrintHtml(doc, { clients = [], articles = [], company = DEFAULT_COMPANY, logoData } = {}) {
  const totals = computeDocumentTotals(doc);
  const customer = clients.find(item => String(item.id) === String(doc.clientId))
    || clients.find(item => item.name === doc.client)
    || {};
  const customerName = safe(customer.company || customer.name || doc.client);
  const customerContact = safe(`${customer.firstName || ""} ${customer.lastName || ""}`.trim() || customer.contact || customer.name);
  const billingAddress = quoteBillingAddress(customer);
  const worksiteAddress = quoteWorksiteAddress(doc);
  const siteAddress = safe(worksiteAddress || billingAddress);
  const worksiteBlock = worksiteAddress
    ? `<p class="worksite-address" data-page-first><b>Adresse de chantier</b><span>${safe(worksiteAddress)}</span></p>`
    : "";
  const customerDetails = documentPartiesHtml(company, {
    name: customer.company || customer.name || doc.client,
    contact: `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || customer.contact || customer.name,
    address: billingAddress,
    phone: customer.mobile || customer.phone,
    email: customer.email,
    clientNumber: formatClientNumber(customer.clientNumber),
  });
  const companyName = safe(companyDisplayName(company));
  const resolvedLogo = logoData || await loadPrintLogo();
  const printableLines = totals.lines.filter((_, index) => !(doc.hiddenLines || []).includes(index));
  const articleBlocks = printableLines.map(buildDevisArticleHtml).join("");
  const noteParts = [doc.specialConditions, doc.freeNote]
    .map(part => String(part || "").trim())
    .filter(part => part && !/CGV MKL/i.test(part));
  const freeNote = noteParts.length
    ? `<section class="free-note" data-flow-block>${doc.specialConditions ? "<b>CONDITIONS PARTICULIÈRES</b>" : ""}<p>${noteParts.map(part => safe(part).replace(/\n/g, "<br>")).join("<br><br>")}</p></section>`
    : "";
  const globalDiscount = totals.globalDiscountTTC
    ? `<p><span>Remise</span><b>- ${euro(totals.globalDiscountTTC)}</b></p>`
    : "";
  const representativeName = [doc.representativeFirstName, doc.representativeLastName].filter(Boolean).join(" ");
  const representativeSign = doc.representativeSignature
    ? `<img src="${doc.representativeSignature}" alt="Signature du représentant" style="display:block;max-width:100%;max-height:22mm;margin-top:4mm">`
    : `<p style="margin-top:12mm;color:#8a94a4">Signature</p>`;
  const acceptance = doc.kind === "Devis"
    ? `<section class="accept-boxes" data-flow-block><div><b style="color:#405fae">REPRÉSENTANT MKL ÉNERGIES</b><p style="margin:2mm 0 0">${safe(representativeName) || "Nom et prénom"}</p>${representativeSign}</div><div><b>Signature précédée de la mention « Bon pour accord »</b><p style="margin:2mm 0">Date :</p></div></section>`
    : "";
  const showFinance = doc.kind === "Devis" && doc.financier && doc.financier !== "Sans financement";
  const financing = showFinance
    ? `<section class="finance-box"><b class="title">FINANCEMENT DU PROJET</b><p><span>FINANCEUR</span><b>${safe(doc.financier)}</b></p><p><span>MONTANT DE FINANCEMENT</span><b>${euro(Number(doc.financedAmount || totals.totalTTC || 0))}</b></p><p><span>NOMBRE DE MENSUALITÉS</span><b>${doc.financeMonths || "—"}</b></p><p><span>MENSUALITÉ</span><b>${euro(Number(doc.monthlyPayment || 0))}</b></p><p><span>PREMIÈRE MENSUALITÉ</span><b>${firstMonthlyDelayLabel(doc.firstMonthlyPayment)}</b></p><p><span>TAEG</span><b>${percent(doc.financeTaeg)}</b></p><p><span>TAEA</span><b>${percent(doc.financeTaea)}</b></p></section>`
    : "";
  const projectMark = doc.kind === "Devis" && !doc.deliveryDate
    ? `<div class="projet-mark" data-page-first>PROJET</div>`
    : "";
  const operator = ELECTRICITY_OPERATORS.find(item => item.id === doc.electricityOperator);
  const isPhotovoltaicQuote = doc.kind === "Devis" && (doc.pvStudyId || (doc.items || []).some(item => `${item.name || ""} ${item.subcategory || ""} ${item.code || ""}`.toLowerCase().includes("photovolta")));
  const companyLegal = companyEmitterLines(company).map(safe).join("<br>");
  const townHallMandate = isPhotovoltaicQuote
    ? `<main class="sheet mandate-sheet town-hall-mandate" style="page-break-before:always"><header class="document-head"><img src="${resolvedLogo}" alt="${companyName}"><div><span>ANNEXE</span><h1>MANDAT ADMINISTRATIF</h1><p>Annexe au devis ${safe(doc.number)}</p></div></header><div style="margin-top:12mm;text-align:center;padding:6mm;border:2px solid #405fae"><b style="font-size:19px;color:#405fae">MANDAT — DÉMARCHES EN MAIRIE</b></div><section style="margin-top:12mm;line-height:1.7;font-size:13px"><p>Je soussigné(e), <b>${customerContact || customerName}</b>,</p><p>demeurant à l’adresse suivante : <b>${safe(billingAddress)}</b>,</p><p>donne pouvoir à la société :</p><div style="margin:8mm auto;padding:6mm;width:110mm;text-align:center;background:#eef2fa;border-radius:3mm"><img src="${resolvedLogo}" alt="${companyName}" style="width:55mm"><p style="margin:4mm 0 0"><b style="font-size:17px">${companyName}</b><br>${companyLegal || safe(company.email || "")}</p></div><p>afin d’accomplir en mon nom et pour mon compte les démarches administratives concernant l’installation photovoltaïque et les menuiseries ou équipements extérieurs éventuellement liés au projet réalisé à mon domicile.</p></section><div class="spacer"></div><footer class="note"><span>${companyName}</span><span>Mandat pour déclaration préalable de travaux</span><span>Annexe mairie</span></footer></main>`
    : "";
  const mandate = doc.kind === "Devis" && operator
    ? `<main class="sheet mandate-sheet" style="page-break-before:always"><header class="document-head"><img src="${resolvedLogo}" alt="${companyName}"><div><span>ANNEXE</span><h1>MANDAT DE RACCORDEMENT</h1><p>Annexe au devis ${safe(doc.number)}</p></div></header><div style="margin-top:12mm;padding:5mm;background:#eef2fa;border-left:4px solid #405fae"><b style="font-size:16px;color:#405fae">${safe(operator.name)}</b><p style="margin-bottom:0">${safe(operator.title)}</p></div>${documentPartiesHtml(company, { name: customer.company || customer.name || doc.client, contact: `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || customer.contact || customer.name, address: siteAddress, phone: customer.mobile || customer.phone, email: customer.email, title: "MANDANT — CLIENT PRODUCTEUR" })}<h2>2. Site de production à raccorder</h2><table><tr><td><b>Adresse du site</b></td><td>${siteAddress}</td></tr><tr><td><b>Nature</b></td><td>Installation de production photovoltaïque</td></tr><tr><td><b>Puissance de raccordement</b></td><td>${safe(doc.pvPowerKwp || "À confirmer")} kWc</td></tr><tr><td><b>Référence commerciale</b></td><td>${safe(doc.number)}</td></tr></table><div class="spacer"></div><footer class="note"><span>${companyName}</span><span>${safe(operator.name)} — mandat de représentation</span><span>Annexe 1</span></footer></main>`
    : "";
  const cerfaTva = await buildCerfaTvaAnnexHtml(doc, { client: customer, company });
  const anahMandat = await buildAnahMandatAnnexHtml(doc, { client: customer });
  const pvMandat = await buildPvMandatAnnexHtml(doc, { client: customer });
  const docInfo = doc.kind === "Devis"
    ? `<p>Date : ${formatDocDate(doc.date)}</p><p>Offre valable jusqu’au : ${formatDocDate(doc.due)}</p><p>Livraison prévue : ${formatDocDate(doc.deliveryDate)}</p>`
    : `<p>Date : ${formatDocDate(doc.date)}</p><p>Échéance : ${formatDocDate(doc.due)}</p>`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><link rel="icon" type="image/png" href="${resolvedLogo}"><title>${safe(doc.number)}</title><style>${DEVIS_PRINT_CSS}</style></head><body>
${documentPreviewBarHtml(doc.kind || "Devis")}
<main class="sheet sheet-flow">
  ${projectMark}
  <header class="quote-head" data-page-first data-continue-head><img class="logo" src="${resolvedLogo}" alt="${companyName}"><div class="doc-info"><b>${safe(doc.kind || "Devis").toUpperCase()} ${safe(doc.number)}</b>${docInfo}</div></header>
  <div data-page-first>${customerDetails}</div>
  ${worksiteBlock}
  <div class="lines-head" aria-hidden="true"><span>Détail</span><span>Qté</span><span>P.U HT</span><span>P.U TTC</span><span>TVA</span><span>Total HT</span><span>Total TTC</span></div>
  ${articleBlocks}
  <div class="closing-totals${financing ? "" : " is-totals-only"}" data-flow-block>
    ${financing}
    <div class="summary">
      <p><span>Total HT</span><b>${euro(totals.totalHT)}</b></p>
      ${globalDiscount}
      <p><span>TVA</span><b>${euro(totals.taxAmount)}</b></p>
      <p class="total"><span>Total TTC</span><b>${euro(totals.totalTTC)}</b></p>
    </div>
  </div>
  ${freeNote}
  ${acceptance}
  <footer class="note"><span>${companyName}</span><span>Document généré par ${companyName} CRM</span><span class="page-num">Page 1/1</span></footer>
</main>
${pvMandat}${townHallMandate}${mandate}${cerfaTva}${anahMandat}
</body></html>`;
}

export function documentPrintsAnnexes(doc = {}) {
  return String(doc.kind || "Devis") === "Devis";
}

export async function collectDevisAnnexImages(doc, { articles = [], clients = [], company = DEFAULT_COMPANY } = {}) {
  if (!documentPrintsAnnexes(doc)) return [];
  const customer = clients.find(item => String(item.id) === String(doc.clientId))
    || clients.find(item => item.name === doc.client)
    || {};
  const commercial = await commercialDocsToAnnexImages(selectedCommercialDocs(doc, articles));
  const cgv = doc.printCgv !== false && companyHasCgv(company)
    ? await commercialDocsToAnnexImages([{ ficheData: company.cgvData, ficheName: company.cgvName || "CGV" }])
    : [];
  const cerfa = await cerfaTvaToAnnexImages(doc, { client: customer, company });
  const anah = await anahMandatToAnnexImages(doc, { client: customer });
  const pvMandat = await pvMandatToAnnexImages(doc, { client: customer });
  return [...pvMandat, ...commercial, ...cgv, ...cerfa, ...anah];
}

export async function openDevisPrintWindow(doc, { clients = [], articles = [], company, toast, filename } = {}) {
  let resolved = company;
  if (!resolved) {
    try {
      const response = await authFetch("/api/company");
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.company) resolved = data.company;
    } catch {
      resolved = DEFAULT_COMPANY;
    }
  }
  toast?.("Préparation du PDF…");
  const tab = reservePdfTab();
  try {
    const [logoData, rgeLogoData] = await Promise.all([loadPrintLogo(), loadRgeLogo()]);
    const annexImages = await collectDevisAnnexImages(doc, {
      articles,
      clients,
      company: resolved || DEFAULT_COMPANY,
    });
    const blob = await buildDevisPdfBlob(doc, {
      clients,
      company: resolved || DEFAULT_COMPANY,
      logoData,
      rgeLogoData,
      annexImages,
    });
    if (!blob || !blob.size) throw new Error("PDF vide.");
    triggerBlobDownload(blob, filename || documentPdfFilename({
      kind: doc.kind || "Devis",
      title: doc.number,
      source: doc,
    }), tab);
    toast?.(annexImages.length ? "PDF ouvert avec la documentation en fin de devis" : "PDF ouvert");
    return blob;
  } catch (error) {
    try { tab?.close(); } catch { /* ignore */ }
    const message = error?.message || "Génération du PDF impossible.";
    toast?.(message);
    throw error;
  }
}
