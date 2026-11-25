/** Simulateur de production photovoltaïque MKL — E = A × B × C × D. */

export const PV_SIMULATOR_STORAGE_KEY = "mkl-pv-simulations";
export const DEFAULT_INSTALLATION_EFFICIENCY = 0.8;

export const PV_ORIENTATIONS = [
  { id: "est", label: "Est" },
  { id: "sud-est", label: "Sud-Est" },
  { id: "sud", label: "Sud" },
  { id: "sud-ouest", label: "Sud-Ouest" },
  { id: "ouest", label: "Ouest" },
];

export const PV_INCLINATIONS = [
  { id: "0", label: "0°", degrees: 0 },
  { id: "10-15", label: "10° à 15°", degrees: 12.5 },
  { id: "20-25", label: "20° à 25°", degrees: 22.5 },
  { id: "30-35", label: "30° à 35°", degrees: 32.5 },
  { id: "40-45", label: "40° à 45°", degrees: 42.5 },
  { id: "50-55", label: "50° à 55°", degrees: 52.5 },
  { id: "60", label: "60°", degrees: 60 },
  { id: "90", label: "90°", degrees: 90 },
];

export function inclinationSlopePoints(degrees) {
  const rad = (Number(degrees) * Math.PI) / 180;
  const length = 9;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const round = value => Math.round(value * 100) / 100;
  return {
    x1: round(12 - cos * length),
    y1: round(12 + sin * length),
    x2: round(12 + cos * length),
    y2: round(12 - sin * length),
  };
}

export function inclinationSlopeSvg(degrees) {
  const { x1, y1, x2, y2 } = inclinationSlopePoints(degrees);
  return `<svg class="pvsim-slope" viewBox="0 0 24 24" aria-hidden="true"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/></svg>`;
}

/** Coefficients du formulaire : ligne orientation, colonne inclinaison. */
const COEFFICIENTS = {
  est: [1, 0.99, 0.97, 0.91, 0.9, 0.84, 0.81, 0.58],
  "sud-est": [1, 1.07, 1.09, 1.09, 1.07, 1.03, 1, 0.74],
  sud: [1, 1.1, 1.14, 1.15, 1.14, 1.1, 1.08, 0.79],
  "sud-ouest": [1, 1.07, 1.09, 1.09, 1.07, 1.03, 1, 0.74],
  ouest: [1, 0.99, 0.97, 0.94, 0.9, 0.84, 0.81, 0.58],
};

/** Ensoleillement annuel horizontal de référence, kWh/m²/an, par département. */
const DEPARTMENT_IRRADIATION = {
  "01": ["Ain", 1250],
  "02": ["Aisne", 1100],
  "03": ["Allier", 1250],
  "04": ["Alpes-de-Haute-Provence", 1600],
  "05": ["Hautes-Alpes", 1550],
  "06": ["Alpes-Maritimes", 1650],
  "07": ["Ardèche", 1450],
  "08": ["Ardennes", 1050],
  "09": ["Ariège", 1400],
  "10": ["Aube", 1150],
  "11": ["Aude", 1550],
  "12": ["Aveyron", 1400],
  "13": ["Bouches-du-Rhône", 1700],
  "14": ["Calvados", 1150],
  "15": ["Cantal", 1350],
  "16": ["Charente", 1300],
  "17": ["Charente-Maritime", 1350],
  "18": ["Cher", 1200],
  "19": ["Corrèze", 1300],
  "21": ["Côte-d’Or", 1200],
  "22": ["Côtes-d’Armor", 1150],
  "23": ["Creuse", 1250],
  "24": ["Dordogne", 1350],
  "25": ["Doubs", 1200],
  "26": ["Drôme", 1550],
  "27": ["Eure", 1100],
  "28": ["Eure-et-Loir", 1150],
  "29": ["Finistère", 1100],
  "30": ["Gard", 1600],
  "31": ["Haute-Garonne", 1400],
  "32": ["Gers", 1400],
  "33": ["Gironde", 1350],
  "34": ["Hérault", 1600],
  "35": ["Ille-et-Vilaine", 1150],
  "36": ["Indre", 1200],
  "37": ["Indre-et-Loire", 1200],
  "38": ["Isère", 1350],
  "39": ["Jura", 1200],
  "40": ["Landes", 1400],
  "41": ["Loir-et-Cher", 1200],
  "42": ["Loire", 1300],
  "43": ["Haute-Loire", 1400],
  "44": ["Loire-Atlantique", 1250],
  "45": ["Loiret", 1150],
  "46": ["Lot", 1400],
  "47": ["Lot-et-Garonne", 1400],
  "48": ["Lozère", 1450],
  "49": ["Maine-et-Loire", 1250],
  "50": ["Manche", 1100],
  "51": ["Marne", 1150],
  "52": ["Haute-Marne", 1150],
  "53": ["Mayenne", 1150],
  "54": ["Meurthe-et-Moselle", 1100],
  "55": ["Meuse", 1100],
  "56": ["Morbihan", 1200],
  "57": ["Moselle", 1100],
  "58": ["Nièvre", 1200],
  "59": ["Nord", 1050],
  "60": ["Oise", 1100],
  "61": ["Orne", 1100],
  "62": ["Pas-de-Calais", 1050],
  "63": ["Puy-de-Dôme", 1300],
  "64": ["Pyrénées-Atlantiques", 1350],
  "65": ["Hautes-Pyrénées", 1400],
  "66": ["Pyrénées-Orientales", 1550],
  "67": ["Bas-Rhin", 1180],
  "68": ["Haut-Rhin", 1240],
  "69": ["Rhône", 1300],
  "70": ["Haute-Saône", 1150],
  "71": ["Saône-et-Loire", 1250],
  "72": ["Sarthe", 1200],
  "73": ["Savoie", 1300],
  "74": ["Haute-Savoie", 1250],
  "75": ["Paris", 1100],
  "76": ["Seine-Maritime", 1050],
  "77": ["Seine-et-Marne", 1150],
  "78": ["Yvelines", 1150],
  "79": ["Deux-Sèvres", 1300],
  "80": ["Somme", 1050],
  "81": ["Tarn", 1450],
  "82": ["Tarn-et-Garonne", 1450],
  "83": ["Var", 1700],
  "84": ["Vaucluse", 1650],
  "85": ["Vendée", 1300],
  "86": ["Vienne", 1250],
  "87": ["Haute-Vienne", 1250],
  "88": ["Vosges", 1150],
  "89": ["Yonne", 1150],
  "90": ["Territoire de Belfort", 1150],
  "91": ["Essonne", 1150],
  "92": ["Hauts-de-Seine", 1100],
  "93": ["Seine-Saint-Denis", 1100],
  "94": ["Val-de-Marne", 1150],
  "95": ["Val-d’Oise", 1100],
  "2A": ["Corse-du-Sud", 1600],
  "2B": ["Haute-Corse", 1550],
  "971": ["Guadeloupe", 1800],
  "972": ["Martinique", 1800],
  "973": ["Guyane", 1600],
  "974": ["La Réunion", 1700],
  "976": ["Mayotte", 1800],
};

function toNumber(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const number = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function departmentFromPostal(postalCode) {
  const code = String(postalCode || "").replace(/\D/g, "");
  if (code.length < 2) return "";
  if (code.startsWith("97") || code.startsWith("98")) return code.slice(0, 3);
  if (code.startsWith("20")) {
    const head = Number(code.slice(0, 3));
    return head >= 202 ? "2B" : "2A";
  }
  return code.slice(0, 2);
}

export function irradiationForDepartment(code) {
  const row = DEPARTMENT_IRRADIATION[String(code || "")];
  if (!row) return null;
  return { code: String(code), name: row[0], kwh: row[1] };
}

export function irradiationForPostal(postalCode) {
  return irradiationForDepartment(departmentFromPostal(postalCode));
}

export function orientationCoefficient(orientation, inclination) {
  const row = COEFFICIENTS[orientation];
  if (!row) return null;
  const index = PV_INCLINATIONS.findIndex(item => item.id === inclination);
  if (index < 0) return null;
  return row[index];
}

/** 80 ou 80 % devient 0,80. Un coefficient déjà compris entre 0 et 1,5 est conservé. */
export function efficiencyFactor(value) {
  const number = toNumber(value);
  if (number <= 0) return 0;
  if (number > 1.5) return round(number / 100, 4);
  return number;
}

export function productionKwh({ irradiation, coefficient, powerKwc, efficiency } = {}) {
  const irradiationValue = toNumber(irradiation);
  const coefficientValue = toNumber(coefficient);
  const power = toNumber(powerKwc);
  const factor = efficiencyFactor(efficiency);
  if (irradiationValue <= 0 || coefficientValue <= 0 || power <= 0 || factor <= 0) return null;
  return round(irradiationValue * coefficientValue * power * factor, 0);
}

export function computePvSimulation(input = {}) {
  const department = irradiationForPostal(input.postalCode);
  const coefficient = orientationCoefficient(input.orientation, input.inclination);
  const efficiency = efficiencyFactor(input.efficiency);
  const production = productionKwh({
    irradiation: input.irradiation,
    coefficient,
    powerKwc: input.powerKwc,
    efficiency,
  });
  return {
    departmentCode: department?.code || "",
    departmentName: department?.name || "",
    suggestedIrradiation: department?.kwh ?? null,
    coefficient,
    efficiency,
    production,
  };
}

export function createEmptyPvSimulation() {
  return {
    lastName: "",
    firstName: "",
    client: "",
    clientId: "",
    address: "",
    postalCode: "",
    city: "",
    mobile: "",
    email: "",
    irradiation: "",
    irradiationManual: false,
    orientation: "",
    inclination: "",
    powerKwc: "",
    efficiency: String(DEFAULT_INSTALLATION_EFFICIENCY),
    surplusTariff: "",
    place: "",
    signatureDate: new Date().toISOString().slice(0, 10),
    signature: "",
  };
}

export function nextSimulationNumber(records = [], date = new Date()) {
  const year = date.getFullYear();
  const prefix = `SPV-${year}-`;
  const used = (records || [])
    .map(item => String(item?.number || ""))
    .filter(number => number.startsWith(prefix))
    .map(number => Number(number.slice(prefix.length)))
    .filter(Number.isFinite);
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}${String(next).padStart(6, "0")}`;
}

export function formatPvSimNumber(value, digits = 2) {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

export function formatPvSimKwh(value) {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value));
}
