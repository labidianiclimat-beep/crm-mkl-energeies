import { normalizeReference } from "./articles.js";
import { normalizeCatalogName, taxonomyNamesEqual } from "./article-taxonomy.js";
import { isClimConsoleName, isClimIndoorPath } from "./clim-indoor-specs.js";
import { isClimOutdoorPath } from "./clim-outdoor-specs.js";
import { articleMatchesBundleItem, buildBundleItemFromArticle, pickerAccessoryKind } from "./article-picker.js";

export const CLIM_STANDARD_SUPPLY_CODE = "FRN-R.R";
export const CLIM_STANDARD_LABOR_CODE = "INST-R.R";
export const CLIM_STANDARD_ACCESSORY_CODES = [
  { code: CLIM_STANDARD_SUPPLY_CODE, role: "supply" },
  { code: CLIM_STANDARD_LABOR_CODE, role: "labor" },
];

export const MULTI_SPLIT_INDOOR_COUNTS = {
  "bi-split": 2,
  bisplit: 2,
  "bi split": 2,
  "b-split": 2,
  "b split": 2,
  "tri-split": 3,
  trisplit: 3,
  "tri split": 3,
  "quadri-split": 4,
  quadrisplit: 4,
  "quadri split": 4,
  "penta-split": 5,
  pentasplit: 5,
  "penta split": 5,
  "5 unites": 5,
  "5 unite": 5,
  "cinq unites": 5,
  "cinq unite": 5,
  "5 sorties": 5,
  "cinq sorties": 5,
};

const RANGE_STOPWORDS = new Set([
  "split",
  "groupe",
  "exterieur",
  "interieur",
  "unite",
  "unites",
  "clim",
  "climatisation",
  "pack",
  "kit",
  "console",
  "gainable",
  "mono",
  "bi",
  "tri",
  "quadri",
  "penta",
  "fourniture",
  "installation",
  "pose",
  "kw",
  "r32",
  "r410a",
]);

function tokens(value) {
  return normalizeCatalogName(value)
    .split(/[^a-z0-9]+/)
    .filter(token => token && token.length >= 2 && !RANGE_STOPWORDS.has(token) && !/^\d+$/.test(token));
}

export function multiSplitIndoorCount(value) {
  const raw = typeof value === "object" && value
    ? value.subcategory || value.sous_categorie || value.name || value.family || ""
    : value;
  const normalized = normalizeCatalogName(raw);
  if (!normalized) return 0;
  if (MULTI_SPLIT_INDOOR_COUNTS[normalized]) return MULTI_SPLIT_INDOOR_COUNTS[normalized];
  const compact = normalized.replace(/\s+/g, " ");
  if (MULTI_SPLIT_INDOOR_COUNTS[compact]) return MULTI_SPLIT_INDOOR_COUNTS[compact];
  const dashed = compact.replace(/\s/g, "-");
  if (MULTI_SPLIT_INDOOR_COUNTS[dashed]) return MULTI_SPLIT_INDOOR_COUNTS[dashed];
  if (/(^|[^a-z])penta([^a-z]|$)/.test(normalized) || /(^|[^a-z])(5|cinq)([^a-z].*)?(unites?|sorties)([^a-z]|$)/.test(normalized)) {
    return 5;
  }
  return 0;
}

export function isMultiSplitPath(path = {}) {
  return Boolean(multiSplitIndoorCount(path.subcategory || path.name || path));
}

export function articleBrandId(article) {
  return String(article?.brandId || article?.brand_id || "").trim();
}

export function articleBrandName(article) {
  return normalizeCatalogName(article?.brand || article?.marque || "");
}

export function sameArticleBrand(left, right) {
  const leftId = articleBrandId(left);
  const rightId = articleBrandId(right);
  if (leftId && rightId) return leftId === rightId;
  const leftName = articleBrandName(left);
  const rightName = articleBrandName(right);
  if (!leftName || !rightName) return false;
  return leftName === rightName;
}

export function articleRangeId(article) {
  return String(article?.rangeId || article?.range_id || "").trim();
}

export function articleRangeKey(article) {
  const explicit = normalizeCatalogName(article?.range || article?.gamme || "");
  if (explicit) return explicit;
  const brandParts = tokens(article?.brand || article?.marque || "");
  if (brandParts.length > 1) return brandParts.slice(1).join(" ");
  return "";
}

export function indoorMatchesOutdoorRange(indoor, outdoor) {
  const rangeId = articleRangeId(outdoor);
  if (rangeId) {
    const indoorRangeId = articleRangeId(indoor);
    if (indoorRangeId) return indoorRangeId === rangeId;
  }
  const range = articleRangeKey(outdoor);
  if (!range) return true;
  const hay = tokens([
    indoor?.brand,
    indoor?.marque,
    indoor?.range,
    indoor?.gamme,
    indoor?.name,
    indoor?.designation,
    indoor?.code,
  ].filter(Boolean).join(" "));
  return range.split(" ").every(token => hay.includes(token));
}

export function isClimConsoleArticle(article) {
  if (!article) return false;
  const category = article.category || article.categorie || "";
  const subcategory = article.subcategory || article.sous_categorie || "";
  const name = article.name || article.designation || "";
  if (!isClimConsoleName(subcategory) && !isClimConsoleName(name) && !isClimConsoleName(category)) return false;
  return !category
    || taxonomyNamesEqual(category, "Climatisation")
    || normalizeCatalogName(category).startsWith("climatis")
    || isClimConsoleName(category);
}

export function isClimIndoorArticle(article) {
  if (!article) return false;
  if (isClimIndoorPath({
    category: article.category || article.categorie,
    subcategory: article.subcategory || article.sous_categorie,
    sourceReference: article.sourceReference || article.source_reference,
  })) return true;
  if (isClimConsoleArticle(article)) return true;
  const category = article.category || article.categorie || "";
  const subcategory = article.subcategory || article.sous_categorie || "";
  const clim = !category || taxonomyNamesEqual(category, "Climatisation") || normalizeCatalogName(category).startsWith("climatis");
  return clim && taxonomyNamesEqual(subcategory, "Gainable");
}

export function isClimOutdoorArticle(article) {
  return isClimOutdoorPath({
    category: article.category || article.categorie,
    subcategory: article.subcategory || article.sous_categorie,
    sourceReference: article.sourceReference || article.source_reference,
  });
}

export function isClimSplitOutdoorArticle(article) {
  if (!article) return false;
  if (article.status === "Inactif" || article.active === false) return false;
  if (isClimIndoorArticle(article) || isClimConsoleArticle(article) || isMultiSplitAccessoryArticle(article)) {
    return false;
  }
  if (isClimOutdoorArticle(article)) return true;
  const category = article.category || article.categorie || "";
  const subcategory = article.subcategory || article.sous_categorie || "";
  const clim = taxonomyNamesEqual(category, "Climatisation") || normalizeCatalogName(category).startsWith("climatis");
  if (!clim) return false;
  return taxonomyNamesEqual(subcategory, "Mono-split") || /^mono[-\s]?split$/.test(normalizeCatalogName(subcategory));
}

function isClimFamilyArticle(article) {
  const category = article?.category || article?.categorie || "";
  return taxonomyNamesEqual(category, "Climatisation") || normalizeCatalogName(category).startsWith("climatis");
}

function articleCodeKey(value) {
  return normalizeReference(value?.code || value?.reference || value || "");
}

export function isClimatisationBundle(bundle = {}) {
  const category = bundle.category || bundle.categorie || "";
  if (taxonomyNamesEqual(category, "Climatisation") || normalizeCatalogName(category).startsWith("climatis")) {
    return true;
  }
  return (bundle.items || []).some(item => (
    isClimFamilyArticle(item)
    || isClimOutdoorArticle(item)
    || isClimIndoorArticle(item)
    || isClimSplitOutdoorArticle(item)
  ));
}

export function findCatalogArticleByCode(articles = [], code) {
  const target = articleCodeKey(code);
  if (!target) return null;
  return (articles || []).find(article => {
    if (!article || article.status === "Inactif" || article.active === false) return false;
    return articleCodeKey(article) === target;
  }) || null;
}

function itemMatchesCode(item, code) {
  return Boolean(item) && articleCodeKey(item) === articleCodeKey(code);
}

export function withClimStandardAccessories(items = [], articles = [], bundle = null) {
  if (bundle && !isClimatisationBundle({ ...bundle, items })) return [...(items || [])];
  if (!bundle && !(items || []).some(item => isClimFamilyArticle(item) || isClimOutdoorArticle(item) || isClimIndoorArticle(item) || isClimSplitOutdoorArticle(item))) {
    return [...(items || [])];
  }
  const next = [...(items || [])];
  for (const accessory of CLIM_STANDARD_ACCESSORY_CODES) {
    const article = findCatalogArticleByCode(articles, accessory.code);
    if (!article) continue;
    if (next.some(item => articleMatchesBundleItem(article, item) || itemMatchesCode(item, accessory.code))) continue;
    next.push(buildBundleItemFromArticle(article, { role: accessory.role, qty: 1 }));
  }
  return next;
}

export function isCombinedFournitureInstallationArticle(article) {
  const hay = normalizeCatalogName(article?.name || article?.designation || "");
  return hay.includes("fourniture") && hay.includes("installation");
}

export const isFournitureInstallationArticle = isCombinedFournitureInstallationArticle;

export function isClimFournitureArticle(article) {
  if (!article || !isClimFamilyArticle(article) || isCombinedFournitureInstallationArticle(article)) return false;
  if (pickerAccessoryKind(article) === "fourniture") return true;
  const subcategory = article.subcategory || article.sous_categorie || "";
  if (taxonomyNamesEqual(subcategory, "Fourniture") || taxonomyNamesEqual(subcategory, "Fournitures")) return true;
  return /^(petite )?fournitures?$/.test(normalizeCatalogName(article.name || article.designation || ""));
}

export function isClimInstallationArticle(article) {
  if (!article || !isClimFamilyArticle(article) || isCombinedFournitureInstallationArticle(article)) return false;
  if (pickerAccessoryKind(article) === "installation") return true;
  const subcategory = article.subcategory || article.sous_categorie || "";
  if (taxonomyNamesEqual(subcategory, "Installation") || taxonomyNamesEqual(subcategory, "Pose")) return true;
  return /^(pose|installation)$/.test(normalizeCatalogName(article.name || article.designation || ""));
}

export function isMultiSplitAccessoryArticle(article) {
  return isClimFournitureArticle(article) || isClimInstallationArticle(article) || isCombinedFournitureInstallationArticle(article);
}

function preferredClimAccessory(articles, kind) {
  const list = (articles || []).filter(kind === "installation" ? isClimInstallationArticle : isClimFournitureArticle);
  if (!list.length) return null;
  const exact = list.find(article => {
    const name = normalizeCatalogName(article.name || article.designation || "");
    return kind === "installation" ? /^(pose|installation)$/.test(name) : /^(petite )?fournitures?$/.test(name);
  });
  return exact || list[0];
}

export function findClimFourniture(articles = []) {
  return preferredClimAccessory(articles, "fourniture");
}

export function findClimInstallation(articles = []) {
  return preferredClimAccessory(articles, "installation");
}

export function findClimAccessories(articles = []) {
  return {
    fourniture: findClimFourniture(articles),
    installation: findClimInstallation(articles),
  };
}

export function findFournitureInstallation(articles = [], _outdoor) {
  return findClimFourniture(articles);
}

export function indoorUnitsForOutdoor(articles = [], outdoor) {
  if (!outdoor) return [];
  if (!articleBrandId(outdoor) && !articleBrandName(outdoor)) return [];
  return (articles || []).filter(article => {
    if (article === outdoor) return false;
    if (String(article.id || "") && String(article.id) === String(outdoor.id || "")) return false;
    if (!isClimIndoorArticle(article) && !isClimConsoleArticle(article)) return false;
    if (isClimOutdoorArticle(article)) return false;
    if (isMultiSplitAccessoryArticle(article)) return false;
    if (!sameArticleBrand(article, outdoor)) return false;
    if (isClimConsoleArticle(article)) return true;
    return indoorMatchesOutdoorRange(article, outdoor);
  }).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr"));
}

export function syncIndoorSlots(currentIds = [], count, candidates = []) {
  const allowed = new Set(candidates.map(item => String(item.id || item.code || "")));
  const next = Array.from({ length: Math.max(0, Number(count) || 0) }, (_, index) => {
    const value = String(currentIds[index] || "");
    if (!value) return "";
    return allowed.has(value) ? value : "";
  });
  return next;
}

function findArticleBySlot(candidates, slotId) {
  if (!slotId) return null;
  return candidates.find(item => String(item.id || "") === String(slotId) || String(item.code || "") === String(slotId)) || null;
}

export function selectedIndoorUnitCount(indoorIds = [], indoorCandidates = []) {
  return (indoorIds || []).filter(slotId => findArticleBySlot(indoorCandidates, slotId)).length;
}

function scaleClimAccessoryQty(items = [], quantity) {
  const qty = Number(quantity) || 0;
  if (qty < 1) return items;
  return items.map(item => {
    const supply = item?.role === "supply" || isClimFournitureArticle(item) || itemMatchesCode(item, CLIM_STANDARD_SUPPLY_CODE);
    const labor = item?.role === "labor" || isClimInstallationArticle(item) || itemMatchesCode(item, CLIM_STANDARD_LABOR_CODE);
    if (!supply && !labor) return item;
    return { ...item, qty };
  });
}

export function extraMultiSplitBundleItems(items = [], outdoor = null) {
  return (items || []).filter(item => {
    if (!item) return false;
    if (isClimIndoorArticle(item)) return false;
    if (outdoor && articleMatchesBundleItem(item, outdoor)) return false;
    if (isClimOutdoorArticle(item) && (item.role || "principal") === "principal") return false;
    return true;
  });
}

function extraRole(article) {
  if (article?.role) return article.role;
  if (isClimInstallationArticle(article)) return "labor";
  if (isClimFournitureArticle(article)) return "supply";
  return articleBundleRoleFallback(article);
}

function articleBundleRoleFallback(article) {
  if (isMultiSplitAccessoryArticle(article)) {
    return isClimInstallationArticle(article) ? "labor" : "supply";
  }
  return "principal";
}

function toBundleExtra(article) {
  const built = buildBundleItemFromArticle(article, { role: extraRole(article), qty: Number(article.qty || 1) });
  return { ...built, qty: Number(article.qty || built.qty || 1) };
}

export function composeMultiSplitBundleItems({
  outdoor,
  indoorIds = [],
  indoorCandidates = [],
  extras = [],
  fourniture = null,
  installation = null,
  count,
} = {}) {
  if (!outdoor) return [];
  const slots = syncIndoorSlots(indoorIds, count, indoorCandidates);
  const items = [buildBundleItemFromArticle(outdoor, { role: "principal", qty: 1 })];
  for (const slotId of slots) {
    const indoor = findArticleBySlot(indoorCandidates, slotId);
    if (!indoor) continue;
    const existing = items.find(item => articleMatchesBundleItem(indoor, item));
    if (existing) {
      existing.qty = Number(existing.qty || 1) + 1;
      continue;
    }
    items.push(buildBundleItemFromArticle(indoor, { role: "principal", qty: 1 }));
  }
  const extraItems = [...extras];
  if (fourniture) extraItems.push(fourniture);
  if (installation) extraItems.push(installation);
  for (const extra of extraItems) {
    if (!extra) continue;
    items.push(toBundleExtra(extra));
  }
  return items;
}

export function parseMultiSplitBundle(bundle = {}, articles = []) {
  const count = multiSplitIndoorCount(bundle);
  const items = Array.isArray(bundle?.items) ? bundle.items : [];
  const outdoorItem = items.find(item => isClimOutdoorArticle(item) || ((item.role || "principal") === "principal" && !isClimIndoorArticle(item) && !isMultiSplitAccessoryArticle(item)));
  const outdoor = outdoorItem
    ? (articles || []).find(article => articleMatchesBundleItem(article, outdoorItem)) || outdoorItem
    : null;
  const indoorItems = items.filter(item => isClimIndoorArticle(item));
  const indoorIds = indoorItems.flatMap(item => {
    const id = String(item.articleId || item.id || item.code || "");
    return Array.from({ length: Math.max(1, Number(item.qty || 1)) }, () => id);
  });
  return {
    count,
    outdoor,
    indoorIds,
    fournitureItem: items.find(item => item.role === "supply" || isClimFournitureArticle(item)) || null,
    installationItem: items.find(item => item.role === "labor" || isClimInstallationArticle(item)) || null,
  };
}

export function multiSplitBundleError({ outdoor, count } = {}) {
  if (!outdoor) return "Sélectionnez le groupe extérieur multi-split.";
  if (!count) return "Le nombre de sorties du groupe ne peut pas être déterminé.";
  if (!articleBrandId(outdoor) && !articleBrandName(outdoor)) {
    return "La marque ou la gamme du groupe ne peut pas être déterminée.";
  }
  return "";
}

export function multiSplitSelectionError({ outdoor, count } = {}) {
  return multiSplitBundleError({ outdoor, count });
}

export function expandMultiSplitBundleForQuote(bundle = {}, articles = [], indoorIds = []) {
  const parsed = parseMultiSplitBundle(bundle, articles);
  const count = parsed.count || multiSplitIndoorCount(bundle);
  const outdoor = parsed.outdoor;
  const indoorCandidates = indoorUnitsForOutdoor(articles, outdoor);
  const extras = extraMultiSplitBundleItems(bundle.items, outdoor);
  const items = scaleClimAccessoryQty(withClimStandardAccessories(composeMultiSplitBundleItems({
    outdoor,
    indoorIds,
    indoorCandidates,
    extras,
    count,
  }), articles, bundle), selectedIndoorUnitCount(indoorIds, indoorCandidates));
  return {
    count,
    outdoor,
    indoorCandidates,
    extras,
    fourniture: items.find(item => item.role === "supply" || isClimFournitureArticle(item) || itemMatchesCode(item, CLIM_STANDARD_SUPPLY_CODE)) || null,
    installation: items.find(item => item.role === "labor" || isClimInstallationArticle(item) || itemMatchesCode(item, CLIM_STANDARD_LABOR_CODE)) || null,
    items,
  };
}

export function validateMultiSplitBundle(record = {}) {
  const count = multiSplitIndoorCount(record);
  if (!count) return [];
  const items = Array.isArray(record.items) ? record.items : [];
  const outdoor = items.find(item => isClimOutdoorArticle(item) || ((item.role || "principal") === "principal" && !isClimIndoorArticle(item) && !isMultiSplitAccessoryArticle(item)));
  if (!outdoor) return ["Sélectionnez le groupe extérieur multi-split."];
  if (!articleBrandId(outdoor) && !articleBrandName(outdoor)) {
    return ["La marque ou la gamme du groupe ne peut pas être déterminée."];
  }
  const indoors = items.filter(isClimIndoorArticle);
  const incompatible = indoors.filter(item => !sameArticleBrand(item, outdoor) || !indoorMatchesOutdoorRange(item, outdoor));
  if (incompatible.length) {
    return ["Les unités intérieures doivent appartenir à la même marque et à la même gamme que le groupe."];
  }
  return [];
}
