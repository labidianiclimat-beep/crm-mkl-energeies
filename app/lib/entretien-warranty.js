import { companyDisplayName, companyEmitterLines, DEFAULT_COMPANY } from "./company.js";

export const WARRANTY_YEAR_CHOICES = [2, 5, 10];
export const DEFAULT_WARRANTY_YEARS = 5;

const STOP = /\[\[arret:(\d{4}-\d{2}-\d{2})\|(annule|refus)\|([^|]*)\|(\d+)\|(garantie|hors)\]\]/;

function isoDay(value) {
  const day = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

function frDate(iso) {
  const day = isoDay(iso);
  if (!day) return "";
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

export function addWarrantyYears(day, years) {
  const date = new Date(`${isoDay(day)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setFullYear(date.getFullYear() + Number(years || 0));
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const datePart = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${datePart}`;
}

export function warrantyYears(value) {
  const years = Number(value);
  return WARRANTY_YEAR_CHOICES.includes(years) ? years : 0;
}

export function warrantyDecision({ installedOn, years = DEFAULT_WARRANTY_YEARS, today } = {}) {
  const start = isoDay(installedOn);
  const span = warrantyYears(years);
  const day = isoDay(today);
  if (!start || !span || !day) {
    return { ready: false, covered: false, installedOn: start, years: span || DEFAULT_WARRANTY_YEARS, endsOn: "" };
  }
  const endsOn = addWarrantyYears(start, span);
  return {
    ready: true,
    covered: Boolean(endsOn && endsOn >= day),
    installedOn: start,
    years: span,
    endsOn,
  };
}

export function equipmentHint(notes) {
  return String(notes || "")
    .replace(/\n?\[\[[^\]]+\]\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function readMaintenanceStop(notes) {
  const match = String(notes || "").match(STOP);
  if (!match) return null;
  return {
    day: match[1],
    reason: match[2],
    installedOn: isoDay(match[3]),
    years: Number(match[4]),
    covered: match[5] === "garantie",
  };
}

export function writeMaintenanceStop(notes, { day, reason, installedOn, years, covered } = {}) {
  const cleaned = String(notes || "")
    .replace(/\n?\[\[rappel:\d{4}-\d{2}-\d{2}\]\]/g, "")
    .replace(/\n?\[\[arret:[^\]]+\]\]/g, "")
    .trim();
  const iso = isoDay(day);
  const why = reason === "annule" ? "annule" : "refus";
  if (!iso) return cleaned;
  const marker = `[[arret:${iso}|${why}|${isoDay(installedOn)}|${warrantyYears(years) || DEFAULT_WARRANTY_YEARS}|${covered ? "garantie" : "hors"}]]`;
  return `${cleaned}${cleaned ? "\n" : ""}${marker}`;
}

export function stopLabel(reason) {
  return reason === "annule" ? "Contrat annulé" : "Ne veut plus d’entretien";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function warrantyWaiverLetterHtml({
  company = DEFAULT_COMPANY,
  clientName,
  clientAddress,
  installedOn,
  endsOn,
  years,
  equipment,
  reason,
  today,
} = {}) {
  const name = companyDisplayName(company);
  const legal = companyEmitterLines(company);
  const motive = reason === "annule"
    ? "vous nous avez indiqué avoir annulé votre contrat d’entretien"
    : "vous nous avez indiqué ne plus souhaiter faire entretenir votre matériel";
  const gear = String(equipment || "").trim() || "le matériel installé à l’adresse ci-dessus";
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Renonciation à la garantie</title>
<style>
@page{size:A4;margin:0}
body{margin:0;background:#fff;color:#152347;font:13px "DM Sans",Arial,sans-serif}
.sheet{width:210mm;min-height:297mm;padding:16mm 18mm;box-sizing:border-box}
.head{background:#405fae;color:#fff;padding:8mm 8mm 7mm;border-bottom:6px solid #ffcc00}
.head span{display:block;font-size:10px;letter-spacing:1.4px;text-transform:uppercase}
.head b{display:block;margin-top:2mm;font:700 22px Manrope,Arial}
.head p{margin:2mm 0 0;font-size:11px;color:#e1e8fb}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin:8mm 0}
.party{border:1px solid #d7deea;border-radius:3mm;padding:4mm;min-height:28mm}
.party.is-client{border-color:#e8c200;background:#fffdf4}
.party span{display:block;color:#405fae;font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase}
.party b{display:block;margin:2mm 0;font-size:15px}
.party p{margin:0;color:#3d4a63;line-height:1.4}
.date{text-align:right;margin:0 0 6mm}
h1{margin:0 0 6mm;font:700 18px Manrope,Arial;color:#405fae}
p{line-height:1.5;margin:0 0 4mm}
.gear{border-left:4px solid #ffcc00;padding:3mm 4mm;background:#fffdf4}
.sign{margin-top:12mm}
.sign b{display:block}
</style></head><body><main class="sheet">
<header class="head"><span>Courrier</span><b>${escapeHtml(name)}</b><p>${legal.map(escapeHtml).join(" · ") || "Entretien et maintenance"}</p></header>
<div class="parties">
  <section class="party"><span>Émetteur</span><b>${escapeHtml(name)}</b><p>${legal.map(escapeHtml).join("<br>") || "MKL Énergies"}</p></section>
  <section class="party is-client"><span>Destinataire</span><b>${escapeHtml(clientName || "Client")}</b><p>${escapeHtml(clientAddress || "Adresse à compléter")}</p></section>
</div>
<p class="date">${escapeHtml(frDate(today))}</p>
<h1>Renonciation à la garantie du matériel</h1>
<p>Madame, Monsieur,</p>
<p>Par le présent courrier, nous actons que ${motive}.</p>
<p>Le matériel a été installé le ${escapeHtml(frDate(installedOn))}. La garantie contractuelle de ${escapeHtml(String(years))} ans court jusqu’au ${escapeHtml(frDate(endsOn))}.</p>
<p>Cette garantie est liée à l’entretien du matériel. Le matériel n’étant plus entretenu, ${escapeHtml(name)} renonce à la garantie contractuelle de ce matériel, à compter de ce jour.</p>
<p class="gear"><b>Matériel concerné</b><br>${escapeHtml(gear)}</p>
<p>Nous vous prions d’agréer, Madame, Monsieur, l’expression de nos salutations distinguées.</p>
<p class="sign">${escapeHtml(name)}<b>Service entretien</b></p>
</main></body></html>`;
}
