import { taxonomyNamesEqual } from "./article-taxonomy.js";

export const CLIM_OUTDOOR_FIELDS = [
  { key: "coolingNominal", label: "Puissance frigorifique nominale", placeholder: "Ex. 5,0 kW" },
  { key: "coolingRange", label: "Plage de puissance frigorifique", placeholder: "Ex. 1,5 / 6,2 kW" },
  { key: "heatingNominal", label: "Puissance calorifique nominale", placeholder: "Ex. 5,6 kW" },
  { key: "heatingRange", label: "Plage de puissance calorifique", placeholder: "Ex. 1,4 / 7,0 kW" },
  { key: "absorbedPower", label: "Puissance absorbée nominale (Froid / Chaud)", placeholder: "Ex. 1,35 / 1,42 kW" },
  { key: "eerCop", label: "EER / COP", placeholder: "Ex. 3,70 / 3,94" },
  { key: "soundPower", label: "Puissance sonore groupe extérieur (Froid / Chaud)", placeholder: "Ex. 62 / 63 dB(A)" },
  { key: "soundPressure", label: "Pression sonore groupe extérieur (Froid / Chaud)", placeholder: "Ex. 48 / 49 dB(A)" },
  { key: "airflow", label: "Débit d'air groupe extérieur max (Froid / Chaud)", placeholder: "Ex. 2160 / 1980 m³/h" },
  { key: "dimensions", label: "Dimensions groupe extérieur (H x L x P)", placeholder: "Ex. 550 × 780 × 290 mm" },
  { key: "weight", label: "Poids net groupe extérieur", placeholder: "Ex. 36 kg" },
  { key: "refrigerant", label: "Réfrigérant", placeholder: "Ex. R32" },
  { key: "refrigerantCharge", label: "Charge de réfrigérant", placeholder: "Ex. 1,10 kg" },
  { key: "gwp", label: "GWP", placeholder: "Ex. 675" },
  { key: "co2Equivalent", label: "Équivalent CO₂", placeholder: "Ex. 0,74 t" },
  { key: "pipeDiameter", label: "Diamètre liaison frigorifique (Liquide / Gaz)", placeholder: "Ex. 1/4\" / 3/8\"" },
  { key: "indoorCount", label: "Nombre d'unités intérieures raccordables", placeholder: "Ex. 2" },
  { key: "indoorCapacity", label: "Capacité totale des unités intérieures raccordables", placeholder: "Ex. 2,0 à 8,5 kW" },
  { key: "maxPipeLength", label: "Longueur maximale de liaison frigorifique", placeholder: "Ex. 30 m" },
  { key: "maxHeightDiff", label: "Dénivelé maximum", placeholder: "Ex. 15 m" },
  { key: "coolingOperatingRange", label: "Plage de fonctionnement en froid", placeholder: "Ex. -10 °C / +46 °C" },
  { key: "heatingOperatingRange", label: "Plage de fonctionnement en chaud", placeholder: "Ex. -15 °C / +24 °C" },
  { key: "powerSupply", label: "Alimentation électrique", placeholder: "Ex. 230 V monophasé" },
  { key: "maxCurrent", label: "Intensité maximale", placeholder: "Ex. 10,2 A" },
];

export const CLIM_OUTDOOR_FIELD_GROUPS = [
  { title: "Puissances", keys: ["coolingNominal", "coolingRange", "heatingNominal", "heatingRange", "absorbedPower", "eerCop"] },
  { title: "Acoustique et air", keys: ["soundPower", "soundPressure", "airflow"] },
  { title: "Dimensions", keys: ["dimensions", "weight"] },
  { title: "Réfrigérant et liaisons", keys: ["refrigerant", "refrigerantCharge", "gwp", "co2Equivalent", "pipeDiameter"] },
  { title: "Unités intérieures raccordables", keys: ["indoorCount", "indoorCapacity", "maxPipeLength", "maxHeightDiff"] },
  { title: "Fonctionnement", keys: ["coolingOperatingRange", "heatingOperatingRange", "powerSupply", "maxCurrent"] },
];

export const CLIM_OUTDOOR_HEADING = "GROUPE EXTÉRIEUR";

const FIELD_BY_KEY = Object.fromEntries(CLIM_OUTDOOR_FIELDS.map(field => [field.key, field]));

const OUTDOOR_ALIASES = [
  "Bi-split",
  "Bisplit",
  "Bi split",
  "B-split",
  "B split",
  "Tri-split",
  "Trisplit",
  "Tri split",
  "Quadri-split",
  "Quadrisplit",
  "Quadri split",
  "5 unités",
  "5 unites",
  "Cinq unités",
  "Cinq unites",
  "Penta-split",
  "Pentasplit",
  "Penta split",
  "5 sorties",
  "Cinq sorties",
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

function isOutdoorSplitName(name) {
  if (OUTDOOR_ALIASES.some(alias => taxonomyNamesEqual(name, alias))) return true;
  const normalized = normalizeName(name);
  return /^(bi|b|tri|quadri|penta)[-\s]?split$/.test(normalized)
    || /^(5|cinq)[-\s]?(unites?|sorties)$/.test(normalized);
}

export function isClimOutdoorPath({ category, subcategory, sourceReference, accessory } = {}) {
  const kind = String(sourceReference || "")
    .trim()
    .toLowerCase();
  if (accessory || kind === "picker:fourniture" || kind === "picker:installation") return false;
  const accessoryName = normalizeName(subcategory);
  if (accessoryName === "fourniture" || accessoryName === "fournitures" || accessoryName === "installation" || accessoryName === "pose") {
    return false;
  }
  if (!isOutdoorSplitName(subcategory)) return false;
  if (!category) return true;
  const family = normalizeName(category);
  return !family || family === "climatisation" || family.startsWith("climatis");
}

export function emptyClimOutdoorSpecs() {
  return Object.fromEntries(CLIM_OUTDOOR_FIELDS.map(field => [field.key, ""]));
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

export function isClimOutdoorSpecText(text) {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  if (/groupe exterieur/i.test(normalizeName(raw.split("\n")[0] || "")) || /^GROUPE EXTÉRIEUR/im.test(raw)) {
    return true;
  }
  return CLIM_OUTDOOR_FIELDS.filter(field => raw.split("\n").some(line => lineValueAfterLabel(line, field.label) !== null)).length >= 2;
}

export function parseClimOutdoorDescription(text) {
  const specs = { ...emptyClimOutdoorSpecs(), brand: "", matched: 0 };
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (normalizeName(trimmed) === "groupe exterieur") continue;
    const brandValue = lineValueAfterLabel(line, "Marque");
    if (brandValue !== null) {
      specs.brand = brandValue;
      specs.matched += 1;
      continue;
    }
    const field = CLIM_OUTDOOR_FIELDS.find(item => lineValueAfterLabel(line, item.label) !== null);
    if (!field) continue;
    specs[field.key] = lineValueAfterLabel(line, field.label);
    specs.matched += 1;
  }
  return specs;
}

export function formatClimOutdoorDescription(specs = {}, { brand, title } = {}) {
  const values = { ...emptyClimOutdoorSpecs(), ...specs };
  const lines = [];
  const heading = String(title || "").trim();
  if (heading) lines.push(heading, "");
  lines.push(CLIM_OUTDOOR_HEADING, "");
  const marque = String(brand || specs.brand || "").trim();
  if (marque) lines.push(`Marque : ${marque}`);
  for (const field of CLIM_OUTDOOR_FIELDS) {
    const value = String(values[field.key] || "").trim();
    if (!value) continue;
    lines.push(`${field.label} : ${value}`);
  }
  return lines.join("\n").trim();
}

export function climOutdoorField(key) {
  return FIELD_BY_KEY[key] || null;
}
