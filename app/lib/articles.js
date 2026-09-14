export const ARTICLE_CATEGORIES = [
  "Climatisation",
  "Chauffage",
  "Radiateur électrique",
  "Isolation extérieure",
  "Ballon thermodynamique",
  "Adoucisseur d’eau",
  "VMC",
  "Photovoltaïque",
  "Pompe à chaleur",
  "Radiateur",
  "Poêle",
  "Accessoire",
  "Main-d’œuvre",
  "Installation",
  "Déplacement",
  "Service",
  "Autre",
];

export const ARTICLE_UNITS = ["Unité", "Heure", "Forfait", "Mètre", "m²", "kWc", "Lot"];

export const ARTICLE_TAX_RATES = [0, 5.5, 10, 20];

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
    brand: row.marque || "",
    brandId: row.brand_id || "",
    buy: Number(row.prix_achat_ht || 0),
    sell: Number(row.prix_vente_ht || 0),
    tax: Number(row.taux_tva ?? 20),
    unit: row.unite || "Unité",
    status: active ? "Actif" : "Inactif",
    active,
    powerW: row.power_w != null ? Number(row.power_w) : undefined,
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
    marque: String(input.marque || input.brand || "").trim() || null,
    brand_id: String(input.brand_id || input.brandId || "").trim() || null,
    prix_achat_ht: Number(input.prix_achat_ht ?? input.buy ?? 0),
    prix_vente_ht: Number(input.prix_vente_ht ?? input.sell ?? 0),
    taux_tva: Number(input.taux_tva ?? input.tax ?? 20),
    unite: String(input.unite || input.unit || "Unité").trim() || "Unité",
    actif: Boolean(active),
    power_w:
      input.power_w != null || input.powerW != null
        ? Number(input.power_w ?? input.powerW)
        : null,
    source_reference: String(input.source_reference || input.sourceReference || "").trim() || null,
    created_by: createdBy || null,
    updated_at: new Date().toISOString(),
  };
}

export function validateArticlePayload(record) {
  const errors = [];
  if (!record.reference) errors.push("La référence est obligatoire.");
  if (record.reference && record.reference.length > 64) errors.push("La référence est trop longue.");
  if (!record.designation) errors.push("La désignation est obligatoire.");
  if (!ARTICLE_CATEGORIES.includes(record.categorie)) {
    errors.push("Catégorie article invalide.");
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

export function canManageArticles(profile) {
  if (!profile) return false;
  if (["Admin VIP", "Admin second", "Responsable commercial", "Responsable technique", "Direction"].includes(profile.role)) {
    return true;
  }
  return (profile.modules || []).includes("Gestion des articles");
}

export function canReadArticles(profile) {
  if (canManageArticles(profile)) return true;
  const modules = profile?.modules || [];
  return ["Devis", "Factures", "Factures pro forma", "Demandes de chiffrage"].some(module => modules.includes(module));
}
