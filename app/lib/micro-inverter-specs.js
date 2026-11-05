import { taxonomyNamesEqual } from "./article-taxonomy.js";

export const MICRO_INVERTER_FIELDS = [
  { key: "dcVoltageMinMax", label: "Tension minimale/maximale", placeholder: "Ex. 18/60 V" },
  { key: "startVoltage", label: "Tension d’entrée au démarrage", placeholder: "Ex. 21 V" },
  { key: "nominalInputVoltage", label: "Tension d’entrée nominale", placeholder: "Ex. 36,5 V" },
  { key: "mppVoltage", label: "Tension MPP min./max.", placeholder: "Ex. 28/45 V" },
  { key: "operatingVoltage", label: "Tension de fonctionnement minimale/maximale", placeholder: "Ex. 18/58 V" },
  { key: "maxInputCurrent", label: "Courant d’entrée maximal", placeholder: "Ex. 16 A" },
  { key: "maxIsc", label: "Courant d’entrée DC maximum en court-circuit", placeholder: "Ex. 25 A" },
  { key: "maxInputPower", label: "Puissance d’entrée maximale", placeholder: "Ex. 600 W" },
  { key: "reverseCurrent", label: "Courant inverse maximale de l’onduleur", placeholder: "Ex. 0 A" },
  { key: "maxApparentPower", label: "Puissance apparente maximale", placeholder: "Ex. 427 VA" },
  { key: "nominalPower", label: "Puissance nominale", placeholder: "Ex. 427 W" },
  { key: "gridVoltage", label: "Tension nominale du réseau", placeholder: "Ex. 230 V" },
  { key: "gridVoltageRange", label: "Tension minimale/maximale du réseau", placeholder: "Ex. 184/276 V" },
  { key: "maxOutputCurrent", label: "Courant de sortie maximal", placeholder: "Ex. 1,86 A" },
  { key: "frequency", label: "Fréquence nominale", placeholder: "Ex. 50 Hz" },
  { key: "frequencyRange", label: "Fréquence minimale/maximale", placeholder: "Ex. 45/55 Hz" },
  { key: "maxUnitsPerCircuit", label: "Nombre maximal d’unités par circuit 20 A (mono/tri)", placeholder: "Ex. 8 (L+N)/24 (3L+N)" },
  { key: "maxUnitsPerCable", label: "Unités maximales par section de IQ Cable (mono/tri)", placeholder: "Ex. 7 (L+N)/15 (3L+N)" },
  { key: "protectionClass", label: "Classe de protection", placeholder: "Ex. II" },
  { key: "thd", label: "Distorsion harmonique totale", placeholder: "Ex. <3 %" },
  { key: "powerFactor", label: "Réglage du facteur de puissance", placeholder: "Ex. 1,0" },
  { key: "powerFactorRange", label: "Gamme de facteurs de puissance", placeholder: "Ex. 0,8 capacitif … 0,8 inductif" },
  { key: "efficiencyMax", label: "Efficacité maximale de l’onduleur", placeholder: "Ex. 97,95 %" },
  { key: "efficiencyEu", label: "Efficacité pondérée européenne", placeholder: "Ex. 97,44 %" },
  { key: "maxFaultCurrent", label: "Courant maximal de défaut en sortie", placeholder: "Ex. 2,32 A" },
  { key: "topology", label: "Topologie de l’onduleur", placeholder: "Ex. Isolé (transformateur HF)" },
  { key: "nightConsumption", label: "Perte d’énergie pendant la nuit", placeholder: "Ex. 40 mW" },
  { key: "ambientTemp", label: "Plage de température de l’air ambiant", placeholder: "Ex. –40 °C à 65 °C" },
  { key: "humidity", label: "Plage d’humidité relative", placeholder: "Ex. 4 à 100 % (condensation)" },
  { key: "dvcClass", label: "Classe de tension déterminante (DVC)", placeholder: "Ex. AC : DVC C | DC : DVC B" },
  { key: "dcConnectorPairs", label: "Connecteurs DC d’entrée (paires) par traqueur MPP", placeholder: "Ex. 1" },
  { key: "acConnector", label: "Type de connecteur AC", placeholder: "Ex. IQ Cabling" },
  { key: "dcConnector", label: "Type de connecteur DC", placeholder: "Ex. MC4 Stäubli" },
  { key: "dimensions", label: "Dimensions (H × L × P)", placeholder: "Ex. 214 × 176 × 30,8 mm" },
  { key: "weight", label: "Poids (avec plaque de montage)", placeholder: "Ex. 1,1 kg" },
  { key: "cooling", label: "Refroidissement", placeholder: "Ex. Convection naturelle – sans ventilateur" },
  { key: "enclosure", label: "Boîtier", placeholder: "Ex. Polymère, double isolation classe II" },
  { key: "ipRating", label: "Indice IP", placeholder: "Ex. Extérieur – IP67" },
  { key: "wetEnvironments", label: "Convient aux environnements humides", placeholder: "Ex. Oui" },
  { key: "altitude", label: "Altitude", placeholder: "Ex. < 3 000 m" },
  { key: "soundLevel", label: "Niveau sonore", placeholder: "Ex. < 25 dB(A)" },
  { key: "surgeCategory", label: "Catégorie de surtension AC", placeholder: "Ex. III" },
  { key: "gridCompliance", label: "Conformité au réseau (avec IQ Relay)", placeholder: "Ex. EN 50549-1" },
  { key: "safety", label: "Sécurité", placeholder: "Ex. EN IEC 62109-1, EN IEC 62109-2" },
  { key: "productMarking", label: "Étiquetage des produits", placeholder: "Ex. CE, RCM" },
  { key: "communication", label: "Communication avec les micro-onduleurs", placeholder: "Ex. Courant porteur 110–120 kHz" },
  { key: "warranty", label: "Garantie", placeholder: "Ex. 25 ans (IQ Gateway connectée)" },
];

export const MICRO_INVERTER_FIELD_GROUPS = [
  { title: "Données d’entrée (DC)", keys: ["dcVoltageMinMax", "startVoltage", "nominalInputVoltage", "mppVoltage", "operatingVoltage", "maxInputCurrent", "maxIsc", "maxInputPower", "reverseCurrent"] },
  { title: "Données de sortie (AC)", keys: ["maxApparentPower", "nominalPower", "gridVoltage", "gridVoltageRange", "maxOutputCurrent", "frequency", "frequencyRange", "maxUnitsPerCircuit", "maxUnitsPerCable", "protectionClass", "thd", "powerFactor", "powerFactorRange", "efficiencyMax", "efficiencyEu", "maxFaultCurrent", "topology", "nightConsumption"] },
  { title: "Données mécaniques", keys: ["ambientTemp", "humidity", "dvcClass", "dcConnectorPairs", "acConnector", "dcConnector", "dimensions", "weight", "cooling", "enclosure", "ipRating", "wetEnvironments", "altitude", "soundLevel", "surgeCategory"] },
  { title: "Normes", keys: ["gridCompliance", "safety", "productMarking", "communication", "warranty"] },
];

export const MICRO_INVERTER_HEADING = "MICRO-ONDULEUR";

const FIELD_BY_KEY = Object.fromEntries(MICRO_INVERTER_FIELDS.map(field => [field.key, field]));
const FIELDS_BY_LABEL_LENGTH = [...MICRO_INVERTER_FIELDS].sort((left, right) => right.label.length - left.label.length);

const MICRO_INVERTER_ALIASES = [
  "Micro-onduleur",
  "Micro-onduleurs",
  "Micro onduleur",
  "Microonduleur",
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

function isMicroInverterName(name) {
  if (MICRO_INVERTER_ALIASES.some(alias => taxonomyNamesEqual(name, alias))) return true;
  return /micro[-\s]?ondul/.test(normalizeName(name));
}

export function isMicroInverterPath({ category, subcategory, sourceReference, accessory } = {}) {
  const kind = String(sourceReference || "")
    .trim()
    .toLowerCase();
  if (accessory || kind === "picker:fourniture" || kind === "picker:installation") return false;
  if (!isMicroInverterName(subcategory)) return false;
  if (!category) return true;
  const family = normalizeName(category);
  return !family || family === "photovoltaique" || family.startsWith("photovolta");
}

export function emptyMicroInverterSpecs() {
  return Object.fromEntries(MICRO_INVERTER_FIELDS.map(field => [field.key, ""]));
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

export function isMicroInverterSpecText(text) {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  const first = normalizeName(raw.split("\n").find(line => line.trim()) || "");
  if (first === "micro-onduleur" || first === "micro onduleur") return true;
  if (/^MICRO-ONDULEUR/im.test(raw)) return true;
  return MICRO_INVERTER_FIELDS.filter(field => raw.split("\n").some(line => lineValueAfterLabel(line, field.label) !== null)).length >= 2;
}

export function parseMicroInverterDescription(text) {
  const specs = { ...emptyMicroInverterSpecs(), brand: "", matched: 0 };
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (normalizeName(trimmed) === "micro-onduleur" || normalizeName(trimmed) === "micro onduleur") continue;
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

export function formatMicroInverterDescription(specs = {}, { brand, title } = {}) {
  const values = { ...emptyMicroInverterSpecs(), ...specs };
  const lines = [];
  const heading = String(title || "").trim();
  if (heading) lines.push(heading, "");
  lines.push(MICRO_INVERTER_HEADING, "");
  const marque = String(brand || specs.brand || "").trim();
  if (marque) lines.push(`Marque : ${marque}`);
  for (const field of MICRO_INVERTER_FIELDS) {
    const value = String(values[field.key] || "").trim();
    if (!value) continue;
    lines.push(`${field.label} : ${value}`);
  }
  return lines.join("\n").trim();
}

export function microInverterField(key) {
  return FIELD_BY_KEY[key] || null;
}
