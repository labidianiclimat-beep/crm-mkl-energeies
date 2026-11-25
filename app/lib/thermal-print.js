import {
  companyDisplayName,
  DEFAULT_COMPANY,
  DOCUMENT_HEAD_CSS,
  DOCUMENT_PARTIES_CSS,
  documentPartiesHtml,
} from "./company.js";
import { DOCUMENT_CLOSING_CSS, documentClosingHtml } from "./document-closing.js";
import { DOCUMENT_PREVIEW_BAR_CSS, documentPreviewBarHtml, openHtmlPreview } from "./document-preview.js";
import { documentPdfFilename } from "./record-documents.js";
import {
  ALSACE_DJU,
  G_TABLE,
  SCORE_CRITERIA,
  computeThermalStudy,
  formatThermalMoney,
  formatThermalNumber,
} from "./thermal-study.js";

function safe(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function field(label, value) {
  return `<label><span>${safe(label)}</span><b>${safe(value || "—")}</b></label>`;
}

function gTableLabel(row) {
  if (row.min >= 17.5) return "≥ 17,5";
  if (row.min < 6.5) return "< 6,5";
  return `${String(row.min).replace(".", ",")} à ${String(row.min + 1).replace(".", ",")}`;
}

export const THERMAL_PRINT_CSS = `
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:#eef1f6;font:10px Arial,sans-serif;color:#233252}
${DOCUMENT_PREVIEW_BAR_CSS}
${DOCUMENT_HEAD_CSS}
${DOCUMENT_PARTIES_CSS}
${DOCUMENT_CLOSING_CSS}
.document-head h1{font-size:22px}
.sheet{width:210mm;min-height:297mm;margin:10mm auto;background:#fff;padding:13mm 12mm 18mm;box-shadow:0 8px 30px #22345a20}
.document-parties{margin:0 0 3mm;gap:4mm}
.document-party .thermal-identity{display:grid;grid-template-columns:1fr 1fr;gap:2.5mm;margin:0}
.thermal-identity label,.thermal-metrics label,.thermal-sign>div{display:flex;flex-direction:column;gap:3px}
.thermal-identity span,.thermal-metrics small,.thermal-sign span{font-size:8px;font-weight:700;color:#52617d;text-transform:uppercase}
.thermal-identity b,.thermal-metrics .box,.thermal-sign b,.thermal-value{
  min-height:22px;border:1px solid #bfc9dc;border-radius:5px;padding:6px 8px;background:#fbfcff;font:10px Arial;color:#233252;font-weight:700
}
.thermal-identity label.wide{grid-column:1 / -1}
.thermal-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin:2mm 0 4mm}
.thermal-metrics>div{border:1px solid #c9d3e4;background:#eef3ff;border-radius:6px;padding:7px 9px}
.thermal-metrics>div b{display:block;font-size:16px;color:#27427f;border:0;background:transparent;padding:0;min-height:0}
.thermal-power span{display:block;font-size:8px;color:#5d6b82;font-weight:600;text-transform:none;margin-top:2px}
h2{background:#405fae;color:#fff;text-transform:uppercase;text-align:center;font-size:11px;letter-spacing:.5px;padding:7px;margin:4mm 0 3mm}
.thermal-score-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2mm;margin-bottom:3mm}
.thermal-score-col{border:1px solid #c4cedf;border-radius:6px;overflow:hidden;background:#fff}
.thermal-score-col>b{display:block;background:#405fae;color:#fff;font-size:7px;letter-spacing:.2px;text-align:center;padding:6px 4px;line-height:1.25;min-height:28px}
.thermal-score-col p{display:grid;grid-template-columns:14px 1fr;align-items:center;gap:5px;margin:0;border-top:1px solid #d7deea;padding:5px 6px;font:7px/1.25 Arial;color:#233252}
.thermal-score-col p i{width:14px;height:14px;display:grid;place-items:center;border-radius:3px;background:#eef3ff;color:#27427f;font-style:normal;font-weight:700}
.thermal-score-col p.on{background:#ffdb62}
.thermal-score-col p.on i{background:#27427f;color:#fff}
.thermal-g-table{display:flex;flex-wrap:wrap;gap:2mm;margin:0 0 4mm}
.thermal-g-table span{font-size:7px;border:1px solid #d0d7e4;border-radius:99px;padding:3px 7px;color:#5d6b82}
.thermal-g-table span.on{background:#405fae;border-color:#405fae;color:#fff;font-weight:700}
.thermal-formula{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;background:#eef3ff;border:1px solid #c9d3e4;border-radius:8px;padding:8px 10px;margin-bottom:4mm;font-size:9px;color:#52617d}
.thermal-formula b,.thermal-formula strong{color:#27427f;font-size:13px}
.thermal-formula.compact{margin-bottom:3mm}
.thermal-columns{display:grid;grid-template-columns:1fr 1.15fr;gap:4mm}
.thermal-columns h3{margin:0 0 3mm;background:#405fae;color:#fff;font-size:9px;letter-spacing:.4px;text-transform:uppercase;text-align:center;padding:6px}
.thermal-columns table{width:100%;border-collapse:collapse;font-size:8px}
.thermal-columns th{text-align:left;color:#52617d;border-bottom:1px solid #d5dce8;padding:0 4px 4px}
.thermal-columns td{border-bottom:1px solid #e6ebf3;padding:4px;vertical-align:middle}
.thermal-euro-box{display:flex;align-items:center;justify-content:space-between;min-height:22px;border:1px solid #bfc9dc;border-radius:5px;padding:4px 6px;background:#fbfcff;font-weight:700}
.thermal-euro-box i{font-style:normal;color:#27427f;margin-left:4px}
.thermal-current-total{display:flex;justify-content:space-between;align-items:center;margin-top:3mm;background:#fff8d8;border:1px solid #efd772;border-radius:6px;padding:7px 9px;font-size:9px}
.thermal-sign{display:grid;grid-template-columns:42mm 1fr;gap:8mm;align-items:end;margin-top:5mm}
.thermal-sign img{display:block;width:100%;max-height:38mm;border:1px solid #c4cedf;border-radius:8px;background:#fff}
.thermal-sign .empty{height:38mm;border:1px dashed #c4cedf;border-radius:8px}
.legal{margin-top:5mm;border-top:1px solid #d7dce6;padding-top:4mm;font-size:8px;color:#7d8798;line-height:1.5}
.sheet,.document-head,.document-parties,.document-party,.thermal-score-col,.thermal-formula,.thermal-columns h3,.thermal-g-table span.on,.thermal-metrics>div,.thermal-current-total{
  print-color-adjust:exact;-webkit-print-color-adjust:exact
}
@media print{
  html,body{background:#fff}
  .sheet{margin:0;box-shadow:none}
}
`;

export function buildThermalPrintHtml(input = {}, { company = DEFAULT_COMPANY, number = "", logoData = "/mkl-energies.png" } = {}) {
  const form = input;
  const computed = computeThermalStudy(form);
  const companyName = companyDisplayName(company);
  const address = [form.address, form.addressComplement, [form.postalCode, form.city].filter(Boolean).join(" ")].filter(Boolean).join(" ");
  const parties = documentPartiesHtml(company, {
    name: form.client || [form.lastName, form.firstName].filter(Boolean).join(" "),
    contact: [form.firstName, form.lastName].filter(Boolean).join(" "),
    address,
    phone: form.phone || form.mobile || "",
    email: form.email || "",
    clientNumber: form.clientNumberLabel || "",
    title: "Client / destinataire",
  });
  const scores = SCORE_CRITERIA.map(criterion => {
    const options = criterion.options.map(option => {
      const on = Number(form[criterion.key]) === option.points;
      return `<p class="${on ? "on" : ""}"><i>${option.points}</i><span>${safe(option.label)}</span></p>`;
    }).join("");
    return `<div class="thermal-score-col"><b>${safe(criterion.label)}</b>${options}</div>`;
  }).join("");
  const gChips = G_TABLE.slice().reverse().map(row => {
    const on = computed.g === row.g;
    return `<span class="${on ? "on" : ""}">${gTableLabel(row)} · G = ${formatThermalNumber(row.g)}</span>`;
  }).join("");
  const currentRows = [
    ["EDF option de base", formatThermalNumber(form.edfTariff ?? computed.edfTariff, 3), formatThermalNumber(computed.edfQty, 1), formatThermalMoney(computed.costs.edf)],
    ["Abonnement annuel 9 kVA", formatThermalNumber(form.subscriptionTariff ?? computed.subscriptionTariff, 3), formatThermalNumber(computed.subscriptionQty, 1), formatThermalMoney(computed.costs.subscription)],
    ["Pellets", formatThermalNumber(form.pelletsTariff ?? computed.pelletsTariff, 3), formatThermalNumber(computed.pelletsQty, 1), formatThermalMoney(computed.costs.pellets)],
    ["Propane · 1 kg = 13,8 kWh", formatThermalNumber(form.propaneTariff ?? computed.propaneTariff, 3), formatThermalNumber(computed.propaneQty, 1), formatThermalMoney(computed.costs.propane)],
    ["Fuel · 1 L = 10 kWh", formatThermalNumber(form.fuelTariff ?? computed.fuelTariff, 3), formatThermalNumber(computed.fuelQty, 1), formatThermalMoney(computed.costs.fuel)],
    ["Gaz de ville · 1 m³ = 10,5 kWh", formatThermalNumber(form.gasTariff ?? computed.gasTariff, 3), formatThermalNumber(computed.gasQty, 1), formatThermalMoney(computed.costs.gas)],
  ].map(row => `<tr><td>${row[0]}</td><td><span class="thermal-euro-box">${row[1]}<i>€</i></span></td><td>${row[2]}</td><td><b>${row[3]}</b></td></tr>`).join("");
  const signature = form.signature
    ? `<img src="${form.signature}" alt="Signature client">`
    : `<div class="empty"></div>`;
  const date = form.signatureDate
    ? new Date(`${form.signatureDate}T12:00:00`).toLocaleDateString("fr-FR")
    : "—";

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${safe(number || "Étude thermique")}</title><style>${THERMAL_PRINT_CSS}</style></head><body>${documentPreviewBarHtml(number || "Étude thermique")}<main class="sheet">
    <div class="document-head"><img src="${logoData}" alt="${safe(companyName)}"><div><span>SERVICE COMMERCIAL</span><h1>Étude thermique</h1><p>Calcul des déperditions • Température de confort • Hiver de référence Alsace</p></div></div>
    ${parties}
    <div class="thermal-metrics">
      ${field("Surface chauffée (m²)", formatThermalNumber(computed.surface, 1))}
      ${field("Hauteur (m)", formatThermalNumber(computed.height, 2))}
      <div><small>Volume</small><b>${formatThermalNumber(computed.volume)} m³</b></div>
      ${field("T° intérieure de confort", formatThermalNumber(computed.tIndoor, 1))}
      ${field("T° extérieure de base", formatThermalNumber(computed.tOutdoor, 1))}
      <div><small>Delta T</small><b>${formatThermalNumber(computed.deltaT)} °C</b></div>
      <div><small>Total points</small><b>${computed.points}</b></div>
      <div><small>Coefficient G</small><b>${formatThermalNumber(computed.g)}</b></div>
      <div class="thermal-power"><small>Puissance</small><b>${formatThermalNumber(computed.powerDynamicKw)} kW</b><span>Dynamique ${formatThermalNumber(computed.powerDynamicKw)} kW · Maximale ${formatThermalNumber(computed.powerMaxKw)} kW</span></div>
    </div>
    <h2>Coefficient G d’isolation de la maison</h2>
    <div class="thermal-score-grid">${scores}</div>
    <div class="thermal-g-table">${gChips}</div>
    <h2>Calcul de la quantité d’énergie pour un hiver de référence</h2>
    <div class="thermal-formula"><span>VOLUME</span><b>${formatThermalNumber(computed.volume)}</b><i>×</i><span>G</span><b>${formatThermalNumber(computed.g)}</b><i>×</i><span>D.J.U. (Alsace = ${ALSACE_DJU})</span><b>${formatThermalNumber(computed.dju, 0)}</b><i>×</i><span>0,018</span><i>=</i><strong>${formatThermalNumber(computed.energyKwh, 1)} kWh</strong></div>
    <div class="thermal-columns">
      <section>
        <h3>Avec la pompe à chaleur · énergie de référence</h3>
        <div class="thermal-formula compact"><b>${formatThermalNumber(computed.energyKwh, 1)}</b><i>/</i><span>COP ${formatThermalNumber(computed.cop, 2)}</span><i>=</i><strong>${formatThermalNumber(computed.heatPumpKwh, 1)} kWh</strong></div>
        <table><thead><tr><th></th><th>Tarif</th><th>Quantité</th><th>Total annuel</th></tr></thead><tbody>
          <tr><td>Air / Air</td><td><span class="thermal-euro-box">${formatThermalNumber(computed.airAirTariff, 3)}<i>€</i></span></td><td>${formatThermalNumber(computed.pacQty, 1)}</td><td><b>${formatThermalMoney(computed.costs.airAir)}</b></td></tr>
          <tr><td>Air / Eau</td><td><span class="thermal-euro-box">${formatThermalNumber(computed.airEauTariff, 3)}<i>€</i></span></td><td>${formatThermalNumber(computed.pacQty, 1)}</td><td><b>${formatThermalMoney(computed.costs.airEau)}</b></td></tr>
        </tbody></table>
      </section>
      <section>
        <h3>Situation actuelle</h3>
        <table><thead><tr><th></th><th>Tarif</th><th>Quantité</th><th>Total annuel €</th></tr></thead><tbody>${currentRows}</tbody></table>
        <div class="thermal-current-total"><span>Total situation actuelle</span><b>${formatThermalMoney(computed.currentTotal)}</b></div>
      </section>
    </div>
    ${documentClosingHtml({
      place: safe(form.place || form.city || ""),
      date: safe(date === "—" ? "" : date),
      single: true,
      signatures: `<div><span>Signature du client</span>${signature}</div>`,
    })}
    <p class="legal">Document établi par ${safe(companyName)}. Formules du calcul des déperditions : P (kW) = Volume × G × ΔT / 1000 · Q (kWh) = Volume × G × DJU × 0,018. DJU Alsace = ${ALSACE_DJU}. ${number ? `Référence ${safe(number)}.` : ""}</p>
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

export async function openThermalPrintWindow({
  form,
  company,
  number,
  autoPrint = false,
  toast,
  filename,
} = {}) {
  const logoData = typeof window === "undefined" ? "/mkl-energies.png" : await loadLogoData();
  const html = buildThermalPrintHtml(form, { company, number, logoData });
  return openHtmlPreview(html, {
    title: number || "Étude thermique",
    filename: filename || documentPdfFilename({
      kind: "Étude thermique",
      title: number || form?.number,
      source: form,
    }),
    toast,
    autoPrint,
  });
}
