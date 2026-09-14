import { normalizeText } from "./articles.js";

/** Limite serveur pour logo_url (data URL ou https). */
export const BRAND_LOGO_MAX_CHARS = 120_000;

export function brandToUi(row) {
  if (!row) return null;
  const active = row.actif !== false;
  return {
    id: row.id,
    name: row.name || "",
    logoUrl: row.logo_url || "",
    status: active ? "Actif" : "Inactif",
    active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

export function formToBrandRecord(input, { organizationId, createdBy } = {}) {
  const active =
    input.actif === undefined && input.status === undefined
      ? true
      : input.actif === true ||
        input.actif === "true" ||
        input.actif === "on" ||
        input.status === "Actif";

  const logoRaw = input.logo_url ?? input.logoUrl ?? "";
  const logoUrl = String(logoRaw || "").trim() || null;

  return {
    organization_id: organizationId,
    name: String(input.name || "").trim(),
    logo_url: logoUrl,
    actif: Boolean(active),
    created_by: createdBy || null,
    updated_at: new Date().toISOString(),
  };
}

export function validateBrandPayload(record) {
  const errors = [];
  if (!record.name) errors.push("Le nom de la marque est obligatoire.");
  if (record.name && record.name.length > 80) errors.push("Le nom de la marque est trop long.");
  if (record.logo_url) {
    if (record.logo_url.length > BRAND_LOGO_MAX_CHARS) {
      errors.push("Le logo est trop volumineux. Choisissez une image plus légère.");
    }
    const ok =
      record.logo_url.startsWith("data:image/") ||
      record.logo_url.startsWith("https://") ||
      record.logo_url.startsWith("http://");
    if (!ok) errors.push("Logo invalide (image ou URL attendue).");
  }
  return errors;
}

export function findBrandByName(candidates, name, { excludeId } = {}) {
  const target = normalizeText(name);
  if (!target) return null;
  return (
    (candidates || []).find(row => {
      if (excludeId && row.id === excludeId) return false;
      return normalizeText(row.name) === target;
    }) || null
  );
}

export function findBrandLogo(brands = [], brandName) {
  const target = normalizeText(brandName);
  if (!target) return "";
  const match = brands.find(brand => normalizeText(brand.name) === target && brand.active !== false);
  return match?.logoUrl || match?.logo_url || "";
}

/**
 * Redimensionne une image côté navigateur avant envoi (JPEG compressé).
 * @param {File} file
 * @param {{ maxSize?: number, quality?: number }} options
 */
export function resizeBrandLogoFile(file, { maxSize = 128, quality = 0.72 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith("image/")) {
      reject(new Error("Choisissez un fichier image (PNG, JPG, WebP…)."));
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      reject(new Error("Image trop lourde (max 4 Mo)."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture de l’image impossible."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image illisible."));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrl.length > BRAND_LOGO_MAX_CHARS) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.55);
        }
        if (dataUrl.length > BRAND_LOGO_MAX_CHARS) {
          reject(new Error("Logo trop volumineux après compression. Essayez une image plus simple."));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}
