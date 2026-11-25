/** Note de dimensionnement — dossier prime (BAR-TH). */

import { computeThermalStudy } from "./thermal-study.js";
import { isHeatPumpModelArticle } from "./heat-pump-tariff.js";

export const SIZING_NOTE_KIND = "dimensionnement";

export const SIZING_REMIT_SENTENCE = "Cette note a été remise au bénéficiaire avant le début des travaux";

export const SIZING_ROOMS_SENTENCE = "Les déperditions calculées concernent bien uniquement les pièces du logement desservies par le réseau de chauffage, lesquelles sont calculées sans considération des éventuels autres générateurs présents dans les pièces du logement desservies par le réseau de chauffage.";

export const SIZING_ATTESTATION_INTRO = "En soumettant cette note de dimensionnement, l’installateur atteste que :";

export const SIZING_ATTESTATIONS = [
  "Le volume à chauffer renseigné correspond à la somme des volumes de chaque pièce chauffée.",
  "L’équipement de chauffage installé couvrira l’intégralité des besoins de chauffage des volumes chauffés, sans être surdimensionné.",
];

export const EQUIPMENT_TYPES = [
  { id: "bar-th-171", label: "Pompe à chaleur air / eau", code: "BAR TH 171", family: "pac" },
  { id: "bar-th-159", label: "Pompe à chaleur hybride", code: "BAR TH 159", family: "hybrid" },
  { id: "bar-th-172", label: "Pompe à chaleur eau / eau ou sol / eau", code: "BAR TH 172", family: "pac" },
  { id: "bar-th-113", label: "Chaudière Biomasse", code: "BAR TH 113", family: "biomass" },
];

export function isSizingNote(record) {
  return record?.kind === SIZING_NOTE_KIND;
}

export function equipmentById(id) {
  return EQUIPMENT_TYPES.find(item => item.id === id) || null;
}

function toNumber(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const number = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function optionalNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

/** Volume à chauffer (m³) = surface chauffée (m²) × hauteur sous plafond (m). */
export function heatedVolume(surface, height) {
  return round(Math.max(0, toNumber(surface)) * Math.max(0, toNumber(height)), 2);
}

/**
 * Delta T = T° consigne − T° extérieure de base.
 * Si T° arrêt PAC > T° extérieure de base : Delta T = T° consigne − T° arrêt PAC.
 */
export function sizingDeltaT({ tIndoor, tOutdoor, stopTemp } = {}) {
  const indoor = toNumber(tIndoor, 21);
  const outdoor = toNumber(tOutdoor, -15);
  const stop = optionalNumber(stopTemp);
  const usesStop = stop != null && stop > outdoor;
  const reference = usesStop ? stop : outdoor;
  return {
    indoor,
    outdoor,
    stop,
    usesStop,
    reference,
    deltaT: round(indoor - reference, 2),
  };
}

/** Déperditions (W) = volume × coefficient (W/m³.°C) × Delta T. */
export function heatLossWatts(volume, coefficient, deltaT) {
  return round(Math.max(0, toNumber(volume)) * Math.max(0, toNumber(coefficient)) * Math.max(0, toNumber(deltaT)), 0);
}

/** Taux (%) = (puissance W × 100) / déperditions W. */
export function coverageRate(powerW, lossesW) {
  const power = optionalNumber(powerW);
  const losses = toNumber(lossesW);
  if (power == null || losses <= 0) return null;
  return round((power * 100) / losses, 1);
}

/** Taux hors appoint (%) = (énergie PAC kWh × 100) / besoins annuels kWh. */
export function energyCoverageRate(pacKwh, annualNeedsKwh) {
  const energy = optionalNumber(pacKwh);
  const needs = optionalNumber(annualNeedsKwh);
  if (energy == null || needs == null || needs <= 0) return null;
  return round((energy * 100) / needs, 1);
}

export function coverageVerdict(family, { coverage = null, energyCoverage = null, lossesW = 0 } = {}) {
  if (family === "pac") {
    if (coverage == null) return { ok: false, tone: "wait", label: "Puissance de la PAC à renseigner" };
    if (coverage < 60) return { ok: false, tone: "bad", label: "Sous-dimensionnée : moins de 60 %" };
    if (coverage > 130) return { ok: false, tone: "bad", label: "Surdimensionnée : plus de 130 %" };
    return { ok: true, tone: "ok", label: "Couverture conforme : entre 60 % et 130 %" };
  }
  if (family === "hybrid") {
    const powerOk = coverage != null && coverage >= 40 && coverage <= 80;
    const energyOk = energyCoverage != null && energyCoverage >= 70;
    if (coverage == null || energyCoverage == null) {
      return { ok: false, tone: "wait", powerOk, energyOk, label: "Énergie hors appoint et puissance à renseigner" };
    }
    if (!energyOk) return { ok: false, tone: "bad", powerOk, energyOk, label: "Hors appoint inférieur à 70 %" };
    if (!powerOk) {
      return {
        ok: false,
        tone: "bad",
        powerOk,
        energyOk,
        label: coverage < 40 ? "Puissance inférieure à 40 % des déperditions" : "Puissance supérieure à 80 % des déperditions",
      };
    }
    return { ok: true, tone: "ok", powerOk, energyOk, label: "Hybride conforme : au moins 70 % hors appoint, puissance entre 40 % et 80 %" };
  }
  if (family === "biomass") {
    if (!(toNumber(lossesW) > 0)) return { ok: false, tone: "wait", label: "Déperditions à calculer" };
    return { ok: true, tone: "ok", label: "Déperditions calculées pour la chaudière biomasse" };
  }
  return { ok: false, tone: "wait", label: "Choisissez le type de matériel" };
}

export function computeSizingNote(input = {}) {
  const equipment = equipmentById(input.equipmentType);
  const family = equipment?.family || "";
  const surface = optionalNumber(input.surface);
  const height = optionalNumber(input.height);
  const volume = surface != null && height != null ? heatedVolume(surface, height) : null;
  const indoor = optionalNumber(input.tIndoor);
  const outdoor = optionalNumber(input.tOutdoor);
  const coefficient = optionalNumber(input.coefficient);
  const delta = indoor != null && outdoor != null
    ? sizingDeltaT(family === "biomass" ? { tIndoor: indoor, tOutdoor: outdoor, stopTemp: "" } : { tIndoor: indoor, tOutdoor: outdoor, stopTemp: input.stopTemp })
    : { indoor, outdoor, stop: optionalNumber(input.stopTemp), usesStop: false, reference: null, deltaT: null };
  const lossesW = volume != null && coefficient != null && delta.deltaT != null
    ? heatLossWatts(volume, coefficient, delta.deltaT)
    : null;
  const lossesKw = lossesW == null ? null : round(lossesW / 1000, 2);
  const coverage = family === "biomass" ? null : coverageRate(input.pacPowerW, lossesW);
  const energyCoverage = family === "hybrid" ? energyCoverageRate(input.pacEnergyKwh, input.annualNeedsKwh) : null;
  const verdict = coverageVerdict(family, { coverage, energyCoverage, lossesW });
  const biZone = input.biZone === true || input.biZone === "oui" || input.biZone === "OUI";
  return {
    equipment,
    family,
    equipmentLabel: equipment ? `${equipment.label} – ${equipment.code}` : "",
    equipmentCode: equipment?.code || "",
    surface,
    height,
    volume,
    coefficient,
    ...delta,
    lossesW,
    lossesKw,
    pacPowerW: optionalNumber(input.pacPowerW),
    coverage,
    pacEnergyKwh: optionalNumber(input.pacEnergyKwh),
    annualNeedsKwh: optionalNumber(input.annualNeedsKwh),
    energyCoverage,
    biZone,
    verdict,
  };
}

export function nextSizingNumber(records = [], date = new Date()) {
  const year = date.getFullYear();
  const prefix = `ND-${year}-`;
  const used = (records || [])
    .map(item => String(item?.number || ""))
    .filter(number => number.startsWith(prefix))
    .map(number => Number(number.slice(prefix.length)))
    .filter(Number.isFinite);
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}${String(next).padStart(6, "0")}`;
}

export function createEmptySizingNote() {
  return {
    kind: SIZING_NOTE_KIND,
    equipmentType: "",
    brand: "",
    model: "",
    stopTemp: "",
    lastName: "",
    firstName: "",
    client: "",
    clientId: "",
    prospectId: "",
    clientNumber: "",
    address: "",
    addressComplement: "",
    postalCode: "",
    city: "",
    phone: "",
    email: "",
    surface: "",
    height: "",
    tIndoor: "",
    tOutdoor: "",
    coefficient: "",
    pacPowerW: "",
    waterTemp: "",
    biZone: false,
    waterTemp2: "",
    pacEnergyKwh: "",
    annualNeedsKwh: "",
    regulationModule: "",
    articleId: "",
    thermalStudyId: "",
    thermalStudyNumber: "",
    noteDate: new Date().toISOString().slice(0, 10),
  };
}

function filled(value) {
  return !(value == null || String(value).trim() === "");
}

export function normalizeStudyNumber(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "");
}

/** Étude thermique déjà enregistrée, par numéro complet ou par les chiffres seuls s'ils sont uniques. */
export function findThermalStudyByNumber(records = [], input) {
  const wanted = normalizeStudyNumber(input);
  if (!wanted) return { study: null, ambiguous: false };
  const studies = (records || []).filter(item => item && !isSizingNote(item) && item.number);
  const exact = studies.find(item => normalizeStudyNumber(item.number) === wanted) || null;
  if (exact) return { study: exact, ambiguous: false };
  const digits = wanted.replace(/\D/g, "");
  if (digits.length < 4) return { study: null, ambiguous: false };
  const padded = digits.padStart(6, "0");
  const hits = studies.filter(item => {
    const number = normalizeStudyNumber(item.number);
    return number.endsWith(`-${padded}`) || number.endsWith(`-${digits}`);
  });
  if (hits.length === 1) return { study: hits[0], ambiguous: false };
  return { study: null, ambiguous: hits.length > 1 };
}

/**
 * Champs techniques repris d'une étude déjà calculée.
 * La puissance, les températures d'eau et la température d'arrêt restent vides.
 */
export function sizingFieldsFromThermalStudy(study) {
  const source = study && typeof study === "object" ? study : {};
  const computed = computeThermalStudy(source);
  const fields = {
    thermalStudyId: source.id || "",
    thermalStudyNumber: source.number || "",
  };
  if (filled(source.surface)) fields.surface = source.surface;
  if (filled(source.height)) fields.height = source.height;
  if (filled(source.tIndoor)) fields.tIndoor = source.tIndoor;
  if (filled(source.tOutdoor)) fields.tOutdoor = source.tOutdoor;
  if (filled(source.surface)) {
    fields.coefficient = computed.g;
    if (computed.energyKwh > 0) fields.annualNeedsKwh = computed.energyKwh;
  }
  if (filled(source.lastName)) fields.lastName = source.lastName;
  if (filled(source.firstName)) fields.firstName = source.firstName;
  if (filled(source.address)) fields.address = source.address;
  if (filled(source.addressComplement)) fields.addressComplement = source.addressComplement;
  if (filled(source.postalCode)) fields.postalCode = source.postalCode;
  if (filled(source.city)) fields.city = source.city;
  return fields;
}

function articleMatchesLine(article, line) {
  if (!article || !line) return false;
  if (line.articleId && String(article.id) === String(line.articleId)) return true;
  const code = String(line.code || line.reference || "").trim().toLowerCase();
  return Boolean(code) && String(article.code || article.reference || "").trim().toLowerCase() === code;
}

function quoteTime(document) {
  const stamp = Date.parse(document?.updatedAt || document?.date || document?.createdAt || "");
  return Number.isFinite(stamp) ? stamp : 0;
}

/** Marque et modèle : dernière ligne de devis qui pointe vers une pompe à chaleur du catalogue. */
export function heatPumpMachineForClient(documents = [], articles = [], clientId) {
  if (!clientId) return null;
  const quotes = (documents || [])
    .filter(document => document && (document.kind || "Devis") === "Devis" && String(document.clientId) === String(clientId))
    .sort((a, b) => quoteTime(b) - quoteTime(a));
  for (const quote of quotes) {
    for (const line of quote.items || []) {
      const article = (articles || []).find(item => articleMatchesLine(item, line) && isHeatPumpModelArticle(item));
      if (!article) continue;
      return {
        articleId: article.id || "",
        brand: article.brand || article.marque || "",
        model: article.name || article.designation || "",
      };
    }
  }
  return null;
}

/** La note s'ouvre seulement si l'étude est déjà reliée à une fiche client visible. */
export function sizingClientForStudy(study, clients = []) {
  const client = (clients || []).find(item => study?.clientId && String(item.id) === String(study.clientId)) || null;
  if (client) return { client, reason: "" };
  if (study?.prospectId) return { client: null, reason: "prospect" };
  return { client: null, reason: "missing" };
}

export function searchHeatPumpArticles(articles = [], query, limit = 8) {
  const words = String(query || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter(word => word.length >= 2);
  if (!words.length) return [];
  return (articles || [])
    .filter(article => article && article.active !== false && isHeatPumpModelArticle(article))
    .filter(article => {
      const hay = [article.brand, article.marque, article.name, article.designation, article.code, article.reference]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return words.every(word => hay.includes(word));
    })
    .slice(0, limit);
}
