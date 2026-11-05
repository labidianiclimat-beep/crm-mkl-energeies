/** Modèle PDF devis verrouillé — génération vectorielle uniquement. */
import { jsPDF } from "jspdf";
import {
  companyDisplayName,
  companyEmitterLines,
  DEFAULT_COMPANY,
} from "./company.js";
import { formatClientNumber } from "./client-number.js";
import { computeDocumentTotals, firstMonthlyDelayLabel, quoteBillingAddress, quoteWorksiteAddress } from "./devis.js";

function articleDescriptionText(item) {
  const name = String(item.name || "").trim();
  let note = String(item.lineComment || item.description || "").trim();
  if (name && note) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    note = note.replace(new RegExp(`^${escaped}(?:\\s*\\n)+`, "i"), "").trim();
  }
  return note;
}

const BLUE = [64, 95, 174];
const GOLD = [255, 219, 98];
const INK = [31, 45, 79];
const MUTED = [125, 135, 153];
const DESC = [55, 65, 81];
const LINE = [228, 231, 238];
const PAGE_W = 210;
const PAGE_H = 297;
const MX = 17;
const MY = 16;
const FOOTER_Y = 286;
export const CONTENT_BOTTOM = 278;
const ACCEPT_H = 36;
const TOTALS_PAD = 7;
const LOGO_W = 58;
const LOGO_H = 58 * (551 / 1446);
const RGE_H = LOGO_H;
const RGE_W = RGE_H * (719 / 968);
const QUALIFELEC_NUMBERS = ["N\u00b0 156901 PAC", "N\u00b0 156899 PV"];
const INNER_W = PAGE_W - MX * 2;

const COLS = [
  { key: "detail", label: "Détail", w: 90 },
  { key: "qty", label: "Qté", w: 8, align: "right" },
  { key: "puht", label: "P.U HT", w: 17, align: "right" },
  { key: "puttc", label: "P.U TTC", w: 17, align: "right" },
  { key: "tva", label: "TVA", w: 12, align: "right" },
  { key: "tht", label: "Total HT", w: 16, align: "right" },
  { key: "tttc", label: "Total TTC", w: 16, align: "right" },
];

function pdfLatin(value) {
  return String(value ?? "").replace(/[\u00a0\u202f\u2007\u2009]/g, " ");
}

export function euro(value) {
  return pdfLatin(
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value || 0)
  );
}

const percent = value =>
  value === "" || value == null || !Number.isFinite(Number(value))
    ? "—"
    : `${pdfLatin(new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value)))} %`;

function formatDocDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-FR");
}

function taxLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${pdfLatin(new Intl.NumberFormat("fr-FR", { minimumFractionDigits: n % 1 ? 1 : 0, maximumFractionDigits: 2 }).format(n))} %`;
}

function colXs() {
  let x = MX;
  return COLS.map(col => {
    const start = x;
    x += col.w;
    return { ...col, x: start };
  });
}

function setFill(pdf, rgb) {
  pdf.setFillColor(...rgb);
}

function setStroke(pdf, rgb) {
  pdf.setDrawColor(...rgb);
}

function setInk(pdf, rgb = INK) {
  pdf.setTextColor(...rgb);
}

function wrap(pdf, text, width) {
  return pdf.splitTextToSize(String(text || ""), width);
}

function imageFormat(data) {
  const value = String(data || "");
  if (value.startsWith("data:image/jpeg") || value.startsWith("data:image/jpg")) return "JPEG";
  return "PNG";
}

async function loadPublicImage(path) {
  if (typeof window === "undefined") return "";
  try {
    const response = await fetch(path);
    if (!response.ok) return "";
    const blob = await response.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

export async function loadPrintLogo() {
  return loadPublicImage("/mkl-energies.png");
}

export async function loadRgeLogo() {
  return loadPublicImage("/rge-qualifelec.png");
}

function drawLogo(pdf, logoData, x, y, w = LOGO_W, h = LOGO_H) {
  if (!logoData || !String(logoData).startsWith("data:")) return;
  try {
    pdf.addImage(logoData, imageFormat(logoData), x, y, w, h);
  } catch {
    /* logo optionnel */
  }
}

function drawHeader(ctx, { continued = false } = {}) {
  const { pdf, logoData, rgeLogoData, title, dateLines } = ctx;
  drawLogo(pdf, logoData, MX, MY);
  const rgeX = MX + LOGO_W + 4;
  drawLogo(pdf, rgeLogoData, rgeX, MY, RGE_W, RGE_H);
  const numberSize = 8;
  const numberLine = 3.8;
  const numberX = rgeX + RGE_W + 2.2;
  const numberY = MY + (RGE_H - numberLine) / 2 + 1.2;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(numberSize);
  setInk(pdf, BLUE);
  QUALIFELEC_NUMBERS.forEach((line, index) => {
    pdf.text(pdfLatin(line), numberX, numberY + index * numberLine);
  });
  const textX = PAGE_W - MX;
  let ty = MY + 5;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  setInk(pdf, BLUE);
  pdf.text(continued ? `${title} — Suite` : title, textX, ty, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  setInk(pdf, INK);
  dateLines.forEach(line => {
    ty += 5;
    pdf.text(line, textX, ty, { align: "right" });
  });
  const lineY = Math.max(MY + LOGO_H + 4, ty + 4);
  setStroke(pdf, GOLD);
  pdf.setLineWidth(1.1);
  pdf.line(MX, lineY, PAGE_W - MX, lineY);
  ctx.y = lineY + 6;
}

function drawFooter(ctx, page, total) {
  const { pdf, companyName } = ctx;
  setStroke(pdf, LINE);
  pdf.setLineWidth(0.3);
  pdf.line(MX, FOOTER_Y - 4, PAGE_W - MX, FOOTER_Y - 4);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  setInk(pdf, MUTED);
  pdf.text(companyName, MX, FOOTER_Y);
  pdf.text(`Document généré par ${companyName} CRM`, PAGE_W / 2, FOOTER_Y, { align: "center" });
  pdf.text(`Page ${page}/${total}`, PAGE_W - MX, FOOTER_Y, { align: "right" });
}

function drawParties(ctx, company, customer) {
  const { pdf } = ctx;
  const gap = 5;
  const boxW = (INNER_W - gap) / 2;
  const textW = boxW - 7;
  const lineH = 3.6;
  const wrapDetails = lines => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    return lines.slice(1).flatMap(line => pdf.splitTextToSize(pdfLatin(line), textW));
  };
  const emitter = [companyDisplayName(company), ...companyEmitterLines(company)].filter(Boolean);
  const client = [
    customer.name,
    customer.clientNumber,
    customer.contact && customer.contact !== customer.name ? customer.contact : "",
    customer.address,
    [customer.phone, customer.email].filter(Boolean).join(" • "),
  ].filter(Boolean);
  const emitterDetails = wrapDetails(emitter);
  const clientDetails = wrapDetails(client);
  const rows = Math.max(emitterDetails.length, clientDetails.length, 1);
  const boxH = Math.max(36, 18 + rows * lineH);
  const y = ctx.y;
  setFill(pdf, [238, 242, 250]);
  setStroke(pdf, BLUE);
  pdf.setLineWidth(0.4);
  pdf.roundedRect(MX, y, boxW, boxH, 2.2, 2.2, "FD");
  setFill(pdf, [255, 253, 244]);
  setStroke(pdf, GOLD);
  pdf.roundedRect(MX + boxW + gap, y, boxW, boxH, 2.2, 2.2, "FD");

  const writeParty = (x, label, name, details) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    setInk(pdf, BLUE);
    pdf.text(pdfLatin(label), x + 3.5, y + 5);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    setInk(pdf, INK);
    const title = pdf.splitTextToSize(pdfLatin(name || "—"), textW);
    pdf.text(title[0], x + 3.5, y + 11);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    setInk(pdf, [83, 96, 119]);
    details.forEach((line, index) => {
      pdf.text(line, x + 3.5, y + 16 + index * lineH);
    });
  };

  writeParty(MX, "ÉMETTEUR", emitter[0], emitterDetails);
  writeParty(MX + boxW + gap, "CLIENT / DESTINATAIRE", client[0], clientDetails);
  ctx.y = y + boxH + 6;
}

function drawWorksite(ctx, address) {
  const text = String(address || "").trim();
  if (!text) return;
  const { pdf } = ctx;
  const lines = pdf.splitTextToSize(pdfLatin(text), INNER_W - 8);
  const h = 8 + lines.length * 4;
  setStroke(pdf, BLUE);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(MX, ctx.y, INNER_W, h, 1.5, 1.5, "S");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  setInk(pdf, BLUE);
  pdf.text("ADRESSE DE CHANTIER", MX + 3, ctx.y + 4.5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  setInk(pdf, INK);
  lines.forEach((line, index) => pdf.text(line, MX + 3, ctx.y + 9 + index * 4));
  ctx.y += h + 3;
}

function drawColHead(ctx) {
  const { pdf } = ctx;
  const y = ctx.y;
  const h = 7;
  setFill(pdf, BLUE);
  pdf.rect(MX, y, INNER_W, h, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  setInk(pdf, [255, 255, 255]);
  colXs().forEach(col => {
    const tx = col.align === "right" ? col.x + col.w - 1.2 : col.x + 1.4;
    pdf.text(col.label, tx, y + 4.7, col.align === "right" ? { align: "right" } : undefined);
  });
  ctx.y = y + h + 2;
}

function newPage(ctx) {
  ctx.pdf.addPage();
  ctx.page += 1;
  drawHeader(ctx, { continued: true });
  drawColHead(ctx);
}

function newClosingPage(ctx) {
  ctx.pdf.addPage();
  ctx.page += 1;
  drawHeader(ctx, { continued: true });
}

export function closingBlockHeight({ finance = false, discount = false, signatures = true } = {}) {
  const summaryRows = 2 + (discount ? 1 : 0);
  const summaryH = 4 + summaryRows * 6 + 8;
  const totalsH = TOTALS_PAD + Math.max(finance ? 58 : 0, summaryH);
  return totalsH + (signatures ? ACCEPT_H : 0);
}

export function pinClosingTop(currentY, closingHeight, contentBottom = CONTENT_BOTTOM) {
  if (currentY + closingHeight > contentBottom) return null;
  return contentBottom - closingHeight;
}

function ensureSpace(ctx, height) {
  if (ctx.y + height <= CONTENT_BOTTOM) return;
  newPage(ctx);
}

function drawArticle(ctx, item, { continued = false, remainingNote } = {}) {
  const { pdf } = ctx;
  const cols = colXs();
  const detail = cols[0];
  const name = String(item.name || "Article");
  const code = String(item.code || item.reference || "").trim();
  const note = remainingNote != null ? remainingNote : articleDescriptionText(item);
  const unitTtc = Number(item.unit) * (1 + Number(item.tax || 0) / 100);
  const nums = [
    String(item.qty ?? ""),
    euro(Number(item.unit)),
    euro(unitTtc),
    taxLabel(item.tax),
    euro(item.totalHT),
    euro(item.totalTTC),
  ];

  ensureSpace(ctx, continued ? 10 : 14);
  if (continued) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    setInk(pdf, BLUE);
    pdf.text(`Suite — ${name}`, detail.x + 1.2, ctx.y + 4);
    ctx.y += 6;
  } else {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    setInk(pdf, INK);
    const nameLines = wrap(pdf, name, detail.w - 2);
    nameLines.forEach((line, index) => {
      pdf.text(line, detail.x + 1.2, ctx.y + 4 + index * 4);
    });
    cols.slice(1).forEach((col, index) => {
      pdf.setFont("helvetica", index >= 4 ? "bold" : "normal");
      pdf.setFontSize(8);
      setInk(pdf, INK);
      pdf.text(nums[index], col.x + col.w - 1.2, ctx.y + 4, { align: "right" });
    });
    ctx.y += Math.max(5, nameLines.length * 4) + 1;
    if (code) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      setInk(pdf, MUTED);
      pdf.text(`Réf. ${code}`, detail.x + 1.2, ctx.y + 3);
      ctx.y += 5;
    }
  }

  if (note) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    setInk(pdf, DESC);
    const lines = wrap(pdf, note, detail.w - 2);
    for (let index = 0; index < lines.length; index += 1) {
      if (ctx.y + 4 > CONTENT_BOTTOM) {
        setStroke(pdf, LINE);
        pdf.setLineWidth(0.3);
        pdf.line(MX, ctx.y + 1, PAGE_W - MX, ctx.y + 1);
        newPage(ctx);
        drawArticle(ctx, item, { continued: true, remainingNote: lines.slice(index).join("\n") });
        return;
      }
      pdf.text(lines[index], detail.x + 1.2, ctx.y + 3.2);
      ctx.y += 3.5;
    }
  }

  setStroke(pdf, LINE);
  pdf.setLineWidth(0.3);
  pdf.line(MX, ctx.y + 1.5, PAGE_W - MX, ctx.y + 1.5);
  ctx.y += 3.5;
}

function drawBox(pdf, x, y, w, h, { fill = [247, 248, 252], stroke = [174, 183, 199] } = {}) {
  setFill(pdf, fill);
  setStroke(pdf, stroke);
  pdf.setLineWidth(0.4);
  pdf.roundedRect(x, y, w, h, 2, 2, "FD");
}

function drawTotals(ctx, totals, finance) {
  const { pdf } = ctx;
  const boxW = 82;
  const boxX = PAGE_W - MX - boxW;
  const financeH = finance ? 58 : 0;
  const totalsH = 4 + (3 + (totals.globalDiscountTTC ? 1 : 0)) * 6 + 8;
  ctx.y += 3;
  if (finance) {
    drawBox(pdf, MX, ctx.y, INNER_W - boxW - 6, financeH, { fill: [255, 255, 255], stroke: BLUE });
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    setInk(pdf, BLUE);
    pdf.text("FINANCEMENT DU PROJET", MX + 4, ctx.y + 6);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    setInk(pdf, MUTED);
    const rows = [
      ["FINANCEUR", finance.financier],
      ["MONTANT DE FINANCEMENT", finance.amount],
      ["NOMBRE DE MENSUALITÉS", finance.months],
      ["MENSUALITÉ", finance.monthly],
      ["PREMIÈRE MENSUALITÉ", finance.firstMonthly],
      ["TAEG", finance.taeg],
      ["TAEA", finance.taea],
    ];
    rows.forEach((row, index) => {
      const col = index % 2;
      const line = Math.floor(index / 2);
      const x = MX + 4 + col * 42;
      const y = ctx.y + 12 + line * 10.5;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      setInk(pdf, MUTED);
      pdf.text(row[0], x, y);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      setInk(pdf, INK);
      pdf.text(String(row[1]), x, y + 4);
    });
  }

  const rows = [
    ["Total HT", euro(totals.totalHT)],
    totals.globalDiscountTTC ? ["Remise", `- ${euro(totals.globalDiscountTTC)}`] : null,
    ["TVA", euro(totals.taxAmount)],
  ].filter(Boolean);
  let ty = ctx.y + 4;
  rows.forEach(row => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    setInk(pdf, INK);
    pdf.text(row[0], boxX, ty);
    pdf.setFont("helvetica", "bold");
    pdf.text(row[1], PAGE_W - MX, ty, { align: "right" });
    ty += 6;
  });
  setStroke(pdf, BLUE);
  pdf.setLineWidth(0.7);
  pdf.line(boxX, ty - 2, PAGE_W - MX, ty - 2);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  setInk(pdf, INK);
  pdf.text("Total TTC", boxX, ty + 6);
  pdf.text(euro(totals.totalTTC), PAGE_W - MX, ty + 6, { align: "right" });
  ctx.y += Math.max(financeH, totalsH) + 4;
}

function drawNote(ctx, title, text) {
  if (!text) return;
  const { pdf } = ctx;
  const lines = wrap(pdf, text, INNER_W - 8);
  const h = 10 + lines.length * 4;
  ensureSpace(ctx, h);
  setFill(pdf, [247, 248, 251]);
  setStroke(pdf, GOLD);
  pdf.setLineWidth(1.2);
  pdf.rect(MX, ctx.y, INNER_W, h, "F");
  pdf.line(MX, ctx.y, MX, ctx.y + h);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  setInk(pdf, BLUE);
  if (title) pdf.text(title, MX + 4, ctx.y + 5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  setInk(pdf, INK);
  pdf.text(lines, MX + 4, ctx.y + (title ? 10 : 6));
  ctx.y += h + 4;
}

function drawAcceptance(ctx, representativeName, signatureData) {
  const { pdf } = ctx;
  const h = 32;
  const gap = 4;
  const boxW = (INNER_W - gap) / 2;
  drawBox(pdf, MX, ctx.y, boxW, h);
  drawBox(pdf, MX + boxW + gap, ctx.y, boxW, h);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  setInk(pdf, BLUE);
  pdf.text("REPRÉSENTANT MKL ÉNERGIES", MX + 3.5, ctx.y + 5);
  setInk(pdf, INK);
  pdf.text("Signature précédée de la mention « Bon pour accord »", MX + boxW + gap + 3.5, ctx.y + 5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(representativeName || "Nom et prénom", MX + 3.5, ctx.y + 11);
  pdf.text("Date :", MX + boxW + gap + 3.5, ctx.y + 11);
  if (signatureData && String(signatureData).startsWith("data:")) {
    try {
      pdf.addImage(signatureData, imageFormat(signatureData), MX + 3.5, ctx.y + 13, 40, 14);
    } catch {
      pdf.setTextColor(...MUTED);
      pdf.text("Signature", MX + 3.5, ctx.y + 24);
    }
  } else {
    setInk(pdf, MUTED);
    pdf.text("Signature", MX + 3.5, ctx.y + 24);
  }
  ctx.y += h + 4;
}

function resolveCustomer(doc, clients) {
  const customer = clients.find(item => String(item.id) === String(doc.clientId))
    || clients.find(item => item.name === doc.client)
    || {};
  const address = quoteBillingAddress(customer);
  return {
    name: customer.company || customer.name || doc.client || "Client",
    contact: `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || customer.contact || "",
    address: address || "Adresse à compléter",
    worksite: quoteWorksiteAddress(doc),
    phone: customer.mobile || customer.phone || "",
    email: customer.email || "",
    clientNumber: formatClientNumber(customer.clientNumber),
  };
}

export async function buildDevisPdfBlob(doc, {
  clients = [],
  company = DEFAULT_COMPANY,
  logoData = "",
  rgeLogoData = "",
  annexImages = [],
} = {}) {
  const totals = computeDocumentTotals(doc);
  const customer = resolveCustomer(doc, clients);
  const companyName = companyDisplayName(company);
  const kind = String(doc.kind || "Devis");
  const title = `${kind.toUpperCase()} ${doc.number || ""}`.trim();
  const dateLines = kind === "Devis"
    ? [
        `Date : ${formatDocDate(doc.date)}`,
        `Offre valable jusqu’au : ${formatDocDate(doc.due)}`,
        `Livraison prévue : ${formatDocDate(doc.deliveryDate)}`,
      ]
    : [`Date : ${formatDocDate(doc.date)}`, `Échéance : ${formatDocDate(doc.due)}`];
  const printableLines = totals.lines.filter((_, index) => !(doc.hiddenLines || []).includes(index));
  const noteParts = [doc.specialConditions, doc.freeNote]
    .map(part => String(part || "").trim())
    .filter(part => part && !/CGV MKL/i.test(part));
  const showFinance = kind === "Devis" && doc.financier && doc.financier !== "Sans financement";
  const representativeName = [doc.representativeFirstName, doc.representativeLastName].filter(Boolean).join(" ");

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const ctx = {
    pdf,
    logoData,
    rgeLogoData,
    title,
    dateLines,
    companyName,
    y: MY,
    page: 1,
  };

  drawHeader(ctx);
  if (kind === "Devis" && !doc.deliveryDate) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    setInk(pdf, BLUE);
    setStroke(pdf, BLUE);
    pdf.setLineWidth(0.6);
    pdf.text("PROJET", PAGE_W - MX - 4, MY + 2, { align: "right", angle: 8 });
  }
  drawParties(ctx, company, customer);
  drawWorksite(ctx, customer.worksite);
  drawColHead(ctx);
  printableLines.forEach(item => drawArticle(ctx, item));
  if (noteParts.length) {
    drawNote(ctx, doc.specialConditions ? "CONDITIONS PARTICULIÈRES" : "", noteParts.join("\n\n"));
  }
  const finance = showFinance
    ? {
        financier: doc.financier,
        amount: euro(Number(doc.financedAmount || totals.totalTTC || 0)),
        months: doc.financeMonths || "—",
        monthly: euro(Number(doc.monthlyPayment || 0)),
        firstMonthly: firstMonthlyDelayLabel(doc.firstMonthlyPayment),
        taeg: percent(doc.financeTaeg),
        taea: percent(doc.financeTaea),
      }
    : null;
  const withSignatures = kind === "Devis";
  const closingH = closingBlockHeight({
    finance: Boolean(finance),
    discount: Boolean(totals.globalDiscountTTC),
    signatures: withSignatures,
  });
  const pinnedTop = pinClosingTop(ctx.y, closingH);
  if (pinnedTop == null) newClosingPage(ctx);
  ctx.y = pinClosingTop(ctx.y, closingH) ?? (CONTENT_BOTTOM - closingH);
  drawTotals(ctx, totals, finance);
  if (withSignatures) {
    drawAcceptance(ctx, representativeName, doc.representativeSignature);
  }

  const totalPages = ctx.pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    ctx.pdf.setPage(page);
    drawFooter(ctx, page, totalPages);
  }

  for (const image of Array.isArray(annexImages) ? annexImages : []) {
    if (!image?.data) continue;
    pdf.addPage("a4", "portrait");
    try {
      const format = image.format || imageFormat(image.data);
      const props = pdf.getImageProperties(image.data);
      const ratio = Math.min(PAGE_W / props.width, PAGE_H / props.height);
      const width = props.width * ratio;
      const height = props.height * ratio;
      pdf.addImage(image.data, format, (PAGE_W - width) / 2, (PAGE_H - height) / 2, width, height);
    } catch {
      // page commerciale illisible : on ignore pour ne pas bloquer le devis
    }
  }

  return pdf.output("blob");
}
