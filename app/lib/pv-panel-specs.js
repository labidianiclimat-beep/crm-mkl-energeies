import { taxonomyNamesEqual } from "./article-taxonomy.js";

export const PV_PANEL_FIELDS = [
  { key: "cellType", label: "Type de cellule", placeholder: "Ex. Type N mono-cristallin, 120 (6×20)" },
  { key: "moduleType", label: "Type de module", placeholder: "Ex. Bifacial bi-verre" },
  { key: "dimensions", label: "Dimensions", placeholder: "Ex. 1950 × 1134 × 30 mm" },
  { key: "weight", label: "Poids", placeholder: "Ex. 26,8 kg" },
  { key: "frontGlass", label: "Face avant", placeholder: "Ex. 2,0 mm verre durci antireflet" },
  { key: "backGlass", label: "Face arrière", placeholder: "Ex. 2,0 mm verre durci" },
  { key: "junctionBox", label: "Boîte de jonction", placeholder: "Ex. 3 diodes, IP68 (IEC 62790)" },
  { key: "cables", label: "Câbles", placeholder: "Ex. 4 mm²" },
  { key: "connector", label: "Type de connecteur", placeholder: "Ex. MC4 (1000 V) / MC4-EVO 2 (1500 V)" },
  { key: "pmaxStc", label: "Puissance maximale (Pmax) STC", placeholder: "Ex. 500 W" },
  { key: "impStc", label: "Courant de puissance maximale (Imp) STC", placeholder: "Ex. 13,30 A" },
  { key: "vmpStc", label: "Tension de puissance maximale (Vmp) STC", placeholder: "Ex. 37,66 V" },
  { key: "iscStc", label: "Courant de court-circuit (Isc) STC", placeholder: "Ex. 14,22 A" },
  { key: "vocStc", label: "Tension en circuit ouvert (Voc) STC", placeholder: "Ex. 44,70 V" },
  { key: "efficiencyStc", label: "Rendement du module STC", placeholder: "Ex. 22,8 %" },
  { key: "pmaxNmot", label: "Puissance maximale (Pmax) NMOT", placeholder: "Ex. 376 W" },
  { key: "impNmot", label: "Courant de puissance maximale (Imp) NMOT", placeholder: "Ex. 10,69 A" },
  { key: "vmpNmot", label: "Tension de puissance maximale (Vmp) NMOT", placeholder: "Ex. 35,22 V" },
  { key: "iscNmot", label: "Courant de court-circuit (Isc) NMOT", placeholder: "Ex. 11,52 A" },
  { key: "vocNmot", label: "Tension en circuit ouvert (Voc) NMOT", placeholder: "Ex. 42,09 V" },
  { key: "pmaxBnpi", label: "Puissance maximale (Pmax) BNPI", placeholder: "Ex. 553 W" },
  { key: "bifaciality", label: "Bifacialité", placeholder: "Ex. 80 ± 5 %" },
  { key: "operatingTemp", label: "Température de fonctionnement", placeholder: "Ex. –40 à +85 °C" },
  { key: "maxSystemVoltage", label: "Tension maximale du système", placeholder: "Ex. 1000 / 1500 V CC (IEC)" },
  { key: "overcurrentProtection", label: "Protection contre les surintensités", placeholder: "Ex. 30 A" },
  { key: "powerTolerance", label: "Tolérance de puissance de sortie", placeholder: "Ex. 0 ~ 3 %" },
  { key: "protectionClass", label: "Classe de protection", placeholder: "Ex. Classe II" },
  { key: "testLoad", label: "Charge d’essai max. (poussée / traction)", placeholder: "Ex. Avant 5400 / Arrière 2400 Pa" },
  { key: "designLoad", label: "Charge de calcul max. (poussée / traction)", placeholder: "Ex. Avant 3600 / Arrière 1600 Pa" },
  { key: "nmot", label: "Température nominale de fonctionnement du module (NMOT)", placeholder: "Ex. 42 ± 2 °C" },
  { key: "tempCoeffPmax", label: "Coefficient de température de Pmax", placeholder: "Ex. –0,29 %/°C" },
  { key: "tempCoeffVoc", label: "Coefficient de température de Voc", placeholder: "Ex. –0,25 %/°C" },
  { key: "tempCoeffIsc", label: "Coefficient de température de Isc", placeholder: "Ex. +0,048 %/°C" },
  { key: "productWarranty", label: "Garantie produit", placeholder: "Ex. 25 ans" },
  { key: "powerWarranty", label: "Garantie de puissance", placeholder: "Ex. 30 ans (linéaire)" },
  { key: "firstYearDegradation", label: "Dégradation la première année", placeholder: "Ex. ≤ 1 %" },
  { key: "annualDegradation", label: "Dégradation annuelle", placeholder: "Ex. ≤ 0,4 %" },
  { key: "certifications", label: "Certifications produit", placeholder: "Ex. IEC 61215, IEC 61730" },
];

export const PV_PANEL_FIELD_GROUPS = [
  { title: "Spécifications du module", keys: ["cellType", "moduleType", "dimensions", "weight", "frontGlass", "backGlass", "junctionBox", "cables", "connector"] },
  { title: "Spécifications électriques (STC)", keys: ["pmaxStc", "impStc", "vmpStc", "iscStc", "vocStc", "efficiencyStc"] },
  { title: "Spécifications électriques (NMOT)", keys: ["pmaxNmot", "impNmot", "vmpNmot", "iscNmot", "vocNmot"] },
  { title: "Bifacial", keys: ["pmaxBnpi", "bifaciality"] },
  { title: "Conditions de fonctionnement", keys: ["operatingTemp", "maxSystemVoltage", "overcurrentProtection", "powerTolerance", "protectionClass", "testLoad", "designLoad"] },
  { title: "Caractéristiques de température", keys: ["nmot", "tempCoeffPmax", "tempCoeffVoc", "tempCoeffIsc"] },
  { title: "Garanties et certifications", keys: ["productWarranty", "powerWarranty", "firstYearDegradation", "annualDegradation", "certifications"] },
];

export const PV_PANEL_HEADING = "PANNEAU";

const FIELD_BY_KEY = Object.fromEntries(PV_PANEL_FIELDS.map(field => [field.key, field]));
const FIELDS_BY_LABEL_LENGTH = [...PV_PANEL_FIELDS].sort((left, right) => right.label.length - left.label.length);

const PANEL_ALIASES = ["Panneaux", "Panneau", "Panneaux photovoltaïques"];
const MODULE_ALIASES = ["Module", "Modules"];

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´’]/g, "'")
    .replace(/\s+/g, " ");
}

function isPanelName(name, { allowModule } = {}) {
  if (PANEL_ALIASES.some(alias => taxonomyNamesEqual(name, alias))) return true;
  if (allowModule && MODULE_ALIASES.some(alias => taxonomyNamesEqual(name, alias))) return true;
  const normalized = normalizeName(name);
  return normalized === "panneau"
    || normalized === "panneaux"
    || normalized === "panneaux photovoltaiques"
    || normalized === "panneau photovoltaique";
}

export function isPvPanelPath({ category, subcategory, sourceReference, accessory } = {}) {
  const kind = String(sourceReference || "")
    .trim()
    .toLowerCase();
  if (accessory || kind === "picker:fourniture" || kind === "picker:installation") return false;
  const family = normalizeName(category);
  const pvFamily = !family || family === "photovoltaique" || family.startsWith("photovolta");
  if (!pvFamily) return false;
  if (!isPanelName(subcategory, { allowModule: true })) return false;
  if (!category) return isPanelName(subcategory, { allowModule: false });
  return true;
}

export function emptyPvPanelSpecs() {
  return Object.fromEntries(PV_PANEL_FIELDS.map(field => [field.key, ""]));
}

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/\s*:\s*$/, "");
}

function lineValueAfterLabel(line, label) {
  const raw = String(line || "").trim();
  const needle = normalizeLabel(label);
  const haystack = normalizeLabel(raw);
  if (haystack === needle) return "";
  if (!haystack.startsWith(needle)) return null;
  const rest = raw.slice(label.length).replace(/^\s*:\s*/, "").trim();
  if (rest.startsWith(":")) return rest.replace(/^:\s*/, "");
  return rest;
}

function fieldForLine(line) {
  return FIELDS_BY_LABEL_LENGTH.find(field => lineValueAfterLabel(line, field.label) !== null) || null;
}

export function isPvPanelSpecText(text) {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  const first = normalizeName(raw.split("\n").find(line => line.trim()) || "");
  if (first === "panneau" || first === "panneaux") return true;
  if (/^PANNEAU\b/im.test(raw)) return true;
  return PV_PANEL_FIELDS.filter(field => raw.split("\n").some(line => lineValueAfterLabel(line, field.label) !== null)).length >= 2;
}

export function parsePvPanelDescription(text) {
  const specs = { ...emptyPvPanelSpecs(), matched: 0 };
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (normalizeName(trimmed) === "panneau" || normalizeName(trimmed) === "panneaux") continue;
    const field = fieldForLine(line);
    if (!field) continue;
    specs[field.key] = lineValueAfterLabel(line, field.label);
    specs.matched += 1;
  }
  return specs;
}

export function formatPvPanelDescription(specs = {}, { title } = {}) {
  const values = { ...emptyPvPanelSpecs(), ...specs };
  const lines = [];
  const heading = String(title || "").trim();
  if (heading) lines.push(heading, "");
  lines.push(PV_PANEL_HEADING, "");
  for (const field of PV_PANEL_FIELDS) {
    const value = String(values[field.key] || "").trim();
    if (!value) continue;
    lines.push(`${field.label} : ${value}`);
  }
  return lines.join("\n").trim();
}

export function pvPanelField(key) {
  return FIELD_BY_KEY[key] || null;
}
