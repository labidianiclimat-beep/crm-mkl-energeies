import { canAccessModule, canPerformAction } from "./permissions.js";

export const ARTICLE_CATEGORIES = [
  "Chauffage",
  "Climatisation",
  "Ballon d’eau chaude",
  "Photovoltaïque",
  "VMC",
  "Isolation",
  "Autre",
];

export const ARTICLE_UNITS = ["Unité", "Heure", "Forfait", "Mètre", "m²", "kWc", "Lot"];

export const ARTICLE_TAX_RATES = [0, 5.5, 10, 20];
export const CLIM_AND_PAC_RO_TAX = 5.5;
export const ELECTRIC_WATER_HEATER_TAX = 10;

const LEGACY_CATEGORY_MAP = {
  "Grand matériel": "Autre",
  "Petite fourniture": "Accessoire",
};

export function normalizeReference(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-");
}

export function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function catalogPlain(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function articleText(article, keys) {
  return catalogPlain(keys.map(key => article?.[key]).filter(Boolean).join(" "));
}

/** Catégorie ou sous-catégorie climatisation, fournitures et pose comprises. */
export function isClimatisationArticle(article) {
  const category = articleText(article, ["categorie", "category"]);
  const subcategory = articleText(article, ["sous_categorie", "subcategory"]);
  return category.startsWith("climatis") || subcategory.startsWith("climatis");
}

/** Fournitures, pose ou matériel dont le nom ou la référence porte « pompe à chaleur » et « RO ». */
export function isHeatPumpRoArticle(article) {
  const hay = ` ${articleText(article, ["designation", "name", "reference", "code", "categorie", "category", "sous_categorie", "subcategory"])} `;
  const pac = hay.includes(" pompe a chaleur ") || /(?:^| )pac(?: |$)/.test(hay);
  const ro = /(?:^| )ro(?: |$)/.test(hay);
  return pac && ro;
}

export function articleUsesVat55(article) {
  return isClimatisationArticle(article) || isHeatPumpRoArticle(article);
}

/** Ballon électrique, pose comprise. Le ballon thermodynamique reste à son taux enregistré. */
export function isElectricWaterHeaterArticle(article) {
  if (!article) return false;
  const hay = ` ${articleText(article, ["designation", "name", "reference", "code", "categorie", "category", "sous_categorie", "subcategory", "family", "source_reference", "sourceReference"])} `;
  if (hay.includes("thermodynam")) return false;
  if (hay.includes("ballon electrique") || hay.includes("chauffeo")) return true;
  return hay.includes("installation ballon") || hay.includes("inst ballon elec");
}

export function resolvedCatalogTax(parts, fallback = 20) {
  const list = (Array.isArray(parts) ? parts : [parts]).filter(Boolean);
  if (list.some(articleUsesVat55)) return CLIM_AND_PAC_RO_TAX;
  if (list.some(isElectricWaterHeaterArticle)) return ELECTRIC_WATER_HEATER_TAX;
  for (const item of list) {
    const value = Number(item?.taux_tva ?? item?.tax);
    if (Number.isFinite(value)) return value;
  }
  const fallbackValue = Number(fallback);
  return Number.isFinite(fallbackValue) ? fallbackValue : 20;
}

export function articleToUi(row) {
  if (!row) return null;
  const active = row.actif !== false;
  return {
    id: row.id,
    code: row.reference || "",
    name: row.designation || "",
    description: row.description || "",
    technicalDescription: row.description_technique || "",
    category: row.categorie || "Autre",
    subcategory: row.sous_categorie || "",
    categoryId: row.category_id || "",
    subcategoryId: row.subcategory_id || "",
    brand: row.marque || "",
    brandId: row.brand_id || "",
    buy: Number(row.prix_achat_ht || 0),
    sell: Number(row.prix_vente_ht || 0),
    tax: resolvedCatalogTax(row),
    unit: row.unite || "Unité",
    status: active ? "Actif" : "Inactif",
    active,
    powerW: row.power_w != null ? Number(row.power_w) : undefined,
    photoUrl: row.photo_url || "",
    ficheName: row.fiche_nom || "",
    ficheData: row.fiche_data || "",
    sourceReference: row.source_reference || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

export function formToArticleRecord(input, { organizationId, createdBy } = {}) {
  const reference = normalizeReference(input.reference || input.code);
  const categoryRaw = String(input.categorie || input.category || "Autre").trim() || "Autre";
  const category = LEGACY_CATEGORY_MAP[categoryRaw] || categoryRaw;
  const active =
    input.actif === undefined && input.status === undefined
      ? true
      : input.actif === true ||
        input.actif === "true" ||
        input.actif === "on" ||
        input.status === "Actif";

  return {
    organization_id: organizationId,
    reference,
    designation: String(input.designation || input.name || "").trim(),
    description: String(input.description || "").trim() || null,
    description_technique: String(input.description_technique || input.technicalDescription || "").trim() || null,
    categorie: category,
    sous_categorie: String(input.sous_categorie || input.subcategory || "").trim() || null,
    category_id: String(input.category_id || input.categoryId || "").trim() || null,
    subcategory_id: String(input.subcategory_id || input.subcategoryId || "").trim() || null,
    marque: String(input.marque || input.brand || "").trim() || null,
    brand_id: String(input.brand_id || input.brandId || "").trim() || null,
    prix_achat_ht: Number(input.prix_achat_ht ?? input.buy ?? 0),
    prix_vente_ht: Number(input.prix_vente_ht ?? input.sell ?? 0),
    taux_tva: resolvedCatalogTax({
      ...input,
      categorie: category,
      sous_categorie: String(input.sous_categorie || input.subcategory || "").trim(),
      reference,
      designation: String(input.designation || input.name || "").trim(),
      taux_tva: input.taux_tva ?? input.tax,
    }),
    unite: String(input.unite || input.unit || "Unité").trim() || "Unité",
    actif: Boolean(active),
    power_w:
      input.power_w != null || input.powerW != null
        ? Number(input.power_w ?? input.powerW)
        : null,
    source_reference: String(input.source_reference || input.sourceReference || "").trim() || null,
    ...(input.ficheName !== undefined || input.fiche_nom !== undefined || input.ficheData !== undefined || input.fiche_data !== undefined
      ? {
          fiche_nom: String(input.fiche_nom || input.ficheName || "").trim() || null,
          fiche_data: String(input.fiche_data || input.ficheData || "").trim() || null,
        }
      : {}),
    created_by: createdBy || null,
    updated_at: new Date().toISOString(),
  };
}

function categoryKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´’]/g, "'");
}

export function isKnownArticleCategory(name) {
  const wanted = categoryKey(name);
  if (!wanted) return false;
  return ARTICLE_CATEGORIES.some(item => categoryKey(item) === wanted)
    || Object.keys(LEGACY_CATEGORY_MAP).some(item => categoryKey(item) === wanted);
}

export function validateArticlePayload(record, { allowedCategories } = {}) {
  const errors = [];
  if (!record.reference) errors.push("La référence est obligatoire.");
  if (record.reference && record.reference.length > 64) errors.push("La référence est trop longue.");
  if (!record.designation) errors.push("La désignation est obligatoire.");
  if (!record.categorie) {
    errors.push("La catégorie est obligatoire.");
  } else if (Array.isArray(allowedCategories) && allowedCategories.length) {
    const allowed = allowedCategories.some(name => categoryKey(name) === categoryKey(record.categorie))
      || isKnownArticleCategory(record.categorie);
    if (!allowed) errors.push("Catégorie article invalide.");
  }
  if (!ARTICLE_UNITS.includes(record.unite)) errors.push("Unité invalide.");
  if (!ARTICLE_TAX_RATES.includes(Number(record.taux_tva))) errors.push("Taux de TVA invalide.");
  if (Number.isNaN(Number(record.prix_achat_ht)) || Number(record.prix_achat_ht) < 0) {
    errors.push("Prix d’achat invalide.");
  }
  if (Number.isNaN(Number(record.prix_vente_ht)) || Number(record.prix_vente_ht) < 0) {
    errors.push("Prix de vente invalide.");
  }
  return errors;
}

export function findArticleByReference(candidates, reference, { excludeId } = {}) {
  const target = normalizeReference(reference);
  if (!target) return null;
  return (candidates || []).find(row => {
    if (excludeId && row.id === excludeId) return false;
    return normalizeReference(row.reference) === target;
  }) || null;
}

export function matchesArticleSearch(article, query) {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = normalizeText(
    `${article.code || article.reference || ""} ${article.name || article.designation || ""} ${article.brand || article.marque || ""} ${article.category || article.categorie || ""} ${article.subcategory || article.sous_categorie || ""} ${article.description || ""}`
  );
  return words.every(word => haystack.includes(word));
}

const CATEGORY_FILTER_TOKENS = {
  Chauffage: ["chauffage", "pompe a chaleur", "radiateur", "chaudiere", "poele", "pac"],
  Climatisation: ["climatisation", "split", "clim"],
  "Ballon d’eau chaude": ["ballon"],
  Photovoltaïque: ["photovolta", "panneau"],
  VMC: ["vmc"],
  Isolation: ["isolation"],
};

export function matchesArticleCategory(article, category) {
  const wanted = String(category || "").trim();
  if (!wanted) return true;
  const hay = normalizeText(`${article?.category || article?.categorie || ""} ${article?.subcategory || article?.sous_categorie || ""}`);
  if (hay.includes(normalizeText(wanted))) return true;
  const tokens = CATEGORY_FILTER_TOKENS[wanted];
  if (!tokens) return normalizeText(article?.category || article?.categorie || "") === normalizeText(wanted);
  return tokens.some(token => hay.includes(token));
}

export function matchesArticleBrand(article, brand) {
  const wanted = String(brand || "").trim();
  if (!wanted) return true;
  return normalizeText(article?.brand || article?.marque || "") === normalizeText(wanted);
}

export function filterCatalogArticles(articles = [], { query = "", category = "", brand = "" } = {}) {
  return (articles || []).filter(article =>
    matchesArticleSearch(article, query)
    && matchesArticleCategory(article, category)
    && matchesArticleBrand(article, brand)
  );
}

export function catalogArticleBrands(articles = []) {
  return [...new Set((articles || []).map(article => String(article.brand || article.marque || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "fr"));
}

export function catalogArticleCategories(articles = []) {
  const used = [...new Set((articles || []).map(article => String(article.category || article.categorie || "").trim()).filter(Boolean))];
  const extras = used.filter(name => !ARTICLE_CATEGORIES.some(item => normalizeText(item) === normalizeText(name)));
  return [...ARTICLE_CATEGORIES, ...extras.sort((a, b) => a.localeCompare(b, "fr"))];
}

export function canManageArticles(profile) {
  return canAccessModule(profile, "Gestion des articles");
}

export function canDeleteArticles(profile) {
  return canPerformAction(profile, "delete_articles");
}

export function canReadArticles(profile) {
  if (canManageArticles(profile)) return true;
  return ["Devis", "Factures", "Factures pro forma", "Demandes de chiffrage"].some(module => canAccessModule(profile, module));
}
