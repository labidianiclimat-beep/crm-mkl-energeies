import { normalizeText } from "./articles.js";

export const UNCATEGORIZED_SUBCATEGORY_ID = "__none__";
export const UNCATEGORIZED_SUBCATEGORY_NAME = "Sans sous-catégorie";

export function taxonomyNamesEqual(a, b) {
  return normalizeCatalogName(a) === normalizeCatalogName(b);
}

export function normalizeCatalogName(value) {
  return normalizeText(value)
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[''`´’]/g, "'");
}

export function slugifyCatalogName(value) {
  return normalizeCatalogName(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function isMissingRelation(error, tableName = "") {
  const message = String(error?.message || error || "");
  if (/relation|does not exist|schema cache|could not find/i.test(message)) return true;
  if (tableName && new RegExp(tableName, "i").test(message)) {
    return /does not exist|schema cache|could not find|undefined/i.test(message);
  }
  return false;
}

export function categoryToUi(row) {
  if (!row) return null;
  const active = row.actif !== false;
  return {
    id: row.id,
    name: row.name || "",
    slug: row.slug || slugifyCatalogName(row.name),
    description: row.description || "",
    icon: row.icon || "Package",
    sortOrder: Number(row.sort_order ?? 100),
    status: active ? "Actif" : "Inactif",
    active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

export function subcategoryToUi(row) {
  if (!row) return null;
  const active = row.actif !== false;
  return {
    id: row.id,
    categoryId: row.category_id || "",
    categoryName: row.category_name || row.article_categories?.name || "",
    name: row.name || "",
    slug: row.slug || slugifyCatalogName(row.name),
    description: row.description || "",
    sortOrder: Number(row.sort_order ?? 100),
    status: active ? "Actif" : "Inactif",
    active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

export function formToCategoryRecord(input, { organizationId, createdBy } = {}) {
  const active =
    input.actif === undefined && input.status === undefined
      ? true
      : input.actif === true ||
        input.actif === "true" ||
        input.actif === "on" ||
        input.status === "Actif";
  const name = String(input.name || "").trim();
  return {
    organization_id: organizationId,
    name,
    slug: String(input.slug || "").trim() || slugifyCatalogName(name) || null,
    description: String(input.description || "").trim() || null,
    icon: String(input.icon || "Package").trim() || "Package",
    sort_order: Number(input.sort_order ?? input.sortOrder ?? 100),
    actif: Boolean(active),
    created_by: createdBy || null,
    updated_at: new Date().toISOString(),
  };
}

export function formToSubcategoryRecord(input, { organizationId, createdBy } = {}) {
  const active =
    input.actif === undefined && input.status === undefined
      ? true
      : input.actif === true ||
        input.actif === "true" ||
        input.actif === "on" ||
        input.status === "Actif";
  const name = String(input.name || "").trim();
  return {
    organization_id: organizationId,
    category_id: String(input.category_id || input.categoryId || "").trim() || null,
    name,
    slug: String(input.slug || "").trim() || slugifyCatalogName(name) || null,
    description: String(input.description || "").trim() || null,
    sort_order: Number(input.sort_order ?? input.sortOrder ?? 100),
    actif: Boolean(active),
    created_by: createdBy || null,
    updated_at: new Date().toISOString(),
  };
}

export function validateCategoryPayload(record) {
  const errors = [];
  if (!record.name) errors.push("Le nom de la catégorie est obligatoire.");
  if (record.name && record.name.length > 80) errors.push("Le nom de la catégorie est trop long.");
  if (Number.isNaN(Number(record.sort_order))) errors.push("L’ordre d’affichage est invalide.");
  return errors;
}

export function validateSubcategoryPayload(record) {
  const errors = [];
  if (!record.category_id) errors.push("La catégorie parente est obligatoire.");
  if (!record.name) errors.push("Le nom de la sous-catégorie est obligatoire.");
  if (record.name && record.name.length > 80) errors.push("Le nom de la sous-catégorie est trop long.");
  if (Number.isNaN(Number(record.sort_order))) errors.push("L’ordre d’affichage est invalide.");
  return errors;
}

export function findCategoryByName(candidates, name, { excludeId } = {}) {
  const target = normalizeCatalogName(name);
  if (!target) return null;
  return (
    (candidates || []).find(row => {
      if (excludeId && row.id === excludeId) return false;
      return normalizeCatalogName(row.name) === target;
    }) || null
  );
}

export function findSubcategoryByName(candidates, name, { categoryId, excludeId } = {}) {
  const target = normalizeCatalogName(name);
  if (!target) return null;
  return (
    (candidates || []).find(row => {
      if (excludeId && row.id === excludeId) return false;
      if (categoryId && String(row.category_id || row.categoryId) !== String(categoryId)) return false;
      return normalizeCatalogName(row.name) === target;
    }) || null
  );
}

export function isTaxonomyActive(item) {
  if (!item) return false;
  if (item.active === false || item.actif === false) return false;
  if (item.status === "Inactif") return false;
  return true;
}

export function uncategorizedSubcategory(category) {
  return {
    id: UNCATEGORIZED_SUBCATEGORY_ID,
    categoryId: category?.id || "",
    name: UNCATEGORIZED_SUBCATEGORY_NAME,
    description: "Articles non classés dans une sous-catégorie",
    icon: "Package",
    empty: true,
    virtual: true,
    active: true,
    sortOrder: 999,
  };
}
