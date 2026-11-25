/** PDF dossier déclaration préalable — vectoriel, même bandeau que l’étude PV. */
import { jsPDF } from "jspdf";
import {
  companyDisplayName,
  companyEmitterLines,
  DEFAULT_COMPANY,
} from "./company.js";
import { loadPrintLogo } from "./devis-pdf.js";
import { reservePdfTab, triggerBlobDownload } from "./html-to-pdf.js";
import { documentPdfFilename } from "./record-documents.js";
import { housingFromPerson } from "./housing.js";
import {
  buildTownHallNotice,
  parcelLabel,
  procedureById,
  requiredPieces,
  siteAddressFromProject,
  townHallFromProject,
  townHallPieceProgress,
} from "./pv-town-hall.js";

const BLUE = [64, 95, 174];
const GOLD = [255, 219, 98];
const INK = [31, 45, 79];
const MUTED = [125, 135, 153];
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

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("fr-FR");
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
  pdf.text(pdfLatin(`Dossier mairie · ${companyName}`), PAGE_W / 2, FOOTER_Y, { align: "center" });
  pdf.text(`Page ${page}/${total}`, PAGE_W - MX, FOOTER_Y, { align: "right" });
}

function ensureSpace(ctx, needed) {
  if (ctx.y + needed < CONTENT_BOTTOM) return;
  ctx.pdf.addPage();
  drawHeader(ctx, { continued: true });
}

function sectionTitle(ctx, label) {
  ensureSpace(ctx, 12);
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
  ensureSpace(ctx, h + 4);
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

function infoLines(ctx, rows) {
  const { pdf } = ctx;
  rows.forEach(([label, value]) => {
    const lines = wrap(pdf, value || "—", INNER_W - 52);
    const h = Math.max(7, lines.length * 4.2);
    ensureSpace(ctx, h + 1);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    setInk(pdf, MUTED);
    pdf.text(pdfLatin(label), MX, ctx.y + 3.5);
    setInk(pdf, INK);
    lines.forEach((line, index) => {
      pdf.text(line, MX + 50, ctx.y + 3.5 + index * 4.2);
    });
    ctx.y += h;
  });
  ctx.y += 3;
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
  ensureSpace(ctx, boxH + 6);
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

  writeParty(MX, "MANDATAIRE", emitter[0], emitterDetails);
  writeParty(MX + boxW + gap, "DEMANDEUR", client[0], clientDetails);
  ctx.y = y + boxH + 6;
}

function customerFrom(project, client) {
  const person = client || {};
  return {
    name: person.name || project.client || "Client",
    contact: [person.firstName, person.lastName].filter(Boolean).join(" ") || person.contact || "",
    address: siteAddressFromProject(project, person),
    phone: person.mobile || person.phone || "",
    email: person.email || "",
  };
}

export async function buildTownHallDossierPdfBlob({
  project,
  client,
  company = DEFAULT_COMPANY,
  logoData,
} = {}) {
  const person = client || {};
  const townHall = townHallFromProject(project, person);
  const housing = housingFromPerson(person);
  const procedure = procedureById(townHall.procedure);
  const progress = townHallPieceProgress(townHall, person);
  const pieces = requiredPieces(townHall, person);
  const customer = customerFrom(project, person);
  const companyName = companyDisplayName(company);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const ctx = {
    pdf,
    logoData,
    companyName,
    title: "DOSSIER MAIRIE",
    dateLines: [
      project.name || "Installation photovoltaïque",
      project.quoteNumber ? `Devis ${project.quoteNumber}` : "",
      `Statut : ${project.townHallStatus || "À préparer"}`,
    ].filter(Boolean),
    y: MY,
  };

  drawHeader(ctx);
  noteBox(
    ctx,
    "Dossier préparatoire pour la déclaration préalable. Il ne remplace pas le CERFA officiel. À déposer en mairie ou sur le guichet urbanisme de la commune, avec les pièces cochées ci-dessous."
  );
  drawParties(ctx, company, customer);

  sectionTitle(ctx, "Procédure");
  infoLines(ctx, [
    ["Nature", procedure.label],
    ["Imprimé", procedure.cerfa || "—"],
    ["Référence DP", townHall.reference || "Non encore attribuée"],
    ["Dépôt", formatDate(townHall.depositedAt)],
    ["Instruction", townHall.instructionUntil ? `jusqu’au ${formatDate(townHall.instructionUntil)}` : "1 mois (2 mois si ABF)"],
    ["ABF", townHall.abf === "oui" ? "Oui — abords protégés" : townHall.abf === "non" ? "Non" : "À vérifier"],
    ["Copropriété", townHall.copro === "oui" ? "Oui" : "Non"],
  ]);

  sectionTitle(ctx, "Projet");
  infoLines(ctx, [
    ["Adresse", customer.address || "—"],
    ["Logement", [housing.housingType, housing.constructionYear, housing.occupancy].filter(Boolean).join(" · ") || "—"],
    ["Puissance", project.powerKwp ? `${Number(project.powerKwp).toLocaleString("fr-FR")} kWc` : "—"],
    ["Modules", project.panels ? `${project.panels}${project.panelPower ? ` × ${project.panelPower} Wc` : ""}` : "—"],
    ["Pose", townHall.roofKind],
    ["Aspect", townHall.appearance],
  ]);

  const urbanisme = townHall.urbanisme || {};
  if (urbanisme.section || urbanisme.numero || urbanisme.zoneLabel) {
    sectionTitle(ctx, "Parcelle et urbanisme");
    infoLines(ctx, [
      ["Parcelle", parcelLabel(urbanisme) || "—"],
      ["Commune", [urbanisme.commune, urbanisme.insee].filter(Boolean).join(" · ") || "—"],
      ["Contenance", urbanisme.contenance ? `${urbanisme.contenance} m²` : "—"],
      ["Zone PLU", [urbanisme.zoneLabel, urbanisme.zoneDetail].filter(Boolean).join(" — ") || "—"],
    ]);
  }

  sectionTitle(ctx, "Notice descriptive");
  const notice = wrap(ctx.pdf, buildTownHallNotice(project, person, townHall), INNER_W);
  ctx.pdf.setFont("helvetica", "normal");
  ctx.pdf.setFontSize(10);
  setInk(ctx.pdf, INK);
  notice.forEach(line => {
    ensureSpace(ctx, 6);
    ctx.pdf.text(line, MX, ctx.y);
    ctx.y += 5;
  });
  ctx.y += 3;

  sectionTitle(ctx, `Pièces du dossier  (${progress.done}/${progress.total})`);
  pieces.forEach(piece => {
    ensureSpace(ctx, 8);
    const done = Boolean(townHall.pieces[piece.id]);
    ctx.pdf.setFont("helvetica", "bold");
    ctx.pdf.setFontSize(10);
    setInk(ctx.pdf, done ? [46, 125, 50] : INK);
    ctx.pdf.text(pdfLatin(done ? "[x]" : "[ ]"), MX, ctx.y);
    ctx.pdf.setFont("helvetica", "normal");
    setInk(ctx.pdf, INK);
    ctx.pdf.text(pdfLatin(piece.label), MX + 10, ctx.y);
    ctx.y += 5;
  });
  ctx.y += 4;

  sectionTitle(ctx, "Mandat");
  const mandate = wrap(
    ctx.pdf,
    `Je soussigné(e), ${customer.name}, demeurant ${customer.address || "à l’adresse du projet"}, donne pouvoir à ${companyName} afin d’accomplir en mon nom les démarches administratives concernant l’installation photovoltaïque prévue à cette adresse, où notamment le dépôt et le suivi de la déclaration préalable en mairie.`,
    INNER_W
  );
  ctx.pdf.setFont("helvetica", "normal");
  ctx.pdf.setFontSize(10);
  setInk(ctx.pdf, INK);
  mandate.forEach(line => {
    ensureSpace(ctx, 6);
    ctx.pdf.text(line, MX, ctx.y);
    ctx.y += 5;
  });
  ctx.y += 10;
  ensureSpace(ctx, 18);
  ctx.pdf.setFont("helvetica", "normal");
  ctx.pdf.setFontSize(9);
  setInk(ctx.pdf, MUTED);
  ctx.pdf.text("Fait à ................................  le ........ / ........ / ............", MX, ctx.y);
  ctx.y += 12;
  ctx.pdf.text("Signature du demandeur", MX, ctx.y);
  ctx.pdf.text(`Pour ${companyName}`, PAGE_W / 2 + 10, ctx.y);

  if (townHall.notes) {
    ctx.y += 10;
    sectionTitle(ctx, "Notes internes");
    const notes = wrap(ctx.pdf, townHall.notes, INNER_W);
    ctx.pdf.setFont("helvetica", "normal");
    ctx.pdf.setFontSize(9);
    setInk(ctx.pdf, INK);
    notes.forEach(line => {
      ensureSpace(ctx, 5);
      ctx.pdf.text(line, MX, ctx.y);
      ctx.y += 4.5;
    });
  }

  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    pdf.setPage(i);
    drawFooter(ctx, i, total);
  }

  return new Blob([pdf.output("arraybuffer")], { type: "application/pdf" });
}

export async function downloadTownHallDossierPdf({
  project,
  client,
  company = DEFAULT_COMPANY,
  toast,
} = {}) {
  toast?.("Préparation du dossier mairie…");
  const tab = reservePdfTab();
  try {
    const logoData = await loadPrintLogo();
    const blob = await buildTownHallDossierPdfBlob({ project, client, company, logoData });
    if (!blob || !blob.size) throw new Error("PDF vide.");
    triggerBlobDownload(blob, documentPdfFilename({
      kind: "Dossier mairie",
      title: project?.number || project?.name,
      source: client || project,
    }), tab);
    toast?.("Dossier mairie ouvert");
    return blob;
  } catch (error) {
    try { tab?.close(); } catch { /* ignore */ }
    const message = error?.message || "Génération du dossier impossible.";
    toast?.(message);
    throw error;
  }
}
