import { companyDisplayName, DEFAULT_COMPANY, DOCUMENT_HEAD_CSS, DOCUMENT_PARTIES_CSS, documentPartiesHtml } from "./company.js";
import { formatClientNumber } from "./client-number.js";
import { DOCUMENT_CLOSING_CSS, documentClosingHtml } from "./document-closing.js";
import { DOCUMENT_PREVIEW_BAR_CSS, documentPreviewBarHtml, openHtmlPreview } from "./document-preview.js";
import { documentPdfFilename } from "./record-documents.js";
import {
  PV_INCLINATIONS,
  inclinationSlopeSvg,
  PV_ORIENTATIONS,
  computePvSimulation,
  formatPvSimKwh,
  formatPvSimNumber,
} from "./pv-production-simulator.js";

function safe(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function line(value) {
  const text = String(value || "").trim();
  return text ? safe(text) : "&nbsp;";
}

export function buildPvSimulatorPrintHtml(form = {}, { company, number, logoData = "/mkl-energies.png" } = {}) {
  const computed = computePvSimulation(form);
  const companyName = companyDisplayName(company || DEFAULT_COMPANY);
  const clientName = [form.lastName, form.firstName].filter(Boolean).join(" ") || form.client || "";
  const place = form.place || form.city || "";
  const dateLabel = form.signatureDate
    ? new Date(`${form.signatureDate}T12:00:00`).toLocaleDateString("fr-FR")
    : "";
  const cells = PV_ORIENTATIONS.map(orientation => {
    const values = PV_INCLINATIONS.map(inclination => {
      const selected = form.orientation === orientation.id && form.inclination === inclination.id;
      const coefficient = computePvSimulation({ orientation: orientation.id, inclination: inclination.id }).coefficient;
      return `<td class="${selected ? "on" : ""}">${formatPvSimNumber(coefficient)}</td>`;
    }).join("");
    return `<tr><th>${safe(orientation.label)}</th>${values}</tr>`;
  }).join("");
  const heads = PV_INCLINATIONS.map(item => `<th><span>${safe(item.label)}</span>${inclinationSlopeSvg(item.degrees)}</th>`).join("");
  const signature = form.signature
    ? `<img src="${form.signature}" alt="Signature du client">`
    : `<div class="empty"></div>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${safe(number || "Simulateur photovoltaïque")}</title><style>
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:#eef1f6;font:10px Arial,sans-serif;color:#223044}
${DOCUMENT_PREVIEW_BAR_CSS}
${DOCUMENT_HEAD_CSS}
${DOCUMENT_PARTIES_CSS}
${DOCUMENT_CLOSING_CSS}
.sheet{width:210mm;min-height:297mm;margin:8mm auto;background:#fff;padding:12mm 14mm 14mm}
h2{margin:4mm 0 2mm;background:#3160b2;color:#fff;font-size:9px;letter-spacing:.4px;padding:4px 8px;border-radius:4px}
.client p{margin:0 0 2.2mm;min-height:5mm;border-bottom:1px solid #9aa6aa}
.note{margin:1mm 0 3mm;font-size:7.5px;color:#52617d}
table{width:100%;border-collapse:collapse;font-size:8px;margin:1mm 0 2mm}
th,td{border:1px solid #aeb8bb;padding:3px 4px;text-align:center;vertical-align:middle}
th{background:#f4f7f8;vertical-align:bottom}
th span{display:block}
.pvsim-slope{display:block;width:13px;height:13px;margin:1px auto 0}
.pvsim-slope line{stroke:#ffcc00;stroke-width:2.8;stroke-linecap:round}
td.on{background:#fff4c2;font-weight:700;box-shadow:inset 0 0 0 2px #f5c518}
.result{margin:2mm 0;font-size:11px}
.result b{color:#3160b2;font-size:16px}
.sign{display:grid;grid-template-columns:1fr 70mm;gap:8mm;margin-top:6mm;align-items:end}
.sign img{width:100%;max-height:28mm;object-fit:contain;border:1px solid #c4cedf;border-radius:6px;background:#fff}
.sign .empty{height:28mm;border:1px dashed #c4cedf;border-radius:6px}
.foot{margin-top:8mm;font-size:8px;color:#52617d}
</style></head><body>${documentPreviewBarHtml(number || "Simulateur photovoltaïque")}
<main class="sheet">
  <div class="document-head"><img src="${logoData}" alt="${safe(companyName)}"><div><span>SERVICE COMMERCIAL</span><h1>Simulateur de production photovoltaïque</h1><p>Estimation de première année • A × B × C × D</p></div></div>
  ${documentPartiesHtml(company || DEFAULT_COMPANY, {
    name: clientName,
    contact: clientName,
    address: [form.address, form.postalCode, form.city].filter(Boolean).join(" "),
    phone: form.mobile,
    email: form.email,
    clientNumber: formatClientNumber(form.clientNumber),
    title: "Client / destinataire",
  })}
  <h2>ENSOLEILLEMENT</h2>
  <p>Ensoleillement annuel à l’horizontale pris en compte : A = <b>${formatPvSimKwh(form.irradiation)}</b> kWh/m²/an${computed.departmentName ? ` (${safe(computed.departmentName)})` : ""}</p>
  <p class="note">Cette donnée d’ensoleillement est une moyenne départementale issue d’une base de référence utilisée pour l’estimation de la production photovoltaïque.</p>
  <h2>INCLINAISON, ORIENTATION DE LA TOITURE ET MASQUE SOLAIRE</h2>
  <table><thead><tr><th>Orientation</th>${heads}</tr></thead><tbody>${cells}</tbody></table>
  <p class="note">La valeur correspondant à la toiture est entourée. Coefficient inclinaison / orientation : B = <b>${computed.coefficient == null ? "—" : formatPvSimNumber(computed.coefficient)}</b></p>
  <h2>CARACTÉRISTIQUES DE L’INSTALLATION</h2>
  <p>Puissance de l’installation préconisée : C = <b>${formatPvSimNumber(form.powerKwc, 2)}</b> kWc &nbsp;&nbsp; Efficacité de l’installation : D = <b>${computed.efficiency ? formatPvSimNumber(computed.efficiency, 2) : "—"}</b></p>
  <h2>RÉSULTAT DE LA SIMULATION</h2>
  <p class="note">Le résultat ci-dessous prend en compte les paramètres renseignés ci-dessus. Cette estimation est fournie à titre indicatif et ne revêt aucun caractère contractuel.</p>
  <p class="result">Production escomptée en première année : A × B × C × D = E = <b>${formatPvSimKwh(computed.production)} kWh</b></p>
  <p>Prix de vente du surplus d’énergie produite (énergie non autoconsommée) :</p>
  <p>Tarif de référence : <b>${form.surplusTariff ? `${formatPvSimNumber(form.surplusTariff, 4)} €/kWh` : "—"}</b> en première année.</p>
  ${documentClosingHtml({
    place: line(place) === "&nbsp;" ? "" : line(place),
    date: line(dateLabel) === "&nbsp;" ? "" : line(dateLabel),
    single: true,
    signatures: `<div><span>Signature du client</span>${signature}</div>`,
  })}
  <p class="foot"><b>${safe(companyName)}</b><br>Pompes à chaleur · Climatisation · Photovoltaïque · Ballons thermodynamiques · Poêles à bois${number ? `<br>Référence ${safe(number)}.` : ""}</p>
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

export async function openPvSimulatorPrintWindow({
  form,
  company,
  number,
  autoPrint = false,
  toast,
  filename,
} = {}) {
  const logoData = typeof window === "undefined" ? "/mkl-energies.png" : await loadLogoData();
  const html = buildPvSimulatorPrintHtml(form, { company, number, logoData });
  return openHtmlPreview(html, {
    title: number || "Simulateur photovoltaïque",
    filename: filename || documentPdfFilename({
      kind: "Simulateur photovoltaïque",
      title: number || form?.number,
      source: form,
    }),
    toast,
    autoPrint,
  });
}
