import { quoteBundleKey } from "./devis.js";
import { normalizeCatalogName } from "./article-taxonomy.js";

export const PV_OPTION_TAX = 5.5;

export const PV_CONNECTION_OPTIONS = [
  { id: "linky", code: "PV-RACCORD-LINKY", name: "Raccordement avec Linky en place", ttc: 400 },
  { id: "sans-linky", code: "PV-RACCORD-SANS-LINKY", name: "Raccordement sans Linky en place", ttc: 1000 },
];

export const PV_OPTIMIZER_OPTION = {
  id: "H-OPT-600W",
  code: "PV-OPTIMISEUR",
  articleCode: "H-OPT-600W",
  name: "OPTIMISEUR",
  ttc: 125,
};

export const PV_BATTERY_OPTION = {
  id: "MARSTEK-VENUS-E",
  code: "PV-BAT-MARSTEK",
  articleCode: "MARSTEK-VENUS-E",
  name: "BAT-MARTEK VENUS-E",
  ttc: 5000,
};

const OPTION_CODES = new Set([
  ...PV_CONNECTION_OPTIONS.map(option => option.code),
  PV_OPTIMIZER_OPTION.code,
  PV_BATTERY_OPTION.code,
]);

export function htForExactTtc(ttc, tax = PV_OPTION_TAX) {
  const target = Math.round(Number(ttc) * 100) / 100;
  const rate = 1 + Number(tax) / 100;
  const raw = target / rate;
  const cents = Math.round(raw * 100);
  for (const candidate of [cents - 1, cents, cents + 1]) {
    const ht = candidate / 100;
    const shown = Math.round(ht * rate * 100) / 100;
    if (shown === target) return ht;
  }
  return Math.round(raw * 100) / 100;
}

export function isPvOptionLine(item) {
  return OPTION_CODES.has(String(item?.code || item?.reference || "").trim());
}

function looksPhotovoltaic(item) {
  if (!item || isPvOptionLine(item)) return false;
  const hay = normalizeCatalogName([item.category, item.subcategory, item.name, item.code].filter(Boolean).join(" "));
  return hay.includes("photovolta")
    || hay.includes("onduleur")
    || hay.includes("optimiseur")
    || hay.includes("panneau");
}

export function isQuoteBundleEnd(items = [], index) {
  const key = quoteBundleKey(items[index]);
  if (!key) return false;
  const next = items[index + 1];
  return !next || quoteBundleKey(next) !== key;
}

export function pvBundleNeedsOptions(items = [], index) {
  if (!isQuoteBundleEnd(items, index)) return false;
  const key = quoteBundleKey(items[index]);
  const group = items.filter(item => quoteBundleKey(item) === key);
  return group.some(looksPhotovoltaic);
}

export function selectedPvOptions(items = [], index = 0) {
  const key = quoteBundleKey(items[index]);
  const group = key ? items.filter(item => quoteBundleKey(item) === key) : [];
  const connection = PV_CONNECTION_OPTIONS.find(option => group.some(item => item.code === option.code));
  return {
    connection: connection?.id || "",
    optimizer: group.some(item => item.code === PV_OPTIMIZER_OPTION.code) ? PV_OPTIMIZER_OPTION.id : "",
    battery: group.some(item => item.code === PV_BATTERY_OPTION.code) ? PV_BATTERY_OPTION.id : "",
  };
}

function articleByCode(articles, spec) {
  const wanted = [spec?.articleCode, spec?.code, spec?.name]
    .map(value => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  if (!wanted.length) return null;
  return (articles || []).find(article => {
    const fields = [article.code, article.reference, article.name, article.designation]
      .map(value => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    return wanted.some(code => fields.includes(code));
  }) || null;
}

function optionLine(spec, sample, article) {
  const description = String(article?.description || "").trim();
  return {
    id: spec.idSeed,
    articleId: article?.id || null,
    code: spec.code,
    name: article?.name || spec.name,
    description,
    lineComment: description,
    category: "Photovoltaïque",
    subcategory: article?.subcategory || spec.subcategory || "",
    qty: 1,
    unit: htForExactTtc(spec.ttc, PV_OPTION_TAX),
    tax: PV_OPTION_TAX,
    discountType: "percent",
    discountValue: 0,
    measureUnit: article?.unit || "Unité",
    bundleId: sample?.bundleId ?? null,
    bundleName: sample?.bundleName || "",
    bundleHeading: sample?.bundleHeading || sample?.bundleName || "",
    forfait: false,
    forfaitHt: null,
  };
}

export function applyPvBundleOptions(items = [], index, patch = {}, articles = []) {
  const list = Array.isArray(items) ? [...items] : [];
  const key = quoteBundleKey(list[index]);
  if (!key) return list;
  const group = list.filter(item => quoteBundleKey(item) === key);
  if (!group.some(looksPhotovoltaic)) return list;
  const choice = { ...selectedPvOptions(list, index), ...patch };
  const sample = list.find(item => quoteBundleKey(item) === key && !isPvOptionLine(item)) || list[index];
  const kept = [];
  let inserted = false;
  const extras = [];
  const connection = PV_CONNECTION_OPTIONS.find(option => option.id === choice.connection);
  if (connection) {
    const previous = list.find(item => quoteBundleKey(item) === key && item.code === connection.code);
    extras.push(optionLine({ ...connection, idSeed: previous?.id || `pv-linky-${connection.id}` }, sample, articleByCode(articles, connection)));
  }
  if (choice.optimizer === PV_OPTIMIZER_OPTION.id) {
    const previous = list.find(item => quoteBundleKey(item) === key && item.code === PV_OPTIMIZER_OPTION.code);
    extras.push(optionLine(
      { ...PV_OPTIMIZER_OPTION, idSeed: previous?.id || "pv-optimiseur", subcategory: "Optimiseur" },
      sample,
      articleByCode(articles, PV_OPTIMIZER_OPTION)
    ));
  }
  if (choice.battery === PV_BATTERY_OPTION.id) {
    const previous = list.find(item => quoteBundleKey(item) === key && item.code === PV_BATTERY_OPTION.code);
    extras.push(optionLine(
      { ...PV_BATTERY_OPTION, idSeed: previous?.id || "pv-batterie", subcategory: "Batteries" },
      sample,
      articleByCode(articles, PV_BATTERY_OPTION)
    ));
  }
  for (const item of list) {
    if (quoteBundleKey(item) !== key) {
      kept.push(item);
      continue;
    }
    if (isPvOptionLine(item)) continue;
    kept.push(item);
    const lastOfGroup = list.filter(row => quoteBundleKey(row) === key && !isPvOptionLine(row)).at(-1);
    if (!inserted && item === lastOfGroup) {
      kept.push(...extras);
      inserted = true;
    }
  }
  if (!inserted) {
    const lastIndex = kept.findLastIndex(item => quoteBundleKey(item) === key);
    kept.splice(lastIndex + 1, 0, ...extras);
  }
  return kept;
}
