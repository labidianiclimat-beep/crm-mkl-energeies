/** Parcours devis : Catégorie → Marque → Matériel (Phase 1). */

import { matchesArticleSearch, normalizeText } from "./articles.js";
import { findBrandLogo } from "./brands.js";

/**
 * Catégories du parcours commercial.
 * Main-d’œuvre n’est PAS une catégorie racine : elle vit comme articles
 * dans chaque famille (ex. Pose PV sous Photovoltaïque).
 * Les `aliases` permettent de rattacher le catalogue actuel (texte libre).
 */
export const DEVIS_PICKER_CATEGORIES = [
  {
    code: "climatisation",
    label: "Climatisation",
    description: "Splits, multi-splits et accessoires associés",
    icon: "Snowflake",
    aliases: ["climatisation", "clim", "air/air", "air air"],
  },
  {
    code: "chauffage",
    label: "Chauffage",
    description: "PAC, poêles et solutions de chauffage",
    icon: "Flame",
    aliases: ["chauffage", "pompe a chaleur", "pac", "poele", "poêle"],
  },
  {
    code: "radiateur-electrique",
    label: "Radiateur électrique",
    description: "Radiateurs, convecteurs et inertie électrique",
    icon: "Heater",
    aliases: ["radiateur electrique", "radiateur", "convecteur", "inertie"],
  },
  {
    code: "isolation-exterieure",
    label: "Isolation extérieure",
    description: "ITE et solutions d’enveloppe du bâtiment",
    icon: "Home",
    aliases: ["isolation exterieure", "isolation", "ite"],
  },
  {
    code: "ballon-thermodynamique",
    label: "Ballon thermodynamique",
    description: "ECS thermodynamique et ballons associés",
    icon: "Droplets",
    aliases: ["ballon thermodynamique", "ballon", "ecs"],
  },
  {
    code: "adoucisseur-eau",
    label: "Adoucisseur d’eau",
    description: "Adoucisseurs, filtres et pose associée",
    icon: "Waves",
    aliases: ["adoucisseur d eau", "adoucisseur", "eau douce"],
  },
  {
    code: "vmc",
    label: "VMC",
    description: "Ventilation mécanique contrôlée",
    icon: "Wind",
    aliases: ["vmc", "ventilation"],
  },
  {
    code: "photovoltaique",
    label: "Photovoltaïque",
    description: "Panneaux, onduleurs, pose et équipements PV",
    icon: "Sun",
    aliases: ["photovoltaique", "photovoltaïque", "pv", "solaire", "panneau"],
  },
];

export function articleHaystack(article = {}) {
  return normalizeText(
    `${article.category || article.categorie || ""} ${article.subcategory || article.sous_categorie || ""} ${article.name || article.designation || ""} ${article.code || article.reference || ""} ${article.brand || article.marque || ""}`
  );
}

export function articleMatchesPickerCategory(article, category) {
  if (!article || !category) return false;
  const haystack = articleHaystack(article);
  return (category.aliases || []).some(alias => haystack.includes(normalizeText(alias)));
}

export function isArticleActive(article) {
  if (!article) return false;
  if (article.active === false || article.actif === false) return false;
  if (article.status === "Inactif") return false;
  return true;
}

export function filterActiveArticles(articles = [], { includeInactive = false } = {}) {
  if (includeInactive) return [...articles];
  return articles.filter(isArticleActive);
}

export function articlesForPickerCategory(articles = [], categoryCode, { includeInactive = false } = {}) {
  const category = DEVIS_PICKER_CATEGORIES.find(item => item.code === categoryCode);
  if (!category) return [];
  return filterActiveArticles(articles, { includeInactive }).filter(article =>
    articleMatchesPickerCategory(article, category)
  );
}

export function brandsForCategory(articles = [], categoryCode, { includeInactive = false, brandCatalog = [] } = {}) {
  const list = articlesForPickerCategory(articles, categoryCode, { includeInactive });
  const map = new Map();
  for (const article of list) {
    const brand = String(article.brand || article.marque || "").trim() || "Autres";
    const key = normalizeText(brand) || "autres";
    if (!map.has(key)) map.set(key, { name: brand, count: 0, logoUrl: "" });
    map.get(key).count += 1;
  }
  for (const entry of map.values()) {
    entry.logoUrl = findBrandLogo(brandCatalog, entry.name);
  }
  return [...map.values()].sort((a, b) => {
    if (a.name === "Autres") return 1;
    if (b.name === "Autres") return -1;
    return a.name.localeCompare(b.name, "fr");
  });
}

export function materialsForBrand(articles = [], categoryCode, brandName, { includeInactive = false, query = "", sort = "name" } = {}) {
  const brandKey = normalizeText(brandName || "Autres");
  let list = articlesForPickerCategory(articles, categoryCode, { includeInactive }).filter(article => {
    const brand = String(article.brand || article.marque || "").trim() || "Autres";
    return (normalizeText(brand) || "autres") === brandKey;
  });
  if (query) list = list.filter(article => matchesArticleSearch(article, query));
  const sorted = [...list];
  if (sort === "code") {
    sorted.sort((a, b) => String(a.code || "").localeCompare(String(b.code || ""), "fr"));
  } else if (sort === "price") {
    sorted.sort((a, b) => Number(a.sell || 0) - Number(b.sell || 0));
  } else {
    sorted.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr"));
  }
  return sorted;
}

export function buildQuoteLineFromArticle(article, overrides = {}, defaults = {}) {
  const tax = Number(overrides.tax ?? article.tax ?? defaults.tax ?? 20);
  const qty = Math.max(0.01, Number(overrides.qty ?? 1));
  const unit = Number(overrides.unit ?? article.sell ?? 0);
  return {
    id: overrides.id || Date.now() + Math.floor(Math.random() * 1000),
    articleId: article.id,
    code: article.code || "",
    name: String(overrides.name ?? article.name ?? "").trim() || article.name,
    description: String(overrides.description ?? article.description ?? "").trim(),
    category: article.category || "",
    subcategory: article.subcategory || "",
    brand: article.brand || "",
    qty,
    unit,
    tax,
    discountType: overrides.discountType || "percent",
    discountValue: Number(overrides.discountValue || 0),
  };
}

export function priceTtc(ht, tax) {
  return Number(ht || 0) * (1 + Number(tax || 0) / 100);
}
