import { taxonomyNamesEqual } from "./article-taxonomy.js";

export const OPTIMIZER_FIELDS = [
  { key: "model", label: "Modèle", placeholder: "Ex. SUN2000-600W-P" },
  { key: "ratedInputPower", label: "Puissance d’entrée DC nominale", placeholder: "Ex. 600 W" },
  { key: "maxInputVoltage", label: "Tension d’entrée maximale absolue", placeholder: "Ex. 80 V" },
  { key: "mpptVoltageRange", label: "Plage de tension MPPT", placeholder: "Ex. 10 – 80 V" },
  { key: "maxIsc", label: "Courant de court-circuit maximal (Isc)", placeholder: "Ex. 14,5 A" },
  { key: "efficiencyMax", label: "Efficacité maximale", placeholder: "Ex. 99,5 %" },
  { key: "efficiencyWeighted", label: "Efficacité pondérée", placeholder: "Ex. 99,0 %" },
  { key: "overvoltageCategory", label: "Catégorie de surtension", placeholder: "Ex. II" },
  { key: "maxOutputVoltage", label: "Tension de sortie maximale", placeholder: "Ex. 80 V" },
  { key: "maxOutputCurrent", label: "Courant de sortie maximal", placeholder: "Ex. 15 A" },
  { key: "outputBypass", label: "Bypass de sortie", placeholder: "Ex. Oui" },
  { key: "shutdownVoltage", label: "Tension de sortie à l’arrêt", placeholder: "Ex. 0 V" },
  { key: "shutdownImpedance", label: "Impédance de sortie à l’arrêt", placeholder: "Ex. 1 kΩ ± 10 %" },
  { key: "communication", label: "Communication", placeholder: "Ex. MBUS" },
  { key: "safety", label: "Sécurité", placeholder: "Ex. IEC 62109-1 (sécurité classe II)" },
  { key: "rohs", label: "RoHS", placeholder: "Ex. Oui" },
  { key: "dimensions", label: "Dimensions (L × H × P)", placeholder: "Ex. 75 × 140 × 28 mm" },
  { key: "weight", label: "Poids (câbles inclus)", placeholder: "Ex. 0,6 kg" },
  { key: "installationPart", label: "Pièce d’installation", placeholder: "Ex. Équerre de fixation sur cadre / boulon en T" },
  { key: "inputConnector", label: "Connecteur d’entrée", placeholder: "Ex. MC4" },
  { key: "inputWireLength", label: "Longueur de câble d’entrée", placeholder: "Ex. 0,15 m" },
  { key: "outputConnector", label: "Connecteur de sortie", placeholder: "Ex. MC4" },
  { key: "outputWireLength", label: "Longueur de câble de sortie", placeholder: "Ex. 1,3 m" },
  { key: "operatingClimate", label: "Température et humidité de fonctionnement", placeholder: "Ex. –40 °C à 85 °C / 0 % à 100 % HR" },
  { key: "ipRating", label: "Indice de protection", placeholder: "Ex. IP68" },
  { key: "compatibleProducts", label: "Produits compatibles", placeholder: "Ex. SUN2000-2/3/3.68/4/4.6/5/6KTL-L1" },
];

export const OPTIMIZER_FIELD_GROUPS = [
  { title: "Modèle", keys: ["model"] },
  { title: "Entrée", keys: ["ratedInputPower", "maxInputVoltage", "mpptVoltageRange", "maxIsc", "efficiencyMax", "efficiencyWeighted", "overvoltageCategory"] },
  { title: "Sortie", keys: ["maxOutputVoltage", "maxOutputCurrent", "outputBypass", "shutdownVoltage", "shutdownImpedance"] },
  { title: "Communication", keys: ["communication"] },
  { title: "Conformité", keys: ["safety", "rohs"] },
  { title: "Données générales", keys: ["dimensions", "weight", "installationPart", "inputConnector", "inputWireLength", "outputConnector", "outputWireLength", "operatingClimate", "ipRating", "compatibleProducts"] },
];

/** Valeurs de la colonne SUN2000-600W-P, soulignée en vert sur la fiche Huawei. */
export const OPTIMIZER_600W_SPECS = {
  model: "SUN2000-600W-P",
  ratedInputPower: "600 W",
  maxInputVoltage: "80 V",
  mpptVoltageRange: "10 – 80 V",
  maxIsc: "14,5 A",
  efficiencyMax: "99,5 %",
  efficiencyWeighted: "99,0 %",
  overvoltageCategory: "II",
  maxOutputVoltage: "80 V",
  maxOutputCurrent: "15 A",
  outputBypass: "Oui",
  shutdownVoltage: "0 V",
  shutdownImpedance: "1 kΩ ± 10 %",
  communication: "MBUS",
  safety: "IEC 62109-1 (sécurité classe II)",
  rohs: "Oui",
  dimensions: "75 × 140 × 28 mm (3,0 × 5,5 × 1,1 in)",
  weight: "0,6 kg (1,3 lb)",
  installationPart: "Équerre de fixation sur cadre / boulon en T",
  inputConnector: "MC4",
  inputWireLength: "0,15 m",
  outputConnector: "MC4",
  outputWireLength: "1,3 m (4,3 ft)",
  operatingClimate: "–40 °C à 85 °C / 0 % à 100 % HR",
  ipRating: "IP68",
  compatibleProducts: "SUN2000-2/3/3.68/4/4.6/5/6KTL-L1, SUN2000-3/4/5/6/8/10KTL-M1, SUN2000-12/15/17/20KTL-M2, SUN2000-30/36/40KTL-M3",
};

export const OPTIMIZER_HEADING = "OPTIMISEUR";

const FIELD_BY_KEY = Object.fromEntries(OPTIMIZER_FIELDS.map(field => [field.key, field]));
const FIELDS_BY_LABEL_LENGTH = [...OPTIMIZER_FIELDS].sort((left, right) => right.label.length - left.label.length);

const OPTIMIZER_ALIASES = ["Optimiseur", "Optimiseurs", "Optimiseur photovoltaïque"];

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´’]/g, "'")
    .replace(/\s+/g, " ");
}

function isOptimizerName(name) {
  if (OPTIMIZER_ALIASES.some(alias => taxonomyNamesEqual(name, alias))) return true;
  return /optimis/.test(normalizeName(name));
}

export function isOptimizerPath({ category, subcategory, sourceReference, accessory } = {}) {
  const kind = String(sourceReference || "")
    .trim()
    .toLowerCase();
  if (accessory || kind === "picker:fourniture" || kind === "picker:installation") return false;
  if (!isOptimizerName(subcategory)) return false;
  if (!category) return true;
  const family = normalizeName(category);
  return !family || family === "photovoltaique" || family.startsWith("photovolta");
}

export function emptyOptimizerSpecs() {
  return Object.fromEntries(OPTIMIZER_FIELDS.map(field => [field.key, ""]));
}

export function optimizer600wSpecs() {
  return { ...emptyOptimizerSpecs(), ...OPTIMIZER_600W_SPECS };
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

export function isOptimizerSpecText(text) {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  const first = normalizeName(raw.split("\n").find(line => line.trim()) || "");
  if (first === "optimiseur" || first === "optimiseurs") return true;
  if (/^OPTIMISEUR/im.test(raw)) return true;
  return OPTIMIZER_FIELDS.filter(field => raw.split("\n").some(line => lineValueAfterLabel(line, field.label) !== null)).length >= 2;
}

export function parseOptimizerDescription(text) {
  const specs = { ...emptyOptimizerSpecs(), brand: "", matched: 0 };
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (normalizeName(trimmed) === "optimiseur" || normalizeName(trimmed) === "optimiseurs") continue;
    const brandValue = lineValueAfterLabel(line, "Marque");
    if (brandValue !== null) {
      specs.brand = brandValue;
      specs.matched += 1;
      continue;
    }
    const field = fieldForLine(line);
    if (!field) continue;
    specs[field.key] = lineValueAfterLabel(line, field.label);
    specs.matched += 1;
  }
  return specs;
}

export function formatOptimizerDescription(specs = {}, { brand, title } = {}) {
  const values = { ...emptyOptimizerSpecs(), ...specs };
  const lines = [];
  const heading = String(title || "").trim();
  if (heading) lines.push(heading, "");
  lines.push(OPTIMIZER_HEADING, "");
  const marque = String(brand || specs.brand || "").trim();
  if (marque) lines.push(`Marque : ${marque}`);
  for (const field of OPTIMIZER_FIELDS) {
    const value = String(values[field.key] || "").trim();
    if (!value) continue;
    lines.push(`${field.label} : ${value}`);
  }
  return lines.join("\n").trim();
}

export function optimizerField(key) {
  return FIELD_BY_KEY[key] || null;
}
