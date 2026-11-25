import { isHeatPumpRoArticle } from "./articles.js";
import { bundleNeedsHeatPumpEmitter } from "./heat-pump-emitters.js";
import { isHeatPumpPath } from "./heat-pump-specs.js";

export const HEAT_PUMP_RO_REMOVAL_TAX = 5.5;

export const HEAT_PUMP_BOILER_REMOVALS = [
  {
    id: "fuel",
    code: "ENL-CHAUD-FIOUL",
    label: "Enlèvement de chaudière fioul",
    phrase: "Dépose et enlèvement de la chaudière fioul existante, avec évacuation des déchets.",
    needsTank: true,
    price: 0,
  },
  {
    id: "gas",
    code: "ENL-CHAUD-GAZ",
    label: "Enlèvement de chaudière gaz",
    phrase: "Dépose et enlèvement de la chaudière gaz existante, avec évacuation des déchets.",
    needsTank: false,
    price: 0,
  },
];

export const HEAT_PUMP_TANK_REMOVALS = [
  {
    id: "metal",
    code: "ENL-CUVE-METAL",
    label: "Enlèvement de cuve métallique",
    phrase: "Enlèvement de la cuve fioul métallique, comprenant la vidange, le dégazage et l’évacuation.",
    price: 1500,
  },
  {
    id: "plastic",
    code: "ENL-CUVE-PLAST",
    label: "Enlèvement de cuve plastique",
    phrase: "Enlèvement de la cuve fioul plastique, comprenant la vidange et l’évacuation.",
    price: 1300,
  },
];

function catalogPlain(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function textIsHeatPumpRo(value) {
  const hay = ` ${catalogPlain(value)} `;
  const pac = hay.includes(" pompe a chaleur ") || /(?:^| )pac(?: |$)/.test(hay);
  const ro = /(?:^| )ro(?: |$)/.test(hay);
  return pac && ro;
}

function articleForItem(item, articles = []) {
  if (!item) return null;
  return (articles || []).find(row =>
    (item.articleId && row?.id && String(row.id) === String(item.articleId))
    || (item.code && row?.code && String(row.code) === String(item.code))
  ) || null;
}

export function heatPumpBoilerRemovalById(id) {
  return HEAT_PUMP_BOILER_REMOVALS.find(item => item.id === id) || null;
}

export function heatPumpTankRemovalById(id) {
  return HEAT_PUMP_TANK_REMOVALS.find(item => item.id === id) || null;
}

/** Groupe de pompe à chaleur : le dossier, une ligne, ou le mot RO suffisent. */
export function bundleOffersBoilerRemoval(bundle, articles = []) {
  if (!bundle) return false;
  if (bundleIsHeatPumpRo(bundle, articles) || bundleNeedsHeatPumpEmitter(bundle, articles)) return true;
  if (isHeatPumpPath({ category: bundle.category, subcategory: bundle.subcategory || bundle.family })) return true;
  return (bundle.items || []).some(item =>
    isHeatPumpPath({ category: item?.category, subcategory: item?.subcategory })
  );
}

/** Groupe dont le nom ou une ligne porte « pompe à chaleur » et « RO ». */
export function bundleIsHeatPumpRo(bundle, articles = []) {
  if (textIsHeatPumpRo([bundle?.name, bundle?.family, bundle?.category, bundle?.subcategory].filter(Boolean).join(" "))) {
    return true;
  }
  return (bundle?.items || []).some(item => {
    if (textIsHeatPumpRo([item?.name, item?.code, item?.category, item?.subcategory, item?.description].filter(Boolean).join(" "))) {
      return true;
    }
    const article = articleForItem(item, articles);
    return Boolean(article && isHeatPumpRoArticle(article));
  });
}

function removalLine(choice, bundle, id) {
  return {
    id,
    articleId: null,
    code: choice.code,
    name: choice.label,
    description: choice.phrase,
    lineComment: choice.phrase,
    category: "Chauffage",
    subcategory: "Pompe à chaleur",
    qty: 1,
    unit: Number(choice.price || 0),
    tax: HEAT_PUMP_RO_REMOVAL_TAX,
    discountType: "percent",
    discountValue: 0,
    bundleId: bundle?.id ?? null,
    bundleName: bundle?.name || "",
  };
}

/** Lignes à poser après le groupe. La cuve n’existe que pour la chaudière fioul. */
export function heatPumpRemovalQuoteLines(choice, bundle, { idBase = Date.now() } = {}) {
  const boiler = heatPumpBoilerRemovalById(choice?.boilerId);
  if (!boiler) return [];
  const lines = [removalLine(boiler, bundle, idBase + 100)];
  if (boiler.needsTank) {
    const tank = heatPumpTankRemovalById(choice?.tankId);
    if (tank) lines.push(removalLine(tank, bundle, idBase + 101));
  }
  return lines;
}
