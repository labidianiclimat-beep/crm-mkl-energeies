import {
  companyDisplayName,
  DEFAULT_COMPANY,
  DOCUMENT_HEAD_CSS,
  DOCUMENT_PARTIES_CSS,
  documentPartiesHtml,
} from "./company.js";
import { DOCUMENT_PREVIEW_BAR_CSS, documentPreviewBarHtml, openHtmlPreview } from "./document-preview.js";
import { documentPdfFilename } from "./record-documents.js";
import { formatThermalNumber } from "./thermal-study.js";
import {
  EQUIPMENT_TYPES,
  SIZING_ATTESTATION_INTRO,
  SIZING_ATTESTATIONS,
  SIZING_REMIT_SENTENCE,
  SIZING_ROOMS_SENTENCE,
  computeSizingNote,
} from "./sizing-note.js";

function safe(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blank(value, digits = 1) {
  if (value == null || value === "") return "—";
  return formatThermalNumber(value, digits);
}

const SIZING_PRINT_CSS = `
${DOCUMENT_PREVIEW_BAR_CSS}
${DOCUMENT_HEAD_CSS}
${DOCUMENT_PARTIES_CSS}
@page{size:A4;margin:10mm}
*{box-sizing:border-box}
html,body{margin:0;background:#eef1f6;color:#233252;font:11px/1.4 Arial,sans-serif}
.sheet{width:210mm;min-height:277mm;margin:8mm auto;background:#fff;padding:10mm 11mm 12mm}
.sheet h2{margin:5mm 0 2.5mm;background:#405fae;color:#fff;font-size:10px;letter-spacing:.5px;text-transform:uppercase;padding:2.2mm 3mm}
.remit{margin:0 0 3mm;padding:2.5mm 3mm;background:#fff8d8;border-left:4px solid #ffdb62;font-size:10px}
.meta{display:flex;justify-content:space-between;gap:4mm;margin:-1mm 0 3mm;font-size:10px;color:#52617d}
.meta b{color:#27427f}
.types{display:grid;grid-template-columns:1fr 1fr;gap:1.6mm;margin:0 0 3mm}
.types span{display:flex;gap:2mm;align-items:center;border:1px solid #d5dce8;border-radius:2mm;padding:1.8mm 2.2mm;color:#7d8798;font-size:9.5px}
.types span.on{background:#405fae;border-color:#405fae;color:#fff;font-weight:700}
.types i{width:3.2mm;height:3.2mm;border:1px solid currentColor;border-radius:50%;display:inline-block;flex:none}
.types span.on i{background:#ffdb62;border-color:#ffdb62}
.identity{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2mm;margin:0 0 2mm}
.identity div,.eq{border:1px solid #d5dce8;border-radius:2mm;padding:2mm 2.4mm;background:#f8f9fc}
.identity small,.eq small{display:block;font-size:8px;letter-spacing:.3px;text-transform:uppercase;color:#52617d;font-weight:700}
.identity b{font-size:12px;color:#1f2d4f}
.eq{margin:0 0 2mm;display:flex;justify-content:space-between;gap:4mm;align-items:center}
.eq p{margin:0;color:#52617d}
.eq strong{color:#27427f;font-size:14px;white-space:nowrap}
.eq.on{background:#eef3ff;border-color:#c5d2ea}
.eq.off{opacity:.55}
.note{margin:0 0 2mm;font-size:9px;color:#52617d}
.rule{margin:0 0 2mm;font-size:10px}
.stamp{display:inline-block;margin-top:1mm;padding:1.4mm 3mm;border-radius:99px;font-size:10px;font-weight:800;letter-spacing:.2px}
.stamp.ok{background:#e5f6ec;color:#1f7a4d}
.stamp.bad{background:#fde8e8;color:#8d2a2a}
.stamp.wait{background:#fff4d6;color:#8a5a00}
.attest{margin-top:4mm;border:1px solid #ffdb62;background:#fffdf4;border-radius:2mm;padding:3mm}
.attest b{display:block;margin-bottom:1.5mm;color:#27427f}
.attest p{margin:.8mm 0 .8mm 4mm}
.legal{margin-top:4mm;border-top:1px solid #d7dce6;padding-top:2mm;font-size:8px;color:#7d8798}
@media print{
  html,body{background:#fff}
  .sheet{margin:0;box-shadow:none}
  .sheet,.document-head,.document-parties,.types span.on,.eq.on,.remit,.attest,.stamp{print-color-adjust:exact;-webkit-print-color-adjust:exact}
}
`;

function field(label, value) {
  return `<div><small>${safe(label)}</small><b>${safe(value)}</b></div>`;
}

function equation(formula, result, { on = true } = {}) {
  return `<div class="eq${on ? " on" : " off"}"><p>${formula}</p><strong>${result}</strong></div>`;
}

export function buildSizingPrintHtml(input = {}, { company = DEFAULT_COMPANY, number = "", logoData = "/mkl-energies.png" } = {}) {
  const form = input;
  const computed = computeSizingNote(form);
  const companyName = companyDisplayName(company);
  const address = [form.address, form.addressComplement, [form.postalCode, form.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const beneficiary = [form.lastName, form.firstName].filter(Boolean).join(" ") || form.client || "";
  const parties = documentPartiesHtml(company, {
    name: beneficiary || form.client || "Bénéficiaire",
    contact: [form.firstName, form.lastName].filter(Boolean).join(" "),
    address,
    phone: form.phone || "",
    email: form.email || "",
    clientNumber: form.clientNumberLabel || "",
    title: "Bénéficiaire",
  });
  const date = form.noteDate
    ? new Date(`${form.noteDate}T12:00:00`).toLocaleDateString("fr-FR")
    : "—";
  const types = EQUIPMENT_TYPES.map(item => {
    const on = item.id === form.equipmentType;
    return `<span class="${on ? "on" : ""}"><i></i>${safe(item.label)} – ${safe(item.code)}</span>`;
  }).join("");
  const volumeFormula = `${blank(computed.surface, 2)} m² × ${blank(computed.height, 2)} m`;
  const baseDelta = `${blank(computed.indoor, 1)} − ${blank(computed.outdoor, 1)}`;
  const stopDelta = computed.stop == null
    ? `${blank(computed.indoor, 1)} − —`
    : `${blank(computed.indoor, 1)} − ${blank(computed.stop, 1)}`;
  const lossFormula = `${blank(computed.volume, 2)} m³ × ${blank(computed.coefficient, 2)} W/m³.°C × ${blank(computed.deltaT, 1)} °C`;
  const powerFormula = `(${blank(computed.pacPowerW, 0)} W × 100) / ${blank(computed.lossesW, 0)} W`;
  const energyFormula = `(${blank(computed.pacEnergyKwh, 1)} kWh × 100) / ${blank(computed.annualNeedsKwh, 1)} kWh`;
  const stamp = `<span class="stamp ${computed.verdict.tone}">${safe(computed.verdict.label)}</span>`;
  const powerPlace = computed.usesStop ? "à T° d’arrêt" : "à T° base";
  let coverage = "";
  if (computed.family === "pac") {
    coverage = `
      <h2>Pour les PAC air/eau, eau/eau ou sol/eau</h2>
      <p class="rule">La pompe à chaleur (PAC) doit couvrir entre 60% et 130% des déperditions thermiques du logement.</p>
      <div class="identity">
        ${field(`Puissance installée ${powerPlace}`, `${blank(computed.pacPowerW, 0)} W`)}
        ${field(`Température d’eau ${powerPlace}`, form.waterTemp === "" || form.waterTemp == null ? "—" : `${blank(form.waterTemp, 0)} °C`)}
        ${field("Bi-zone", computed.biZone ? "OUI" : "NON")}
        ${computed.biZone ? field("2ᵉ température d’eau", form.waterTemp2 === "" || form.waterTemp2 == null ? "—" : `${blank(form.waterTemp2, 0)} °C`) : ""}
      </div>
      ${equation(`Taux de couverture = ${powerFormula}`, computed.coverage == null ? "—" : `${blank(computed.coverage, 1)} %`)}
      ${stamp}
    `;
  } else if (computed.family === "hybrid") {
    coverage = `
      <h2>Pour les PAC hybrides</h2>
      <p class="rule">Le taux de couverture hors appoint, rapport entre l’énergie fournie par la PAC hors appoint et les besoins annuels de chaleur, doit représenter au moins 70 %. La chaudière gaz ne démarre que lorsque la demande dépasse 70 %. La PAC doit couvrir entre 40 % et 80 % des déperditions.</p>
      <div class="identity">
        ${field("Énergie PAC hors appoint", `${blank(computed.pacEnergyKwh, 1)} kWh`)}
        ${field("Besoins annuels de chaleur", `${blank(computed.annualNeedsKwh, 1)} kWh`)}
        ${field("Puissance sans appoint à 0 °C / 50 °C", `${blank(computed.pacPowerW, 0)} W`)}
        ${field("Module de régulation", form.regulationModule || "—")}
      </div>
      ${equation(`Taux hors appoint = ${energyFormula}`, computed.energyCoverage == null ? "—" : `${blank(computed.energyCoverage, 1)} %`)}
      ${equation(`Taux de puissance = ${powerFormula}`, computed.coverage == null ? "—" : `${blank(computed.coverage, 1)} %`)}
      ${stamp}
    `;
  } else if (computed.family === "biomass") {
    coverage = `<h2>Chaudière Biomasse – BAR TH 113</h2><p class="rule">Les déperditions estimées du logement servent au dimensionnement de la chaudière.</p>${stamp}`;
  }
  if (!coverage) coverage = stamp;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${safe(number || "Note de dimensionnement")}</title><style>${SIZING_PRINT_CSS}</style></head><body>${documentPreviewBarHtml(number || "Note de dimensionnement")}<main class="sheet">
    <div class="document-head"><img src="${logoData}" alt="${safe(companyName)}"><div><span>${safe(companyName)}</span><h1>Note de dimensionnement</h1><p>${safe(number || "Nouvelle note")}</p></div></div>
    <p class="remit">${safe(SIZING_REMIT_SENTENCE)}</p>
    <div class="meta"><span>Date : <b>${safe(date)}</b></span><span>${safe(computed.equipmentLabel || "Type de matériel à choisir")}</span></div>
    ${parties}
    <h2>Equipement installé</h2>
    <div class="types">${types}</div>
    <div class="identity">
      ${field("Marque", form.brand || "—")}
      ${field("Modèle / réf. produit", form.model || "—")}
      ${computed.family === "biomass" ? "" : field("Température d’arrêt de la PAC", computed.stop == null ? "—" : `${blank(computed.stop, 1)} °C`)}
    </div>
    <h2>Calcul des déperditions du logement</h2>
    ${equation(`Surface chauffée × hauteur sous plafond = volume à chauffer · ${volumeFormula}`, `${blank(computed.volume, 2)} m³`)}
    ${equation(`Delta T = T° de consigne intérieur – T° extérieure de base = ${baseDelta}`, computed.deltaT == null || computed.usesStop ? "non retenu" : `${blank(computed.deltaT, 1)} °C`, { on: computed.deltaT != null && !computed.usesStop })}
    <p class="note">Ou :</p>
    ${equation(`Delta T = T° de consigne intérieur – T° arrêt de la PAC (si arrêt de la PAC &gt; T° extérieure de base) = ${stopDelta}`, computed.usesStop ? `${blank(computed.deltaT, 1)} °C` : "—", { on: computed.usesStop })}
    <div class="identity">
      ${field("Température de consigne intérieure", `${blank(computed.indoor, 1)} °C`)}
      ${field("Température extérieure de base", `${blank(computed.outdoor, 1)} °C`)}
      ${field("Coefficient de déperdition", `${blank(computed.coefficient, 2)} W/m³.°C`)}
    </div>
    ${equation(`Déperditions = ${lossFormula}`, `${blank(computed.lossesW, 0)} W · ${blank(computed.lossesKw, 2)} kW`)}
    <p class="note">${safe(SIZING_ROOMS_SENTENCE)}</p>
    ${coverage}
    <section class="attest"><b>${safe(SIZING_ATTESTATION_INTRO)}</b>${SIZING_ATTESTATIONS.map(line => `<p>${safe(line)}</p>`).join("")}</section>
    <p class="legal">Document établi par ${safe(companyName)}. Volume = surface × hauteur. Delta T = consigne − base, ou consigne − arrêt PAC si l’arrêt est supérieur à la base. Déperditions (W) = volume × coefficient × Delta T. Taux PAC = puissance × 100 / déperditions (60 % à 130 %). Hybride : énergie hors appoint × 100 / besoins annuels (≥ 70 %) et puissance × 100 / déperditions (40 % à 80 %).${number ? ` Référence ${safe(number)}.` : ""}</p>
  </main></body></html>`;
}

async function loadLogoData() {
  try {
    const blob = await fetch("/mkl-energies.png").then(response => response.blob());
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return "/mkl-energies.png";
  }
}

export async function openSizingPrintWindow({
  form,
  company,
  number,
  autoPrint = false,
  toast,
  filename,
} = {}) {
  const logoData = typeof window === "undefined" ? "/mkl-energies.png" : await loadLogoData();
  const html = buildSizingPrintHtml(form, { company, number, logoData });
  return openHtmlPreview(html, {
    title: number || "Note de dimensionnement",
    filename: filename || documentPdfFilename({
      kind: "Note de dimensionnement",
      title: number || form?.number,
      source: form,
    }),
    toast,
    autoPrint,
  });
}
