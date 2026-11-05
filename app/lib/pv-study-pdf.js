/** PDF étude photovoltaïque — génération vectorielle, même bandeau que le devis. */
import { jsPDF } from "jspdf";
import {
  companyDisplayName,
  companyEmitterLines,
  DEFAULT_COMPANY,
} from "./company.js";
import { loadPrintLogo } from "./devis-pdf.js";
import { reservePdfTab, triggerBlobDownload } from "./html-to-pdf.js";
import { documentPdfFilename } from "./record-documents.js";
import { computePvStudyResults, formatPvMoney, formatPvNumber, PV_MONTHS } from "./pv-study.js";

const BLUE = [64, 95, 174];
const GOLD = [255, 219, 98];
const INK = [31, 45, 79];
const MUTED = [125, 135, 153];
const DESC = [55, 65, 81];
const LINE = [228, 231, 238];
const PAGE_W = 210;
const MX = 17;
const MY = 16;
const FOOTER_Y = 286;
const CONTENT_BOTTOM = 278;
const LOGO_W = 58;
const LOGO_H = 58 * (551 / 1446);
const INNER_W = PAGE_W - MX * 2;

function pdfLatin(value) {
  return String(value ?? "").replace(/[\u00a0\u202f\u2007\u2009]/g, " ");
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
  return pdf.splitTextToSize(pdfLatin(text || ""), width);
}

function imageFormat(data) {
  const value = String(data || "");
  if (value.startsWith("data:image/jpeg") || value.startsWith("data:image/jpg")) return "JPEG";
  return "PNG";
}

function formatStudyDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-FR");
}

function drawLogo(pdf, logoData, x, y) {
  if (!logoData || !String(logoData).startsWith("data:")) return;
  try {
    pdf.addImage(logoData, imageFormat(logoData), x, y, LOGO_W, LOGO_H);
  } catch {
    /* logo optionnel */
  }
}

function drawHeader(ctx, { continued = false } = {}) {
  const { pdf, logoData, title, dateLines } = ctx;
  drawLogo(pdf, logoData, MX, MY);
  const textX = PAGE_W - MX;
  let ty = MY + 5;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  setInk(pdf, BLUE);
  pdf.text(pdfLatin(continued ? `${title} — Suite` : title), textX, ty, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  setInk(pdf, INK);
  dateLines.forEach(line => {
    ty += 5;
    pdf.text(pdfLatin(line), textX, ty, { align: "right" });
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
  pdf.text(pdfLatin(companyName), MX, FOOTER_Y);
  pdf.text(pdfLatin(`Étude photovoltaïque · ${companyName}`), PAGE_W / 2, FOOTER_Y, { align: "center" });
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
    customer.contact && customer.contact !== customer.name ? customer.contact : "",
    customer.address,
    [customer.phone, customer.email].filter(Boolean).join(" · "),
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

function sectionTitle(ctx, label) {
  const { pdf } = ctx;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  setInk(pdf, BLUE);
  pdf.text(pdfLatin(label), MX, ctx.y + 4);
  ctx.y += 10;
}

function noteBox(ctx, text) {
  const { pdf } = ctx;
  const lines = wrap(pdf, text, INNER_W - 8);
  const h = 6 + lines.length * 3.6;
  setFill(pdf, [247, 249, 252]);
  setStroke(pdf, GOLD);
  pdf.setLineWidth(1.1);
  pdf.rect(MX, ctx.y, INNER_W, h, "F");
  pdf.line(MX, ctx.y, MX, ctx.y + h);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  setInk(pdf, MUTED);
  lines.forEach((line, index) => {
    pdf.text(line, MX + 4, ctx.y + 5 + index * 3.6);
  });
  ctx.y += h + 4;
}

function kpiRow(ctx, items) {
  const { pdf } = ctx;
  const gap = 3.5;
  const w = (INNER_W - gap * (items.length - 1)) / items.length;
  const h = 22;
  items.forEach((item, index) => {
    const x = MX + index * (w + gap);
    setFill(pdf, [241, 245, 250]);
    setStroke(pdf, LINE);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(x, ctx.y, w, h, 2, 2, "FD");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    setInk(pdf, MUTED);
    pdf.text(pdfLatin(item.label), x + 3, ctx.y + 6);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    setInk(pdf, INK);
    pdf.text(pdfLatin(item.value), x + 3, ctx.y + 15);
  });
  ctx.y += h + 6;
}

function infoLines(ctx, rows) {
  const { pdf } = ctx;
  rows.forEach(([label, value]) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    setInk(pdf, MUTED);
    pdf.text(pdfLatin(label), MX, ctx.y);
    pdf.setFont("helvetica", "bold");
    setInk(pdf, INK);
    pdf.text(pdfLatin(value), MX + 42, ctx.y);
    ctx.y += 5;
  });
  ctx.y += 2;
}

function newPage(ctx) {
  ctx.pdf.addPage();
  ctx.page += 1;
  drawHeader(ctx, { continued: true });
}

export async function buildPvStudyPdfBlob({
  project,
  client = null,
  company = DEFAULT_COMPANY,
  address = "",
  logoData = "",
} = {}) {
  if (!project) throw new Error("Étude introuvable.");
  const results = computePvStudyResults(project);
  const companyName = companyDisplayName(company);
  const hasBattery = Number(project.batteryCapacity || 0) > 0;
  const siteAddress = address
    || [project.address, project.postcode, project.city].filter(Boolean).join(" ")
    || [client?.address, client?.postalCode || client?.codePostal, client?.city].filter(Boolean).join(" ")
    || "Adresse à compléter";
  const title = "ÉTUDE PHOTOVOLTAÏQUE";
  const dateLines = [
    `Étude du ${formatStudyDate(project.created)}`,
    project.name || "Projet photovoltaïque",
    [project.city, project.postcode].filter(Boolean).join(" ") || "",
  ].filter(Boolean);

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const ctx = { pdf, logoData, title, dateLines, companyName, y: MY, page: 1 };

  drawHeader(ctx);
  drawParties(ctx, company, {
    name: project.client || client?.name || "Client",
    contact: `${client?.firstName || ""} ${client?.lastName || ""}`.trim(),
    address: siteAddress,
    phone: client?.phone || client?.mobile || "",
    email: client?.email || "",
  });

  sectionTitle(ctx, "Votre projet");
  kpiRow(ctx, [
    { label: "Puissance", value: `${Number(project.powerKwp || 0).toFixed(1)} kWc` },
    { label: "Production / an", value: `${formatPvNumber(results.production)} kWh` },
    { label: "Prix TTC", value: formatPvMoney(project.price) },
    { label: "Panneaux", value: `${project.panels || "—"} × ${project.panelPower || "—"} W` },
  ]);
  infoLines(ctx, [
    ["Projet", project.name || "—"],
    ["Ville", project.city || "—"],
    ["Productible", project.yieldValue || project.yield
      ? `${project.yieldValue || project.yield} kWh/kWc (${project.yieldSource === "pvgis" ? "PVGIS" : "estimation"})`
      : "—"],
    ...(project.lat && project.lon ? [["GPS", `${Number(project.lat).toFixed(5)}, ${Number(project.lon).toFixed(5)}`]] : []),
    ...(hasBattery ? [["Batterie", `${project.batteryCapacity} kWh`]] : []),
  ]);
  noteBox(ctx, "Estimations indicatives. La production réelle dépend de l'orientation, de l'inclinaison, des ombrages, de la météo et des caractéristiques définitives du site.");

  sectionTitle(ctx, "Chiffres clés");
  kpiRow(ctx, [
    { label: "Gain 1re année", value: formatPvMoney(results.yearlySaving) },
    { label: "Autonomie", value: `${Math.round(results.autonomy)} %` },
    { label: "Autoconsommation", value: `${project.selfConsumptionRate || 65} %` },
    { label: "Retour simple", value: `${results.payback ? results.payback.toFixed(1) : "—"} ans` },
  ]);

  newPage(ctx);
  sectionTitle(ctx, "Fonctionnement");
  const steps = [
    ["1. Panneaux", "Produisent du courant continu"],
    ["2. Onduleur", "Transforme le courant en alternatif"],
    ["3. Habitation", "Consomme en priorité l'énergie solaire"],
    ["4. Surplus", "Injecté et vendu au réseau"],
  ];
  const stepW = (INNER_W - 10.5) / 4;
  steps.forEach(([label, text], index) => {
    const x = MX + index * (stepW + 3.5);
    setFill(ctx.pdf, [255, 248, 216]);
    setStroke(ctx.pdf, GOLD);
    ctx.pdf.setLineWidth(0.3);
    ctx.pdf.roundedRect(x, ctx.y, stepW, 22, 2, 2, "FD");
    ctx.pdf.setFont("helvetica", "bold");
    ctx.pdf.setFontSize(8);
    setInk(ctx.pdf, BLUE);
    ctx.pdf.text(pdfLatin(label), x + 2.5, ctx.y + 7);
    ctx.pdf.setFont("helvetica", "normal");
    ctx.pdf.setFontSize(7);
    setInk(ctx.pdf, DESC);
    wrap(ctx.pdf, text, stepW - 5).forEach((line, i) => {
      ctx.pdf.text(line, x + 2.5, ctx.y + 13 + i * 3.2);
    });
  });
  ctx.y += 28;

  sectionTitle(ctx, "Production mensuelle estimée");
  const colW = INNER_W / 12;
  const maxMonth = Math.max(...results.monthly, 1);
  const chartH = 42;
  const chartY = ctx.y + chartH;
  results.monthly.forEach((value, index) => {
    const h = Math.max(3, (value / maxMonth) * 34);
    const x = MX + index * colW + 1.2;
    setFill(ctx.pdf, BLUE);
    ctx.pdf.rect(x, chartY - h, colW - 2.4, h, "F");
    ctx.pdf.setFont("helvetica", "normal");
    ctx.pdf.setFontSize(6);
    setInk(ctx.pdf, MUTED);
    ctx.pdf.text(PV_MONTHS[index], x + (colW - 2.4) / 2, chartY + 4, { align: "center" });
    ctx.pdf.setFontSize(6);
    setInk(ctx.pdf, INK);
    ctx.pdf.text(formatPvNumber(value), x + (colW - 2.4) / 2, chartY - h - 1.5, { align: "center" });
  });
  ctx.y = chartY + 10;

  sectionTitle(ctx, "Répartition de l'énergie");
  kpiRow(ctx, [
    { label: "Autoconsommés", value: `${formatPvNumber(results.selfConsumed)} kWh` },
    { label: "Vendus au réseau", value: `${formatPvNumber(results.surplus)} kWh` },
    { label: "Restant à acheter", value: `${formatPvNumber(results.gridAfter)} kWh` },
    { label: "Prix réseau", value: `${Number(project.electricityPrice || 0.194).toFixed(3)} €/kWh` },
  ]);

  newPage(ctx);
  sectionTitle(ctx, "Rentabilité sur 25 ans");
  kpiRow(ctx, [
    { label: "Économies cumulées", value: formatPvMoney(results.savings25) },
    { label: "Coût initial", value: formatPvMoney(project.price) },
    { label: "Gain net estimé", value: formatPvMoney(results.savings25 - Number(project.price || 0)) },
    { label: "Retour simple", value: `${results.payback ? results.payback.toFixed(1) : "—"} ans` },
  ]);
  noteBox(ctx, "Projection non contractuelle : elle ne tient pas compte des coûts éventuels de financement, maintenance, remplacement de matériel, fiscalité ou évolution réglementaire. Hypothèse : +4 % / an sur le prix réseau.");

  sectionTitle(ctx, "Impact environnemental");
  kpiRow(ctx, [
    { label: "CO2 évités / an", value: `${formatPvNumber(results.co2)} kg` },
    { label: "Éq. arbres", value: String(results.trees) },
    { label: "Retour énergétique", value: "< 2 ans" },
    { label: "Garantie produit", value: "30 ans*" },
  ]);

  sectionTitle(ctx, "Équipements et prochaines étapes");
  const equipment = [
    `${project.panels || "—"} panneaux photovoltaïques · ${project.panelPower || "—"} W par module`,
    "Onduleur ou micro-onduleurs · dimensionnement confirmé après visite technique",
    hasBattery ? `Batterie ${project.batteryCapacity} kWh · capacité à confirmer` : null,
  ].filter(Boolean);
  ctx.pdf.setFont("helvetica", "normal");
  ctx.pdf.setFontSize(10);
  setInk(ctx.pdf, INK);
  equipment.forEach(line => {
    ctx.pdf.text(`•  ${pdfLatin(line)}`, MX, ctx.y);
    ctx.y += 6;
  });
  ctx.y += 3;
  [
    "1. Visite technique — toiture, tableau électrique, accès et ombrages.",
    "2. Démarches administratives — déclaration préalable et raccordement.",
    `3. Installation — planification du chantier et pose ${companyName}.`,
    "4. Mise en service — contrôles, raccordement et accompagnement.",
  ].forEach(line => {
    ctx.pdf.setFont("helvetica", "normal");
    ctx.pdf.setFontSize(10);
    setInk(ctx.pdf, DESC);
    wrap(ctx.pdf, line, INNER_W).forEach(part => {
      ctx.pdf.text(part, MX, ctx.y);
      ctx.y += 5;
    });
    ctx.y += 1;
  });

  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    pdf.setPage(i);
    drawFooter(ctx, i, total);
  }

  return new Blob([pdf.output("arraybuffer")], { type: "application/pdf" });
}

export async function downloadPvStudyPdf({
  project,
  client,
  company = DEFAULT_COMPANY,
  address,
  toast,
} = {}) {
  toast?.("Préparation du PDF…");
  const tab = reservePdfTab();
  try {
    const logoData = await loadPrintLogo();
    const blob = await buildPvStudyPdfBlob({ project, client, company, address, logoData });
    if (!blob || !blob.size) throw new Error("PDF vide.");
    triggerBlobDownload(blob, documentPdfFilename({
      kind: "Étude photovoltaïque",
      title: project?.number || project?.name,
      source: client || project,
    }), tab);
    toast?.("PDF ouvert");
    return blob;
  } catch (error) {
    try { tab?.close(); } catch { /* ignore */ }
    const message = error?.message || "Génération du PDF impossible.";
    toast?.(message);
    throw error;
  }
}
