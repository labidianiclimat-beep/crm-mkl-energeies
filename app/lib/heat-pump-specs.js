import { taxonomyNamesEqual } from "./article-taxonomy.js";

const HEAT_PUMP_NAMES = [
  "Pompe à chaleur",
  "Pompe à chaleur Duo",
  "Pompe à chaleur air/eau",
  "Pompe à chaleur air/air",
  "Air/eau",
  "Air/air",
  "PAC",
  "PAC Duo",
];

export const HEAT_PUMP_FIELDS = [
  { key: "eprel", label: "Eprel", placeholder: "N° EPREL" },
  { key: "ademe", label: "N° agrément ADEME", placeholder: "N° agrément" },
  { key: "refrigerant", label: "Réfrigérant", placeholder: "Ex. R32" },
  { key: "energyClass", label: "Classe énergétique - chauffage (35°C/55°C)", placeholder: "Ex. A+++ / A++" },
  { key: "seasonalEfficiency", label: "Efficacité énergétique saisonnière - chauffage (35°C/55°C)", placeholder: "Ex. 185 % / 145 %" },
  { key: "scop", label: "SCOP 35°C / 55°C", placeholder: "Ex. 4,6 / 3,8" },
  { key: "maxFlowTemp", label: "Température de départ maximum", placeholder: "Ex. 60 °C" },
  { key: "powerMinus7_35", label: "Puissance calorifique : -7°C / +35°C", placeholder: "Ex. 8,2 kW" },
  { key: "copMinus7_35", label: "COP -7°C / 35°C nominal", placeholder: "Ex. 3,4" },
  { key: "powerMinus7_55", label: "Puissance calorifique -7°C / +55°C", placeholder: "Ex. 7,1 kW" },
  { key: "copMinus7_55", label: "COP -7°C / 55°C nominal", placeholder: "Ex. 2,6" },
  { key: "powerPlus7_35", label: "Puissance calorifique +7°C / +35°C", placeholder: "Ex. 9,5 kW" },
  { key: "copPlus7_35", label: "COP +7°C / 35°C nominal", placeholder: "Ex. 4,8" },
  { key: "soundLevel", label: "Niveau sonore", placeholder: "Ex. 35 dB(A)" },
  { key: "dhwTank", label: "Ballon ECS intégré", placeholder: "Ex. Oui — 190 L" },
  { key: "bufferVolume", label: "Volume tampon intégré", placeholder: "Ex. 40 L" },
  { key: "expansionVessel", label: "Vase d'expansion", placeholder: "Ex. 12 L" },
  { key: "operatingWeight", label: "Poids de fonctionnement", placeholder: "Ex. 148 kg" },
  { key: "operatingRange", label: "Plage de fonctionnement conseillée mini./maxi. mode chaud", placeholder: "Ex. -20 °C / +35 °C" },
  { key: "powerSupply", label: "Alimentation", placeholder: "Ex. 230 V monophasé" },
  { key: "electricBackup", label: "Appoint électrique : puissance / calibre disjoncteur / câble d'alimentation", placeholder: "Ex. 6 kW / 32 A / 3G6" },
  { key: "dhwBackup", label: "Appoint ECS : puissance / calibre disjoncteur / câble d'alimentation", placeholder: "Ex. 1,8 kW / 10 A / 3G1,5" },
];

export const HEAT_PUMP_FIELD_GROUPS = [
  { title: "Identification", keys: ["eprel", "ademe", "refrigerant"] },
  { title: "Performances énergétiques", keys: ["energyClass", "seasonalEfficiency", "scop", "maxFlowTemp"] },
  { title: "Puissances et COP", keys: ["powerMinus7_35", "copMinus7_35", "powerMinus7_55", "copMinus7_55", "powerPlus7_35", "copPlus7_35"] },
  { title: "Équipement", keys: ["soundLevel", "dhwTank", "bufferVolume", "expansionVessel", "operatingWeight", "operatingRange", "powerSupply"] },
  { title: "Appoints", keys: ["electricBackup", "dhwBackup"] },
];

const FIELD_BY_KEY = Object.fromEntries(HEAT_PUMP_FIELDS.map(field => [field.key, field]));

export function isHeatPumpPath({ category, subcategory, sourceReference, accessory } = {}) {
  const kind = String(sourceReference || "")
    .trim()
    .toLowerCase();
  if (accessory || kind === "picker:fourniture" || kind === "picker:installation") return false;
  const accessoryName = String(subcategory || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (accessoryName === "fourniture" || accessoryName === "fournitures" || accessoryName === "installation" || accessoryName === "pose") {
    return false;
  }
  return [subcategory, category].filter(Boolean).some(name => {
    const normalized = String(name || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (normalized.startsWith("pompe a chaleur") || normalized === "pac" || normalized.startsWith("pac ")) return true;
    return HEAT_PUMP_NAMES.some(alias => taxonomyNamesEqual(name, alias));
  });
}

export function defaultHeatPumpWarranty(brand) {
  const name = String(brand || "").trim() || "constructeur";
  return [
    "- 2 ans pièces",
    `- +1 an pièces et main d'œuvre sous conditions ${name}`,
    "- 5 ans corps de chauffe, compresseur, échangeur et ballon ECS",
  ].join("\n");
}

export function emptyHeatPumpSpecs() {
  return Object.fromEntries(HEAT_PUMP_FIELDS.map(field => [field.key, ""]));
}

export function defaultHeatPumpSpecs(brand) {
  return {
    ...emptyHeatPumpSpecs(),
    warranty: defaultHeatPumpWarranty(brand),
  };
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

export function isHeatPumpSpecText(text) {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  return HEAT_PUMP_FIELDS.some(field => lineValueAfterLabel(raw.split(/\n/)[0], field.label) !== null)
    || /^(marque|eprel|n° agrement ademe|refrigerant|scop|garantie)\s*:/im.test(raw)
    || HEAT_PUMP_FIELDS.filter(field => raw.split("\n").some(line => lineValueAfterLabel(line, field.label) !== null)).length >= 2;
}

export function parseHeatPumpDescription(text) {
  const specs = { ...emptyHeatPumpSpecs(), warranty: "", brand: "", matched: 0 };
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^garantie\s*:/i.test(trimmed)) {
      const first = trimmed.replace(/^garantie\s*:/i, "").trim();
      const rest = lines.slice(index + 1).join("\n").trim();
      specs.warranty = [first, rest].filter(Boolean).join("\n");
      specs.matched += 1;
      break;
    }
    const brandValue = lineValueAfterLabel(line, "Marque");
    if (brandValue !== null) {
      specs.brand = brandValue;
      specs.matched += 1;
      continue;
    }
    const field = HEAT_PUMP_FIELDS.find(item => lineValueAfterLabel(line, item.label) !== null);
    if (!field) continue;
    specs[field.key] = lineValueAfterLabel(line, field.label);
    specs.matched += 1;
  }
  return specs;
}

export function formatHeatPumpDescription(specs = {}, { brand, title } = {}) {
  const values = { ...emptyHeatPumpSpecs(), ...specs };
  const lines = [];
  const heading = String(title || "").trim();
  if (heading) lines.push(heading, "");
  const marque = String(brand || specs.brand || "").trim();
  if (marque) lines.push(`Marque : ${marque}`);
  for (const field of HEAT_PUMP_FIELDS) {
    const value = String(values[field.key] || "").trim();
    if (!value) continue;
    lines.push(`${field.label} : ${value}`);
  }
  const warranty = String(values.warranty || "").trim();
  if (warranty) {
    if (lines.length) lines.push("");
    lines.push("Garantie :");
    lines.push(warranty);
  }
  return lines.join("\n").trim();
}

export function heatPumpField(key) {
  return FIELD_BY_KEY[key] || null;
}
