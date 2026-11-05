import { taxonomyNamesEqual } from "./article-taxonomy.js";

export const BATTERY_FIELDS = [
  { key: "coupling", label: "Type de couplage", placeholder: "Ex. AC / DC" },
  { key: "operatingModes", label: "Types de fonctionnement", placeholder: "Ex. Sur réseau, hors réseau, PV existant" },
  { key: "cellTechnology", label: "Technologie des cellules", placeholder: "Ex. Lithium fer phosphate (LiFePO4)" },
  { key: "ratedBatteryVoltage", label: "Tension nominale batterie", placeholder: "Ex. 51,2 V (16S)" },
  { key: "dod", label: "Profondeur de décharge (DoD)", placeholder: "Ex. 90 % / 100 %" },
  { key: "lifeCycles", label: "Cycles de vie", placeholder: "Ex. > 6 000 (25 °C)" },
  { key: "ratedCapacity", label: "Capacité nominale", placeholder: "Ex. 5,12 kWh" },
  { key: "moduleEnergy", label: "Énergie du module batterie", placeholder: "Ex. 5 kWh" },
  { key: "usableEnergy", label: "Énergie disponible", placeholder: "Ex. 5 kWh" },
  { key: "batteryModuleCount", label: "Nombre de modules batterie", placeholder: "Ex. 1" },
  { key: "powerModuleCount", label: "Nombre de modules de puissance", placeholder: "Ex. 1" },
  { key: "scalability", label: "Évolutivité", placeholder: "Ex. 5 à 30 kWh, 2 systèmes en parallèle" },
  { key: "ratedInputPower", label: "Puissance d’entrée nominale", placeholder: "Ex. 2,5 kVA" },
  { key: "ratedOutputPower", label: "Puissance de sortie nominale", placeholder: "Ex. 2,5 kVA" },
  { key: "maxOutputPower", label: "Puissance de sortie maximale", placeholder: "Ex. 2,5 kW" },
  { key: "peakOutputPower", label: "Puissance de sortie crête", placeholder: "Ex. 3,5 kW, 10 s" },
  { key: "ratedOutputCurrent", label: "Courant de sortie nominale", placeholder: "Ex. 10,9 A" },
  { key: "efficiencyMax", label: "Efficacité max. batterie-AC", placeholder: "Ex. > 93,5 %" },
  { key: "operatingPhase", label: "Phase de fonctionnement", placeholder: "Ex. L / N / PE" },
  { key: "gridVoltage", label: "Tension nominale du réseau", placeholder: "Ex. 230 V" },
  { key: "gridVoltageRange", label: "Plage de tension du réseau", placeholder: "Ex. 187–253 V" },
  { key: "gridFrequency", label: "Fréquence nominale du réseau", placeholder: "Ex. 50 Hz" },
  { key: "powerFactor", label: "Facteur de puissance", placeholder: "Ex. > 0,99 (0,8 capacitif … 0,8 inductif)" },
  { key: "thdi", label: "Distorsion harmonique (THDi)", placeholder: "Ex. < 3 %" },
  { key: "nominalVoltageMono", label: "Tension nominale (système monophasé)", placeholder: "Ex. 450 V" },
  { key: "voltageRangeMono", label: "Plage de tension (système monophasé)", placeholder: "Ex. 350–560 V" },
  { key: "nominalVoltageTri", label: "Tension nominale (système triphasé)", placeholder: "Ex. 600 V" },
  { key: "voltageRangeTri", label: "Plage de tension (système triphasé)", placeholder: "Ex. 600–980 V" },
  { key: "backupRatedPower", label: "Puissance de sortie nominale (secours)", placeholder: "Ex. 2,5 kVA" },
  { key: "backupPeakPower", label: "Puissance apparente max. (secours)", placeholder: "Ex. 3,5 kVA, 10 s" },
  { key: "backupVoltage", label: "Tension de sortie nominale (secours)", placeholder: "Ex. 230 V" },
  { key: "backupCurrent", label: "Courant de sortie nominale (secours)", placeholder: "Ex. 10,9 A" },
  { key: "backupFrequency", label: "Fréquence de sortie (secours)", placeholder: "Ex. 50 Hz" },
  { key: "thdu", label: "Distorsion harmonique (THDu)", placeholder: "Ex. < 3 %" },
  { key: "backupConnection", label: "Raccordement secours", placeholder: "Ex. Prise 3 trous" },
  { key: "gridAcConnection", label: "Raccordement AC réseau", placeholder: "Ex. Prise 16 A" },
  { key: "protectionClass", label: "Classe de protection", placeholder: "Ex. I" },
  { key: "surgeCategory", label: "Catégorie de surtension", placeholder: "Ex. DC II / AC III" },
  { key: "isolationType", label: "Type d’isolation", placeholder: "Ex. Isolé" },
  { key: "dimensions", label: "Dimensions", placeholder: "Ex. 480 × 153 × 624 mm" },
  { key: "weight", label: "Poids", placeholder: "Ex. 60 ± 0,5 kg" },
  { key: "powerModuleDimensions", label: "Dimensions module de puissance", placeholder: "Ex. 670 × 150 × 240 mm" },
  { key: "powerModuleWeight", label: "Poids module de puissance", placeholder: "Ex. 12 kg" },
  { key: "batteryModuleDimensions", label: "Dimensions module batterie", placeholder: "Ex. 670 × 150 × 360 mm" },
  { key: "batteryModuleWeight", label: "Poids module batterie", placeholder: "Ex. 50 kg" },
  { key: "installation", label: "Installation", placeholder: "Ex. Sol (standard), mural (optionnel)" },
  { key: "operatingTemp", label: "Température de fonctionnement", placeholder: "Ex. –20 °C à +55 °C" },
  { key: "storageTemp", label: "Température de stockage", placeholder: "Ex. –30 °C à +85 °C" },
  { key: "humidity", label: "Humidité relative", placeholder: "Ex. 0–95 %" },
  { key: "altitude", label: "Altitude de fonctionnement", placeholder: "Ex. 2 000 m (dérate au-delà)" },
  { key: "environment", label: "Environnement", placeholder: "Ex. Intérieur / Extérieur" },
  { key: "cooling", label: "Refroidissement", placeholder: "Ex. Convection naturelle" },
  { key: "ipRating", label: "Indice IP", placeholder: "Ex. IP65 / IP66" },
  { key: "noise", label: "Niveau sonore", placeholder: "Ex. < 29 dB" },
  { key: "display", label: "Affichage", placeholder: "Ex. LED, indicateur de charge" },
  { key: "communication", label: "Communication", placeholder: "Ex. LAN / Wi-Fi / RS485 / CAN" },
  { key: "compatibleMeter", label: "Compteur compatible", placeholder: "Ex. Compteur d’énergie / TC" },
  { key: "compatibleInverters", label: "Onduleurs compatibles", placeholder: "Ex. Tout type, ou résidentiels mono et tri" },
  { key: "plugAndPlay", label: "Plug & play", placeholder: "Ex. Oui" },
  { key: "gridStandards", label: "Normes de raccordement réseau", placeholder: "Ex. EN 50549-1, VDE-AR-N-4105, CEI 0-21" },
  { key: "emc", label: "Réglementation / CEM", placeholder: "Ex. IEC 62040, IEC 62477" },
  { key: "certifications", label: "Certifications", placeholder: "Ex. CE, IEC 62619, UN38.3, VDE 2510-50" },
  { key: "warranty", label: "Garantie", placeholder: "Ex. 10 ans" },
];

export const BATTERY_FIELD_GROUPS = [
  { title: "Batterie", keys: ["coupling", "operatingModes", "cellTechnology", "ratedBatteryVoltage", "dod", "lifeCycles"] },
  { title: "Énergie et puissance", keys: ["ratedCapacity", "moduleEnergy", "usableEnergy", "batteryModuleCount", "powerModuleCount", "scalability", "ratedInputPower", "ratedOutputPower", "maxOutputPower", "peakOutputPower", "ratedOutputCurrent", "efficiencyMax"] },
  { title: "Réseau", keys: ["operatingPhase", "gridVoltage", "gridVoltageRange", "gridFrequency", "powerFactor", "thdi", "nominalVoltageMono", "voltageRangeMono", "nominalVoltageTri", "voltageRangeTri"] },
  { title: "Secours", keys: ["backupRatedPower", "backupPeakPower", "backupVoltage", "backupCurrent", "backupFrequency", "thdu", "backupConnection", "gridAcConnection"] },
  { title: "Protections", keys: ["protectionClass", "surgeCategory", "isolationType"] },
  { title: "Mécanique et environnement", keys: ["dimensions", "weight", "powerModuleDimensions", "powerModuleWeight", "batteryModuleDimensions", "batteryModuleWeight", "installation", "operatingTemp", "storageTemp", "humidity", "altitude", "environment", "cooling", "ipRating", "noise"] },
  { title: "Communication et compatibilité", keys: ["display", "communication", "compatibleMeter", "compatibleInverters", "plugAndPlay"] },
  { title: "Normes et garantie", keys: ["gridStandards", "emc", "certifications", "warranty"] },
];

export const BATTERY_HEADING = "BATTERIE";

const FIELD_BY_KEY = Object.fromEntries(BATTERY_FIELDS.map(field => [field.key, field]));
const FIELDS_BY_LABEL_LENGTH = [...BATTERY_FIELDS].sort((left, right) => right.label.length - left.label.length);

const BATTERY_ALIASES = ["Batteries", "Batterie", "Stockage"];

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´’]/g, "'")
    .replace(/\s+/g, " ");
}

function isBatteryName(name) {
  if (BATTERY_ALIASES.some(alias => taxonomyNamesEqual(name, alias))) return true;
  const normalized = normalizeName(name);
  return normalized === "batterie"
    || normalized === "batteries"
    || normalized === "stockage"
    || normalized === "stockage photovoltaique";
}

export function isBatteryPath({ category, subcategory, sourceReference, accessory } = {}) {
  const kind = String(sourceReference || "")
    .trim()
    .toLowerCase();
  if (accessory || kind === "picker:fourniture" || kind === "picker:installation") return false;
  if (!isBatteryName(subcategory)) return false;
  if (!category) return true;
  const family = normalizeName(category);
  return !family || family === "photovoltaique" || family.startsWith("photovolta");
}

export function emptyBatterySpecs() {
  return Object.fromEntries(BATTERY_FIELDS.map(field => [field.key, ""]));
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

export function isBatterySpecText(text) {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  const first = normalizeName(raw.split("\n").find(line => line.trim()) || "");
  if (first === "batterie" || first === "batteries") return true;
  if (/^BATTERIE\b/im.test(raw)) return true;
  return BATTERY_FIELDS.filter(field => raw.split("\n").some(line => lineValueAfterLabel(line, field.label) !== null)).length >= 2;
}

export function parseBatteryDescription(text) {
  const specs = { ...emptyBatterySpecs(), matched: 0 };
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (normalizeName(trimmed) === "batterie" || normalizeName(trimmed) === "batteries") continue;
    const field = fieldForLine(line);
    if (!field) continue;
    specs[field.key] = lineValueAfterLabel(line, field.label);
    specs.matched += 1;
  }
  return specs;
}

export function formatBatteryDescription(specs = {}, { title } = {}) {
  const values = { ...emptyBatterySpecs(), ...specs };
  const lines = [];
  const heading = String(title || "").trim();
  if (heading) lines.push(heading, "");
  lines.push(BATTERY_HEADING, "");
  for (const field of BATTERY_FIELDS) {
    const value = String(values[field.key] || "").trim();
    if (!value) continue;
    lines.push(`${field.label} : ${value}`);
  }
  return lines.join("\n").trim();
}

export function batteryField(key) {
  return FIELD_BY_KEY[key] || null;
}
