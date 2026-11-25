import { jsPDF } from "jspdf";
import { companyDisplayName, companyEmitterLines, DEFAULT_COMPANY } from "./company.js";
import { loadPrintLogo } from "./devis-pdf.js";
import { reservePdfTab, triggerBlobDownload } from "./html-to-pdf.js";
import { documentPdfFilename } from "./record-documents.js";
import { completeStudyFromProject, computeInstallStudyResults, planeProduction } from "./pv-install-study.js";
import { formatPvMoney, formatPvNumber, PV_MONTHS } from "./pv-study.js";

const BLUE = [64, 95, 174];
const GOLD = [255, 204, 0];
const INK = [31, 45, 79];
const MUTED = [125, 135, 153];
const PAGE_W = 210;
const MX = 17;
const MY = 16;

function latin(value) {
  return String(value ?? "").replace(/[\u00a0\u202f\u2007\u2009]/g, " ");
}

export async function buildPvInstallStudyPdfBlob({
  project,
  client = null,
  company = DEFAULT_COMPANY,
  address = "",
  logoData = "",
} = {}) {
  if (!project) throw new Error("Étude introuvable.");
  const complete = completeStudyFromProject(project);
  const results = computeInstallStudyResults(project, complete);
  const companyName = companyDisplayName(company);
  const site = address || [project.address, project.postcode, project.city].filter(Boolean).join(" ") || "Adresse à compléter";
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const drawHead = (title) => {
    if (logoData && String(logoData).startsWith("data:")) {
      try { pdf.addImage(logoData, "PNG", MX, MY, 50, 50 * (551 / 1446)); } catch { /* logo */ }
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.setTextColor(...BLUE);
    pdf.text(latin(title), PAGE_W - MX, MY + 8, { align: "right" });
    pdf.setDrawColor(...GOLD);
    pdf.setLineWidth(1.1);
    pdf.line(MX, MY + 22, PAGE_W - MX, MY + 22);
  };

  const footer = (page, total) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...MUTED);
    pdf.text(latin(companyName), MX, 286);
    pdf.text("Étude d’installation photovoltaïque", PAGE_W / 2, 286, { align: "center" });
    pdf.text(`Page ${page}/${total}`, PAGE_W - MX, 286, { align: "right" });
  };

  drawHead("Étude d’installation photovoltaïque");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.setTextColor(...INK);
  pdf.text(latin("Étude d’installation"), MX, 42);
  pdf.text(latin("photovoltaïque"), MX, 52);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(latin(`${results.powerKwp.toFixed(1)} kWc  ·  ${formatPvNumber(results.production)} kWh / an`), MX, 64);
  pdf.text(latin(`Préparé pour ${project.client || client?.name || "Client"}`), MX, 72);
  pdf.text(latin(site), MX, 80);
  pdf.setFontSize(9);
  pdf.setTextColor(...MUTED);
  companyEmitterLines(company).forEach((line, index) => {
    pdf.text(latin(line), MX, 92 + index * 5);
  });

  pdf.addPage();
  drawHead("Production et impact");
  let y = 40;
  const kpis = [
    ["Autoconsommation", `${Math.round(results.selfRate)} %`],
    ["Autonomie", `${Math.round(results.autonomy)} %`],
    ["Économies 25 ans", formatPvMoney(results.savings25)],
    ["Gain net", formatPvMoney(results.netGain)],
  ];
  kpis.forEach((item, index) => {
    const x = MX + (index % 2) * 90;
    const top = y + Math.floor(index / 2) * 22;
    pdf.setFillColor(241, 245, 250);
    pdf.roundedRect(x, top, 86, 18, 2, 2, "F");
    pdf.setFontSize(8);
    pdf.setTextColor(...MUTED);
    pdf.text(latin(item[0]), x + 4, top + 6);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(...INK);
    pdf.text(latin(item[1]), x + 4, top + 14);
    pdf.setFont("helvetica", "normal");
  });
  y += 52;
  const maxMonth = Math.max(...results.monthly, 1);
  results.monthly.forEach((value, index) => {
    const h = Math.max(3, (value / maxMonth) * 36);
    const x = MX + index * 14.6;
    pdf.setFillColor(...BLUE);
    pdf.rect(x, y + 40 - h, 11, h, "F");
    pdf.setFontSize(6);
    pdf.setTextColor(...MUTED);
    pdf.text(PV_MONTHS[index], x + 5.5, y + 45, { align: "center" });
  });

  pdf.addPage();
  drawHead("Toiture et équipements");
  y = 40;
  results.planes.forEach(plane => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(...INK);
    pdf.text(latin(plane.name), MX, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(latin(`${plane.panels} panneaux · ${Math.round(plane.compass)}° · ${Math.round(plane.tilt)}° · ombrage ${plane.shadePercent || 0} % · ${formatPvNumber(planeProduction(plane))} kWh/an`), MX, y + 6);
    y += 16;
  });
  y += 4;
  pdf.setFont("helvetica", "bold");
  pdf.text(latin(complete.panelModel), MX, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(latin(complete.inverterModel), MX, y + 7);
  if (complete.virtualBattery?.enabled) pdf.text(latin(complete.virtualBattery.name || "Batterie virtuelle"), MX, y + 14);
  pdf.setFontSize(8);
  pdf.setTextColor(...MUTED);
  pdf.text(latin(complete.googleError || "Productible PVGIS. Google Solar se branche dès qu’une licence est enregistrée."), MX, 250);

  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    pdf.setPage(i);
    footer(i, total);
  }
  return new Blob([pdf.output("arraybuffer")], { type: "application/pdf" });
}

export async function downloadPvInstallStudyPdf({ project, client, company = DEFAULT_COMPANY, address, toast } = {}) {
  toast?.("Préparation du PDF…");
  const tab = reservePdfTab();
  try {
    const logoData = await loadPrintLogo();
    const blob = await buildPvInstallStudyPdfBlob({ project, client, company, address, logoData });
    if (!blob?.size) throw new Error("PDF vide.");
    triggerBlobDownload(blob, documentPdfFilename({
      kind: "Étude d'installation",
      title: project?.number || project?.name,
      source: client || project,
    }), tab);
    toast?.("PDF ouvert");
    return blob;
  } catch (error) {
    try { tab?.close(); } catch { /* ignore */ }
    throw error;
  }
}
