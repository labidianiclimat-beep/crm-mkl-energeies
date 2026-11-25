/** Bon d’intervention SAV, une page A4, prérempli avec le client du dossier. */

import { jsPDF } from "jspdf";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { companyAddressLine, companyContactLine, companyDisplayName, companyLegalLines, DEFAULT_COMPANY } from "./company.js";

const BLUE = [64, 95, 174];
const GOLD = [255, 219, 98];
const INK = [31, 45, 79];
const MUTED = [90, 102, 124];
const LINE = [210, 216, 228];
const PAGE_W = 210;
const PAGE_H = 297;
const MX = 12;

function latin(value) {
  return String(value ?? "")
    .replace(/[\u00a0\u202f\u2007\u2009]/g, " ")
    .replace(/[\u2012\u2013\u2014\u2015]/g, "-");
}

function parisParts(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return { date: "", time: "" };
  return {
    date: new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(date),
  };
}

function addressBlock(person = {}) {
  return [
    person.name,
    person.address,
    [person.postalCode, person.city].filter(Boolean).join(" "),
  ].filter(Boolean);
}

export function interventionSheetModel(savCase = {}, company = DEFAULT_COMPANY) {
  const when = parisParts(savCase.scheduledAt);
  const client = {
    name: savCase.clientName || "",
    address: savCase.clientAddress || "",
    postalCode: savCase.clientPostal || "",
    city: savCase.clientCity || "",
  };
  return {
    number: savCase.reference || "",
    date: when.date,
    time: when.time,
    billTo: addressBlock(client),
    site: addressBlock(client),
    contact: savCase.callerName || savCase.clientName || "",
    phone: savCase.callerPhone || savCase.clientPhone || "",
    nature: [savCase.categoryLabel, savCase.subject].filter(Boolean).join(" — "),
    operation: savCase.description || "",
    toInvoice: Boolean(savCase.toInvoice),
    company: company || DEFAULT_COMPANY,
  };
}

export function interventionFooterLines(company = DEFAULT_COMPANY) {
  const address = companyAddressLine(company);
  const legal = [...companyLegalLines(company), companyContactLine(company)].filter(Boolean).join("  ·  ");
  return [
    companyDisplayName(company),
    address ? `Siège social : ${address}` : "",
    legal,
  ].filter(Boolean);
}

function ink(pdf, color) {
  pdf.setTextColor(...color);
}

function fill(pdf, color) {
  pdf.setFillColor(...color);
}

function stroke(pdf, color) {
  pdf.setDrawColor(...color);
}

function wrapped(pdf, text, width, size = 9) {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(size);
  return pdf.splitTextToSize(latin(text), width);
}

function sectionTitle(pdf, label, y) {
  fill(pdf, BLUE);
  pdf.rect(MX, y, PAGE_W - MX * 2, 6, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  ink(pdf, [255, 255, 255]);
  pdf.text(latin(label), MX + 2, y + 4.1);
  return y + 6;
}

function mm(value) {
  return (value * 72) / 25.4;
}

async function withWritableFields(bytes, fields) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPages()[0];
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const pageH = page.getHeight();
  fields.forEach(field => {
    const box = {
      x: mm(field.x),
      y: pageH - mm(field.y + field.h),
      width: mm(field.w),
      height: mm(field.h),
      borderWidth: field.kind === "check" ? 1 : (field.background ? 0.4 : 0),
      borderColor: rgb(64 / 255, 95 / 255, 174 / 255),
      backgroundColor: field.background ? rgb(1, 1, 1) : undefined,
      textColor: rgb(31 / 255, 45 / 255, 79 / 255),
    };
    if (field.kind === "check") {
      const check = form.createCheckBox(field.name);
      check.addToPage(page, box);
      if (field.checked) check.check();
      return;
    }
    const text = form.createTextField(field.name);
    if (field.multiline) text.enableMultiline();
    text.setText(latin(field.value || ""));
    text.addToPage(page, box);
    text.setFontSize(field.size || 9);
    text.updateAppearances(font);
  });
  return Buffer.from(await doc.save());
}

export async function buildSavInterventionPdf(model, { logoData = "" } = {}) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const fields = [];
  const inner = PAGE_W - MX * 2;
  fill(pdf, BLUE);
  pdf.rect(0, 0, PAGE_W, 28, "F");
  fill(pdf, GOLD);
  pdf.rect(0, 28, PAGE_W, 2.2, "F");
  if (logoData && String(logoData).startsWith("data:")) {
    try {
      pdf.addImage(logoData, "PNG", MX, 4, 36, 36 * (551 / 1446));
    } catch {
      /* le bon reste lisible sans logo */
    }
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  ink(pdf, [255, 255, 255]);
  pdf.text("BON D'INTERVENTION", 58, 12);
  pdf.setFontSize(10);
  pdf.text(latin(model.number || "SAV"), 58, 18);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("Date", 58, 23.6);
  pdf.text("Heure", 112, 23.6);
  fields.push({ name: "date", x: 68, y: 19.4, w: 36, h: 6.2, value: model.date || "", size: 10, background: true });
  fields.push({ name: "heure", x: 124, y: 19.4, w: 22, h: 6.2, value: model.time || "", size: 10, background: true });

  let y = 36;
  const boxW = (inner - 4) / 2;
  const boxH = 28;
  stroke(pdf, BLUE);
  pdf.setLineWidth(0.4);
  pdf.roundedRect(MX, y, boxW, boxH, 1.5, 1.5, "S");
  pdf.roundedRect(MX + boxW + 4, y, boxW, boxH, 1.5, 1.5, "S");
  const party = (x, title, lines, name) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    ink(pdf, BLUE);
    pdf.text(latin(title), x + 2, y + 5);
    fields.push({ name, x: x + 1.5, y: y + 7, w: boxW - 3, h: boxH - 8, value: (lines || []).join("\n"), multiline: true, size: 9 });
  };
  party(MX, "FACTURE A ADRESSER A", model.billTo || [], "facture");
  party(MX + boxW + 4, "LIEU DES TRAVAUX", model.site || [], "lieu");
  y += boxH + 4;

  const facts = [
    ["Personne a contacter", model.contact],
    ["Telephone du client", model.phone],
  ];
  facts.forEach((item, index) => {
    const x = MX + index * (inner / 2);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    ink(pdf, BLUE);
    pdf.text(latin(item[0]), x, y);
    fields.push({ name: index === 0 ? "contact" : "telephone", x, y: y + 1.5, w: inner / 2 - 4, h: 6, value: item[1] || "", size: 10 });
  });
  y += 12;

  y = sectionTitle(pdf, "NATURE DES TRAVAUX", y);
  fields.push({ name: "nature", x: MX + 1, y: y + 1, w: inner - 2, h: 12, value: model.nature || "", multiline: true, size: 9 });
  y += 14;

  y = sectionTitle(pdf, "OPERATION A EFFECTUER", y);
  fields.push({ name: "operation", x: MX + 1, y: y + 1, w: inner - 2, h: 16, value: model.operation || "", multiline: true, size: 9 });
  y += 18;

  const columns = [
    { label: "Nom", w: 42 },
    { label: "Heures passees", w: 32 },
    { label: "Sur place", w: 28 },
    { label: "Divers", w: 24 },
    { label: "Total", w: 24 },
    { label: "Deplacement", w: inner - 150 },
  ];
  fill(pdf, BLUE);
  pdf.rect(MX, y, inner, 7, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  ink(pdf, [255, 255, 255]);
  let columnX = MX;
  columns.forEach(column => {
    pdf.text(latin(column.label), columnX + 1.5, y + 4.6);
    columnX += column.w;
  });
  y += 7;
  stroke(pdf, LINE);
  pdf.setLineWidth(0.2);
  for (let row = 0; row < 8; row += 1) {
    pdf.rect(MX, y, inner, 8, "S");
    let lineX = MX;
    columns.forEach((column, index) => {
      if (lineX > MX) pdf.line(lineX, y, lineX, y + 8);
      fields.push({
        name: `ligne_${row + 1}_${index + 1}`,
        x: lineX + 0.4,
        y: y + 0.4,
        w: column.w - 0.8,
        h: 7.2,
        value: "",
        size: 9,
      });
      lineX += column.w;
    });
    y += 8;
  }
  y += 4;

  y = sectionTitle(pdf, "OBSERVATION", y);
  stroke(pdf, LINE);
  pdf.rect(MX, y, inner, 16, "S");
  fields.push({ name: "observation", x: MX + 1, y: y + 1, w: inner - 2, h: 14, value: "", multiline: true, size: 9 });
  y += 20;

  const choice = (label, x, prefix, checkedOui = false) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    ink(pdf, INK);
    pdf.text(latin(label), x, y + 4);
    pdf.setFont("helvetica", "normal");
    pdf.text("oui", x + 44, y + 3.4);
    pdf.text("non", x + 62, y + 3.4);
    fields.push({ kind: "check", name: `${prefix}_oui`, x: x + 38, y, w: 4, h: 4, checked: checkedOui });
    fields.push({ kind: "check", name: `${prefix}_non`, x: x + 56, y, w: 4, h: 4, checked: false });
  };
  choice("Devis a faire ?", MX, "devis");
  choice("Travaux termines ?", MX + inner / 2, "travaux");
  y += 8;
  choice("A facturer ?", MX, "facturer", Boolean(model.toInvoice));
  y += 8;

  stroke(pdf, BLUE);
  pdf.setLineWidth(0.4);
  pdf.roundedRect(MX, y, inner, 22, 1.5, 1.5, "S");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  ink(pdf, BLUE);
  pdf.text("Date et signature du client", MX + 3, y + 6);
  fields.push({ name: "signature", x: MX + 2, y: y + 8, w: inner - 4, h: 12, value: "", multiline: true, size: 9 });

  stroke(pdf, LINE);
  pdf.setLineWidth(0.3);
  pdf.line(MX, PAGE_H - 16, PAGE_W - MX, PAGE_H - 16);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  ink(pdf, MUTED);
  interventionFooterLines(model.company).slice(0, 3).forEach((line, index) => {
    const shown = wrapped(pdf, line, inner)[0] || "";
    pdf.text(shown, MX, PAGE_H - 12 + index * 3.4);
  });

  return withWritableFields(Buffer.from(pdf.output("arraybuffer")), fields);
}
