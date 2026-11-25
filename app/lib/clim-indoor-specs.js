import { taxonomyNamesEqual } from "./article-taxonomy.js";

export const CLIM_INDOOR_FIELDS = [
  { key: "coolingNominal", label: "Puissance frigorifique nominale", placeholder: "Ex. 2,5 kW" },
  { key: "heatingNominal", label: "Puissance calorifique nominale", placeholder: "Ex. 3,2 kW" },
  { key: "soundPower", label: "Puissance sonore (Froid)", placeholder: "Ex. 54 dB(A)" },
  { key: "soundPressure", label: "Pression sonore (U.S / Min / Med / Max)", placeholder: "Ex. 21 / 25 / 32 / 41 dB(A)" },
  { key: "airflow", label: "Débit d'air max (Froid / Chaud)", placeholder: "Ex. 540 / 570 m³/h" },
  { key: "dimensions", label: "Dimensions (H x L x P)", placeholder: "Ex. 293 × 798 × 230 mm" },
  { key: "weight", label: "Poids net", placeholder: "Ex. 9 kg" },
  { key: "color", label: "Couleur", placeholder: "Ex. Blanc" },
  { key: "refrigerant", label: "Gaz réfrigérant", placeholder: "Ex. R32" },
  { key: "liquidGasDiameter", label: "Diamètre liquide / gaz", placeholder: "Ex. 1/4\" / 3/8\"" },
  { key: "condensateDiameter", label: "Diamètre condensats", placeholder: "Ex. 16 mm" },
  { key: "connectivity", label: "Connectivité", placeholder: "Ex. Wi-Fi, IR" },
  { key: "seer", label: "SEER (Efficacité Froid)", placeholder: "Ex. 8,5" },
  { key: "scop", label: "SCOP (Efficacité Chaud)", placeholder: "Ex. 4,6" },
  { key: "pipeDiameters", label: "Diamètres des liaisons", placeholder: "Ex. 1/4\" – 3/8\"" },
];

export const CLIM_INDOOR_FIELD_GROUPS = [
  { title: "Puissances et efficacité", keys: ["coolingNominal", "heatingNominal", "seer", "scop"] },
  { title: "Acoustique et air", keys: ["soundPower", "soundPressure", "airflow"] },
  { title: "Dimensions et finition", keys: ["dimensions", "weight", "color"] },
  { title: "Réfrigérant et raccordements", keys: ["refrigerant", "liquidGasDiameter", "condensateDiameter", "pipeDiameters", "connectivity"] },
];

const FIELD_BY_KEY = Object.fromEntries(CLIM_INDOOR_FIELDS.map(field => [field.key, field]));

const INDOOR_ALIASES = [
  "Unités intérieures",
  "Unité intérieure",
  "Unites interieures",
  "Unite interieure",
  "UI",
];

const CONSOLE_ALIASES = [
  "Console basse",
  "Console",
];

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´’]/g, "'")
    .replace(/\s+/g, " ");
}

export function isClimConsoleName(name) {
  if (CONSOLE_ALIASES.some(alias => taxonomyNamesEqual(name, alias))) return true;
  const normalized = normalizeName(name);
  return Boolean(normalized) && normalized.includes("console");
}

function isIndoorUnitName(name) {
  if (INDOOR_ALIASES.some(alias => taxonomyNamesEqual(name, alias))) return true;
  if (isClimConsoleName(name)) return true;
  const normalized = normalizeName(name);
  return /^unites? interieures?$/.test(normalized) || normalized === "ui";
}

export function isClimIndoorPath({ category, subcategory, sourceReference, accessory } = {}) {
  const kind = String(sourceReference || "")
    .trim()
    .toLowerCase();
  if (accessory || kind === "picker:fourniture" || kind === "picker:installation") return false;
  const accessoryName = normalizeName(subcategory);
  if (accessoryName === "fourniture" || accessoryName === "fournitures" || accessoryName === "installation" || accessoryName === "pose") {
    return false;
  }
  if (!isIndoorUnitName(subcategory)) return false;
  if (!category) return true;
  const family = normalizeName(category);
  return !family || family === "climatisation" || family.startsWith("climatis");
}

export function climIndoorHeading(subcategory) {
  return isClimConsoleName(subcategory) ? "CONSOLE BASSE" : "UNITÉ INTÉRIEURE";
}

export function emptyClimIndoorSpecs() {
  return Object.fromEntries(CLIM_INDOOR_FIELDS.map(field => [field.key, ""]));
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

export function isClimIndoorSpecText(text) {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  const first = normalizeName(raw.split("\n").find(line => line.trim()) || "");
  if (first === "unite interieure" || first === "console basse") return true;
  if (/^UNITÉ INTÉRIEURE|^CONSOLE BASSE/im.test(raw)) return true;
  return CLIM_INDOOR_FIELDS.filter(field => raw.split("\n").some(line => lineValueAfterLabel(line, field.label) !== null)).length >= 2;
}

export function parseClimIndoorDescription(text) {
  const specs = { ...emptyClimIndoorSpecs(), brand: "", matched: 0 };
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const heading = normalizeName(trimmed);
    if (heading === "unite interieure" || heading === "console basse") continue;
    const brandValue = lineValueAfterLabel(line, "Marque");
    if (brandValue !== null) {
      specs.brand = brandValue;
      specs.matched += 1;
      continue;
    }
    const field = CLIM_INDOOR_FIELDS.find(item => lineValueAfterLabel(line, item.label) !== null);
    if (!field) continue;
    specs[field.key] = lineValueAfterLabel(line, field.label);
    specs.matched += 1;
  }
  return specs;
}

export function formatClimIndoorDescription(specs = {}, { brand, title, subcategory } = {}) {
  const values = { ...emptyClimIndoorSpecs(), ...specs };
  const lines = [];
  const heading = String(title || "").trim();
  if (heading) lines.push(heading, "");
  lines.push(climIndoorHeading(subcategory), "");
  const marque = String(brand || specs.brand || "").trim();
  if (marque) lines.push(`Marque : ${marque}`);
  for (const field of CLIM_INDOOR_FIELDS) {
    const value = String(values[field.key] || "").trim();
    if (!value) continue;
    lines.push(`${field.label} : ${value}`);
  }
  return lines.join("\n").trim();
}

export function climIndoorField(key) {
  return FIELD_BY_KEY[key] || null;
}
