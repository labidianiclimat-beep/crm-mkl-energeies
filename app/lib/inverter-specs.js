import { taxonomyNamesEqual } from "./article-taxonomy.js";
import { isMicroInverterPath } from "./micro-inverter-specs.js";

export const INVERTER_FIELDS = [
  { key: "efficiencyMax", label: "Efficacité maximale", placeholder: "Ex. 97,8 %" },
  { key: "efficiencyEu", label: "Efficacité pondérée européenne", placeholder: "Ex. 97,1 %" },
  { key: "recommendedPvPower", label: "Puissance PV maximale recommandée", placeholder: "Ex. 7 500 Wp" },
  { key: "maxInputVoltage", label: "Tension d’entrée maximale", placeholder: "Ex. 600 V" },
  { key: "startVoltage", label: "Tension de démarrage", placeholder: "Ex. 50 V" },
  { key: "mpptVoltageRange", label: "Plage de tension MPPT", placeholder: "Ex. 40–560 V" },
  { key: "ratedInputVoltage", label: "Tension d’entrée nominale", placeholder: "Ex. 360 V" },
  { key: "maxInputCurrentPerMppt", label: "Courant d’entrée max. par MPPT", placeholder: "Ex. 16 A" },
  { key: "maxShortCircuitCurrent", label: "Courant de court-circuit maximal", placeholder: "Ex. 20 A" },
  { key: "mpptCount", label: "Nombre de trackers MPP", placeholder: "Ex. 2" },
  { key: "inputsPerMppt", label: "Entrées max. par tracker MPP", placeholder: "Ex. 1" },
  { key: "compatibleBattery", label: "Batterie compatible", placeholder: "Ex. Batterie haute tension compatible" },
  { key: "batteryVoltageRange", label: "Plage de tension de fonctionnement (batterie)", placeholder: "Ex. 350–560 Vdc" },
  { key: "batteryMaxCurrent", label: "Courant de fonctionnement maximal (batterie)", placeholder: "Ex. 16,5 A" },
  { key: "maxChargePower", label: "Puissance de charge maximale", placeholder: "Ex. 6 000 W" },
  { key: "maxDischargePower", label: "Puissance de décharge maximale", placeholder: "Ex. 5 500 W" },
  { key: "gridConnection", label: "Raccordement réseau", placeholder: "Ex. Monophasé" },
  { key: "ratedOutputPower", label: "Puissance de sortie nominale", placeholder: "Ex. 5 000 W" },
  { key: "maxApparentPower", label: "Puissance apparente maximale", placeholder: "Ex. 5 500 VA" },
  { key: "ratedOutputVoltage", label: "Tension de sortie nominale", placeholder: "Ex. 220 / 230 / 240 V AC" },
  { key: "gridFrequency", label: "Fréquence nominale du réseau", placeholder: "Ex. 50 Hz / 60 Hz" },
  { key: "maxOutputCurrent", label: "Courant de sortie maximal", placeholder: "Ex. 25 A" },
  { key: "powerFactorRange", label: "Facteur de puissance réglable", placeholder: "Ex. 0,8 capacitif … 0,8 inductif" },
  { key: "thd", label: "Distorsion harmonique totale maximale", placeholder: "Ex. ≤ 3 %" },
  { key: "backupOutput", label: "Sortie de secours", placeholder: "Ex. Oui (via coffret backup)" },
  { key: "antiIslanding", label: "Protection anti-îlotage", placeholder: "Ex. Oui" },
  { key: "dcReversePolarity", label: "Protection inversion de polarité DC", placeholder: "Ex. Oui" },
  { key: "insulationMonitoring", label: "Surveillance de l’isolation", placeholder: "Ex. Oui" },
  { key: "dcSurgeProtection", label: "Protection parafoudre DC", placeholder: "Ex. Oui, type II (EN/IEC 61643-11)" },
  { key: "acSurgeProtection", label: "Protection parafoudre AC", placeholder: "Ex. Oui, type II (EN/IEC 61643-11)" },
  { key: "residualCurrent", label: "Surveillance du courant résiduel", placeholder: "Ex. Oui" },
  { key: "acOvercurrent", label: "Protection contre les surintensités AC", placeholder: "Ex. Oui" },
  { key: "acShortCircuit", label: "Protection court-circuit AC", placeholder: "Ex. Oui" },
  { key: "acOvervoltage", label: "Protection contre les surtensions AC", placeholder: "Ex. Oui" },
  { key: "arcFault", label: "Protection contre les défauts d’arc", placeholder: "Ex. Oui" },
  { key: "batteryChargeFromGrid", label: "Charge batterie depuis le réseau", placeholder: "Ex. Oui" },
  { key: "operatingTemp", label: "Plage de température de fonctionnement", placeholder: "Ex. –25 °C à +60 °C" },
  { key: "humidity", label: "Humidité relative de fonctionnement", placeholder: "Ex. 0 %–100 % HR" },
  { key: "altitude", label: "Altitude de fonctionnement", placeholder: "Ex. 0–4 000 m (dérate au-delà de 2 000 m)" },
  { key: "cooling", label: "Refroidissement", placeholder: "Ex. Convection naturelle" },
  { key: "display", label: "Affichage", placeholder: "Ex. Voyants LED ; application constructeur" },
  { key: "communication", label: "Communication", placeholder: "Ex. RS485, WLAN intégré ; Ethernet / 4G optionnels" },
  { key: "weight", label: "Poids (avec supports de montage)", placeholder: "Ex. < 15 kg" },
  { key: "dimensions", label: "Dimensions (avec plaque de montage)", placeholder: "Ex. 425 × 376,5 × 150 mm" },
  { key: "ipRating", label: "Indice IP", placeholder: "Ex. IP66" },
  { key: "nightConsumption", label: "Consommation nocturne", placeholder: "Ex. < 3 W" },
  { key: "optimizerCompatibility", label: "Compatibilité optimiseurs", placeholder: "Ex. Oui (bus DC)" },
  { key: "safety", label: "Sécurité", placeholder: "Ex. EN/IEC 62109-1, EN/IEC 62109-2" },
  { key: "gridStandards", label: "Normes de raccordement réseau", placeholder: "Ex. EN 50549-1, VDE-AR-N-4105, UTE C15-712" },
];

export const INVERTER_FIELD_GROUPS = [
  { title: "Efficacité", keys: ["efficiencyMax", "efficiencyEu"] },
  { title: "Entrée (PV)", keys: ["recommendedPvPower", "maxInputVoltage", "startVoltage", "mpptVoltageRange", "ratedInputVoltage", "maxInputCurrentPerMppt", "maxShortCircuitCurrent", "mpptCount", "inputsPerMppt"] },
  { title: "Entrée (batterie DC)", keys: ["compatibleBattery", "batteryVoltageRange", "batteryMaxCurrent", "maxChargePower", "maxDischargePower"] },
  { title: "Sortie (réseau)", keys: ["gridConnection", "ratedOutputPower", "maxApparentPower", "ratedOutputVoltage", "gridFrequency", "maxOutputCurrent", "powerFactorRange", "thd", "backupOutput"] },
  { title: "Protections", keys: ["antiIslanding", "dcReversePolarity", "insulationMonitoring", "dcSurgeProtection", "acSurgeProtection", "residualCurrent", "acOvercurrent", "acShortCircuit", "acOvervoltage", "arcFault", "batteryChargeFromGrid"] },
  { title: "Caractéristiques générales", keys: ["operatingTemp", "humidity", "altitude", "cooling", "display", "communication", "weight", "dimensions", "ipRating", "nightConsumption", "optimizerCompatibility"] },
  { title: "Normes", keys: ["safety", "gridStandards"] },
];

export const INVERTER_HEADING = "ONDULEUR";

const FIELD_BY_KEY = Object.fromEntries(INVERTER_FIELDS.map(field => [field.key, field]));
const FIELDS_BY_LABEL_LENGTH = [...INVERTER_FIELDS].sort((left, right) => right.label.length - left.label.length);

const INVERTER_ALIASES = ["Onduleurs", "Onduleur"];

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´’]/g, "'")
    .replace(/\s+/g, " ");
}

function isInverterName(name) {
  if (INVERTER_ALIASES.some(alias => taxonomyNamesEqual(name, alias))) return true;
  const normalized = normalizeName(name);
  return normalized === "onduleur" || normalized === "onduleurs";
}

export function isInverterPath({ category, subcategory, sourceReference, accessory } = {}) {
  const kind = String(sourceReference || "")
    .trim()
    .toLowerCase();
  if (accessory || kind === "picker:fourniture" || kind === "picker:installation") return false;
  if (isMicroInverterPath({ category, subcategory, sourceReference, accessory })) return false;
  if (!isInverterName(subcategory)) return false;
  if (!category) return true;
  const family = normalizeName(category);
  return !family || family === "photovoltaique" || family.startsWith("photovolta");
}

export function emptyInverterSpecs() {
  return Object.fromEntries(INVERTER_FIELDS.map(field => [field.key, ""]));
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

export function isInverterSpecText(text) {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  const first = normalizeName(raw.split("\n").find(line => line.trim()) || "");
  if (first === "onduleur" || first === "onduleurs") return true;
  if (/^ONDULEUR/im.test(raw) && !/^MICRO-ONDULEUR/im.test(raw.split("\n").find(line => line.trim()) || "")) return true;
  return INVERTER_FIELDS.filter(field => raw.split("\n").some(line => lineValueAfterLabel(line, field.label) !== null)).length >= 2;
}

export function parseInverterDescription(text) {
  const specs = { ...emptyInverterSpecs(), matched: 0 };
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (normalizeName(trimmed) === "onduleur" || normalizeName(trimmed) === "onduleurs") continue;
    const field = fieldForLine(line);
    if (!field) continue;
    specs[field.key] = lineValueAfterLabel(line, field.label);
    specs.matched += 1;
  }
  return specs;
}

export function formatInverterDescription(specs = {}, { title } = {}) {
  const values = { ...emptyInverterSpecs(), ...specs };
  const lines = [];
  const heading = String(title || "").trim();
  if (heading) lines.push(heading, "");
  lines.push(INVERTER_HEADING, "");
  for (const field of INVERTER_FIELDS) {
    const value = String(values[field.key] || "").trim();
    if (!value) continue;
    lines.push(`${field.label} : ${value}`);
  }
  return lines.join("\n").trim();
}

export function inverterField(key) {
  return FIELD_BY_KEY[key] || null;
}
