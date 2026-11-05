import { articleMatchesBundleItem, buildBundleItemFromArticle, normalizeBundle, pickerAccessoryKind } from "./article-picker.js";
import { isClimatisationBundle, isClimSplitOutdoorArticle, multiSplitIndoorCount, validateMultiSplitBundle, withClimStandardAccessories } from "./clim-multisplit-bundle.js";
import { isHeatPumpPath } from "./heat-pump-specs.js";

export const BUNDLE_SELECT =
  "id,organization_id,name,category,subcategory,brand,family,items,actif,created_at,updated_at,created_by";

export const MISSING_BUNDLE_TABLE_MESSAGE =
  "Table des groupes absente. Appliquez la migration 20260917_article_bundles.sql dans Supabase.";

export function isMissingBundleTable(error) {
  return /article_bundles|relation|does not exist/i.test(String(error?.message || error || ""));
}

function parseItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function bundleToUi(row) {
  if (!row) return null;
  return normalizeBundle({
    id: row.id,
    name: row.name || "",
    category: row.category || "",
    subcategory: row.subcategory || "",
    brand: row.brand || "",
    family: row.family || "",
    items: parseItems(row.items),
    active: row.actif !== false,
    status: row.actif !== false ? "Actif" : "Inactif",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  });
}

export function formToBundleRecord(input, { organizationId, createdBy } = {}) {
  const normalized = normalizeBundle({
    ...input,
    items: parseItems(input.items),
  });
  const hasExplicit = input.actif !== undefined || input.status !== undefined;
  const active = hasExplicit
    ? input.actif === true || input.actif === "true" || input.status === "Actif"
    : normalized.active !== false;
  return {
    organization_id: organizationId,
    name: normalized.name,
    category: normalized.category || "",
    subcategory: normalized.subcategory || null,
    brand: normalized.brand || null,
    family: normalized.family || normalized.subcategory || normalized.category || null,
    items: normalized.items,
    actif: Boolean(active),
    created_by: createdBy || null,
    updated_at: new Date().toISOString(),
  };
}

export function bundleBrandLabel(bundle) {
  const named = String(bundle?.brand || "").trim();
  if (named) return named;
  const principal = (bundle?.items || []).find(item => (item.role || "principal") === "principal");
  return String(principal?.brand || "").trim() || "Sans marque";
}

export function groupBundlesByBrand(bundles = []) {
  const groups = new Map();
  for (const bundle of bundles || []) {
    const brand = bundleBrandLabel(bundle);
    if (!groups.has(brand)) groups.set(brand, []);
    groups.get(brand).push(bundle);
  }
  return [...groups.keys()]
    .sort((left, right) => {
      if (left === "Sans marque") return 1;
      if (right === "Sans marque") return -1;
      return left.localeCompare(right, "fr");
    })
    .map(brand => ({ brand, bundles: groups.get(brand) }));
}

function bundleSearchKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function bundleSearchHaystack(bundle = {}) {
  const items = (bundle.items || [])
    .map(item => `${item.code || ""} ${item.name || ""} ${item.brand || ""}`)
    .join(" ");
  return bundleSearchKey(
    `${bundle.name || ""} ${bundle.family || ""} ${bundle.brand || ""} ${bundle.category || ""} ${bundle.subcategory || ""} ${items}`
  );
}

export function matchesBundleSearch(bundle, query = "") {
  const words = bundleSearchKey(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = bundleSearchHaystack(bundle);
  return words.every(word => hay.includes(word));
}

export function bundleCoversOutdoor(bundle, article) {
  return (bundle?.items || []).some(item => (
    (item.role || "principal") === "principal" && articleMatchesBundleItem(article, item)
  ));
}

export function orgArticlesSelectPath(orgId) {
  return `/rest/v1/articles?select=id,organization_id,reference,designation,categorie,sous_categorie,marque,prix_vente_ht,taux_tva,unite,actif,source_reference&organization_id=eq.${encodeURIComponent(orgId)}&actif=eq.true&order=reference.asc`;
}

export function applyClimStandardAccessories(record, articles = []) {
  if (!record || !isClimatisationBundle(record)) return record;
  const items = withClimStandardAccessories(record.items, articles, record);
  if (items.length === (record.items || []).length && items.every((item, index) => item === (record.items || [])[index])) {
    return record;
  }
  return { ...record, items };
}

export function climBundlesNeedingStandardAccessories(bundles = [], articles = []) {
  return (bundles || []).flatMap(bundle => {
    const next = applyClimStandardAccessories(bundle, articles);
    if (next === bundle) return [];
    return [next];
  });
}

function catalogPlain(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function articleHay(article) {
  return catalogPlain([article?.name, article?.designation, article?.code, article?.reference].filter(Boolean).join(" "));
}

function isActiveCatalogArticle(article) {
  return Boolean(article) && article.status !== "Inactif" && article.active !== false;
}

export function isHeatPumpMachineArticle(article) {
  if (!isActiveCatalogArticle(article) || pickerAccessoryKind(article)) return false;
  const hay = articleHay(article);
  if (hay.includes("fourniture") || hay.includes("installation") || /\bpose\b/.test(` ${hay} `)) return false;
  const family = catalogPlain(article.category || article.categorie);
  if (family.startsWith("climatis") || family.startsWith("photovolta") || family.startsWith("ballon")) return false;
  if (/ballon/.test(hay) && !/pompe a chaleur|\bpac\b/.test(` ${hay} `)) return false;
  return isHeatPumpPath({
    category: article.category || article.categorie,
    subcategory: article.subcategory || article.sous_categorie,
    sourceReference: article.sourceReference || article.source_reference,
  });
}

function isPacRoAccessory(article, role) {
  if (!isActiveCatalogArticle(article)) return false;
  const hay = ` ${articleHay(article)} `;
  const pac = hay.includes(" pompe a chaleur ") || /\bpac\b/.test(hay);
  if (!pac || !/\bro\b/.test(hay)) return false;
  if (role === "supply") return hay.includes("fourniture");
  return (hay.includes("installation") || /\bpose\b/.test(hay)) && !hay.includes("fourniture");
}

function bundleLooksLikeHeatPump(bundle, articles = []) {
  const principal = (bundle?.items || []).find(item => (item.role || "principal") === "principal");
  if (!principal) return false;
  const article = (articles || []).find(row => articleMatchesBundleItem(row, principal));
  if (article && isHeatPumpMachineArticle(article)) return true;
  const hay = ` ${catalogPlain([principal.name, principal.category, principal.subcategory, bundle?.category, bundle?.subcategory].join(" "))} `;
  return hay.includes(" pompe a chaleur ") || /\bpac\b/.test(hay);
}

function sameCatalogArticle(left, right) {
  if (!left || !right) return false;
  const leftId = String(left.id || left.articleId || "");
  const rightId = String(right.id || right.articleId || "");
  if (leftId && rightId && leftId === rightId) return true;
  const leftCode = String(left.code || left.reference || "").trim().toLowerCase();
  const rightCode = String(right.code || right.reference || "").trim().toLowerCase();
  return Boolean(leftCode && rightCode && leftCode === rightCode);
}

function sharedPacAccessory(articles = [], bundles = [], role) {
  const found = [];
  for (const bundle of bundles || []) {
    if (!bundleLooksLikeHeatPump(bundle, articles)) continue;
    for (const item of bundle.items || []) {
      if ((item.role || "principal") === "principal" || item.role !== role) continue;
      const article = (articles || []).find(row => articleMatchesBundleItem(row, item));
      if (article) found.push(article);
    }
  }
  const named = found.filter(article => isPacRoAccessory(article, role));
  const pool = named.length ? named : found;
  const counts = new Map();
  for (const article of pool) {
    const key = String(article.id || article.code || "");
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  const winner = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  if (winner) return (articles || []).find(article => String(article.id || article.code || "") === winner[0]) || null;
  return (articles || []).find(article => isPacRoAccessory(article, role)) || null;
}

export function heatPumpBundleDrafts(articles = [], bundles = []) {
  const supply = sharedPacAccessory(articles, bundles, "supply");
  const labor = sharedPacAccessory(articles, bundles, "labor");
  if (!supply || !labor || sameCatalogArticle(supply, labor)) return [];
  return (articles || []).filter(isHeatPumpMachineArticle).flatMap(article => {
    if ((bundles || []).some(bundle => bundleCoversOutdoor(bundle, article))) return [];
    if (sameCatalogArticle(article, supply) || sameCatalogArticle(article, labor)) return [];
    const items = [
      buildBundleItemFromArticle(article, { role: "principal", qty: 1 }),
      buildBundleItemFromArticle(supply, { role: "supply", qty: 1 }),
      buildBundleItemFromArticle(labor, { role: "labor", qty: 1 }),
    ];
    return [{
      name: String(article.name || article.designation || article.code || "").trim(),
      category: article.category || article.categorie || "Chauffage",
      subcategory: article.subcategory || article.sous_categorie || "Pompe à chaleur",
      brand: article.brand || article.marque || "",
      family: article.subcategory || article.sous_categorie || "Pompe à chaleur",
      items,
      active: true,
      status: "Actif",
    }];
  }).filter(draft => draft.name);
}

export function outdoorBundleDrafts(articles = [], bundles = []) {
  return (articles || []).filter(isClimSplitOutdoorArticle).flatMap(article => {
    if ((bundles || []).some(bundle => bundleCoversOutdoor(bundle, article))) return [];
    if (multiSplitIndoorCount(article) && !article.brand && !article.brandId) return [];
    const draft = {
      name: String(article.name || article.designation || article.code || "").trim(),
      category: "Climatisation",
      subcategory: article.subcategory || article.sous_categorie || "",
      brand: article.brand || article.marque || "",
      family: article.subcategory || article.sous_categorie || "Climatisation",
      items: [buildBundleItemFromArticle(article, { role: "principal", qty: 1 })],
      active: true,
      status: "Actif",
    };
    return [applyClimStandardAccessories(draft, articles)];
  }).filter(draft => draft.name);
}

export function validateBundlePayload(record) {
  const errors = [];
  if (!record?.name) errors.push("Le nom du groupe est obligatoire.");
  if (!record?.category) errors.push("La catégorie du groupe est obligatoire.");
  const items = Array.isArray(record?.items) ? record.items : [];
  if (!items.some(item => (item.role || "principal") === "principal")) {
    errors.push("Ajoutez au moins un matériel principal.");
  }
  errors.push(...validateMultiSplitBundle(record));
  return errors;
}
