/** Étude thermique commerciale MKL — formules du document A4 (Alsace). */

export const THERMAL_STUDY_STORAGE_KEY = "mkl-thermal-studies";
export const ALSACE_DJU = 3184;
export const PAC_COP = 4.2;
export const ENERGY_FACTOR = 0.018;
export const DEFAULT_T_INDOOR = 21;
export const DEFAULT_T_OUTDOOR = -15;
export const PROPANE_KWH_PER_KG = 13.8;
export const FUEL_KWH_PER_L = 10;
export const GAS_KWH_PER_M3 = 10.5;

export const SCORE_CRITERIA = [
  {
    key: "construction",
    label: "Date de construction",
    options: [
      { points: 0, label: "< 50" },
      { points: 1, label: "60 à 85" },
      { points: 2, label: "85 à 2000" },
      { points: 3, label: "Depuis 2000" },
      { points: 4, label: "BBC à RT2012" },
    ],
  },
  {
    key: "housingType",
    label: "Type d’habitation",
    options: [
      { points: 0, label: "4 faces" },
      { points: 1, label: "3 faces" },
      { points: 2, label: "2 faces" },
    ],
  },
  {
    key: "wallInsulation",
    label: "Isolation murs",
    options: [
      { points: 0, label: "< 5 cm" },
      { points: 1, label: "5 à 7 cm" },
      { points: 2, label: "7 à 10 cm" },
      { points: 3, label: "> à 10 cm" },
    ],
  },
  {
    key: "roofInsulation",
    label: "Isolation de toiture",
    options: [
      { points: 0, label: "< 5 cm" },
      { points: 1, label: "5 à 10 cm" },
      { points: 2, label: "11 à 20 cm" },
      { points: 3, label: "> à 20 cm" },
    ],
  },
  {
    key: "floorInsulation",
    label: "Isolation du plancher bas",
    options: [
      { points: 0, label: "< 4 cm" },
      { points: 1, label: "4 à 7 cm" },
      { points: 2, label: "8 à 10 cm" },
      { points: 3, label: "> à 10 cm" },
    ],
  },
  {
    key: "glazing",
    label: "Épaisseur des vitres",
    options: [
      { points: 0, label: "Simple" },
      { points: 1, label: "Survitrage" },
      { points: 2, label: "D. vitrage < 10 cm" },
      { points: 3, label: "D. vitrage > 10 cm" },
    ],
  },
  {
    key: "ventilation",
    label: "Type d’aération",
    options: [
      { points: 0, label: "Naturelle" },
      { points: 1, label: "VMC / CHEM" },
      { points: 2, label: "VMC & CHEM" },
      { points: 3, label: "Double flux" },
    ],
  },
];

/** Table G du document : bornes inférieures [min, max) → G. */
export const G_TABLE = [
  { min: 17.5, g: 0.7 },
  { min: 16.5, g: 0.75 },
  { min: 15.5, g: 0.8 },
  { min: 14.5, g: 0.85 },
  { min: 13.5, g: 0.9 },
  { min: 12.5, g: 0.95 },
  { min: 11.5, g: 1 },
  { min: 10.5, g: 1.1 },
  { min: 9.5, g: 1.15 },
  { min: 8.5, g: 1.2 },
  { min: 7.5, g: 1.25 },
  { min: 6.5, g: 1.3 },
  { min: 0, g: 1.4 },
];

function toNumber(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function emptyThermalScores() {
  return Object.fromEntries(SCORE_CRITERIA.map(item => [item.key, null]));
}

export function criterionPoints(criterion, selected) {
  if (selected == null || selected === "") return 0;
  const points = toNumber(selected, NaN);
  if (!Number.isFinite(points)) return 0;
  const allowed = (criterion?.options || []).some(option => option.points === points);
  return allowed ? points : 0;
}

export function insulationPoints(scores = {}) {
  return SCORE_CRITERIA.reduce(
    (total, criterion) => total + criterionPoints(criterion, scores[criterion.key]),
    0
  );
}

export function gFromPoints(points) {
  const value = toNumber(points, 0);
  const row = G_TABLE.find(item => value >= item.min);
  return row ? row.g : 1.4;
}

export function gBandLabel(points) {
  const value = toNumber(points, 0);
  if (value >= 17.5) return "≥ 17,5";
  if (value < 6.5) return "< 6,5";
  const min = Math.floor(value * 2) / 2;
  const start = min % 1 === 0 ? min - 0.5 : min;
  const bandStart = start < 6.5 ? 6.5 : start;
  return `${String(bandStart).replace(".", ",")} à ${String(bandStart + 1).replace(".", ",")}`;
}

export function heatedVolume(surface, height) {
  return round(Math.max(0, toNumber(surface)) * Math.max(0, toNumber(height)), 2);
}

export function temperatureDelta(tIndoor, tOutdoor) {
  return round(toNumber(tIndoor, DEFAULT_T_INDOOR) - toNumber(tOutdoor, DEFAULT_T_OUTDOOR), 2);
}

/** P (kW) = Volume × G × ΔT / 1000 */
export function heatLossKw(volume, g, deltaT) {
  return round((toNumber(volume) * toNumber(g) * toNumber(deltaT)) / 1000, 2);
}

/** Q (kWh) = Volume × G × DJU × 0,018 */
export function annualEnergyKwh(volume, g, dju = ALSACE_DJU) {
  return round(toNumber(volume) * toNumber(g) * toNumber(dju, ALSACE_DJU) * ENERGY_FACTOR, 1);
}

export function pacEnergyKwh(energyKwh, cop = PAC_COP) {
  const divisor = toNumber(cop, PAC_COP) || PAC_COP;
  return round(toNumber(energyKwh) / divisor, 1);
}

export function fuelQuantity(energyKwh, kwhPerUnit) {
  const unit = toNumber(kwhPerUnit);
  if (unit <= 0) return 0;
  return round(toNumber(energyKwh) / unit, 1);
}

export function lineTotal(tariff, quantity) {
  return round(toNumber(tariff) * toNumber(quantity), 2);
}

export function computeThermalStudy(input = {}) {
  const surface = toNumber(input.surface);
  const height = toNumber(input.height);
  const tIndoor = toNumber(input.tIndoor, DEFAULT_T_INDOOR);
  const tOutdoor = toNumber(input.tOutdoor, DEFAULT_T_OUTDOOR);
  const dju = toNumber(input.dju, ALSACE_DJU);
  const cop = toNumber(input.cop, PAC_COP) || PAC_COP;
  const scores = SCORE_CRITERIA.reduce((acc, criterion) => {
    const raw = input[criterion.key];
    acc[criterion.key] = raw == null || raw === "" ? null : toNumber(raw);
    return acc;
  }, {});
  const points = insulationPoints(scores);
  const g = gFromPoints(points);
  const volume = heatedVolume(surface, height);
  const deltaT = temperatureDelta(tIndoor, tOutdoor);
  const powerDynamicKw = heatLossKw(volume, g, deltaT);
  const powerMaxKw = heatLossKw(volume, g, deltaT + 2);
  const energyKwh = annualEnergyKwh(volume, g, dju);
  const heatPumpKwh = pacEnergyKwh(energyKwh, cop);
  const propaneQty = input.propaneQty === "" || input.propaneQty == null
    ? fuelQuantity(energyKwh, PROPANE_KWH_PER_KG)
    : toNumber(input.propaneQty);
  const fuelQty = input.fuelQty === "" || input.fuelQty == null
    ? fuelQuantity(energyKwh, FUEL_KWH_PER_L)
    : toNumber(input.fuelQty);
  const gasQty = input.gasQty === "" || input.gasQty == null
    ? fuelQuantity(energyKwh, GAS_KWH_PER_M3)
    : toNumber(input.gasQty);
  const edfQty = input.edfQty === "" || input.edfQty == null ? energyKwh : toNumber(input.edfQty);
  const pelletsQty = toNumber(input.pelletsQty);
  const subscriptionQty = input.subscriptionQty === "" || input.subscriptionQty == null
    ? 1
    : toNumber(input.subscriptionQty);
  const pacQty = input.pacQty === "" || input.pacQty == null ? heatPumpKwh : toNumber(input.pacQty);

  const costs = {
    edf: lineTotal(input.edfTariff, edfQty),
    subscription: lineTotal(input.subscriptionTariff, subscriptionQty),
    pellets: lineTotal(input.pelletsTariff, pelletsQty),
    propane: lineTotal(input.propaneTariff, propaneQty),
    fuel: lineTotal(input.fuelTariff, fuelQty),
    gas: lineTotal(input.gasTariff, gasQty),
    airAir: lineTotal(input.airAirTariff, pacQty),
    airEau: lineTotal(input.airEauTariff, pacQty),
  };

  return {
    ...scores,
    surface,
    height,
    volume,
    tIndoor,
    tOutdoor,
    deltaT,
    dju,
    cop,
    points,
    g,
    gBand: gBandLabel(points),
    powerDynamicKw,
    powerMaxKw,
    energyKwh,
    heatPumpKwh,
    edfQty,
    subscriptionQty,
    pelletsQty,
    propaneQty,
    fuelQty,
    gasQty,
    pacQty,
    edfTariff: toNumber(input.edfTariff),
    subscriptionTariff: toNumber(input.subscriptionTariff),
    pelletsTariff: toNumber(input.pelletsTariff),
    propaneTariff: toNumber(input.propaneTariff),
    fuelTariff: toNumber(input.fuelTariff),
    gasTariff: toNumber(input.gasTariff),
    airAirTariff: toNumber(input.airAirTariff),
    airEauTariff: toNumber(input.airEauTariff),
    costs,
    currentTotal: round(costs.edf + costs.subscription + costs.pellets + costs.propane + costs.fuel + costs.gas, 2),
  };
}

export function nextStudyNumber(records = [], date = new Date()) {
  const year = date.getFullYear();
  const prefix = `ETH-${year}-`;
  const used = (records || [])
    .map(item => String(item?.number || ""))
    .filter(number => number.startsWith(prefix))
    .map(number => Number(number.slice(prefix.length)))
    .filter(Number.isFinite);
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}${String(next).padStart(6, "0")}`;
}

export function formatThermalNumber(value, digits = 2) {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

export function formatThermalMoney(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function createEmptyThermalStudy() {
  return {
    lastName: "",
    firstName: "",
    client: "",
    clientId: "",
    address: "",
    addressComplement: "",
    postalCode: "",
    city: "",
    surface: "",
    height: "",
    tIndoor: DEFAULT_T_INDOOR,
    tOutdoor: DEFAULT_T_OUTDOOR,
    dju: ALSACE_DJU,
    cop: PAC_COP,
    ...emptyThermalScores(),
    edfTariff: "",
    edfQty: "",
    subscriptionTariff: "",
    subscriptionQty: "",
    pelletsTariff: "",
    pelletsQty: "",
    propaneTariff: "",
    propaneQty: "",
    fuelTariff: "",
    fuelQty: "",
    gasTariff: "",
    gasQty: "",
    airAirTariff: "",
    airEauTariff: "",
    pacQty: "",
    signature: "",
    signatureDate: new Date().toISOString().slice(0, 10),
    notes: "",
  };
}
