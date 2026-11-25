import { matchesArticleBrand } from "./articles.js";

function brandKey(value) {
  return String(value || "").trim().toLocaleLowerCase("fr-FR");
}

/** Marques actives du catalogue, avec les modèles (désignations) de cette marque. */
export function maintenanceBrandCatalog(brands = [], articles = []) {
  const names = new Map();
  for (const brand of brands || []) {
    if (brand?.active === false || brand?.status === "Inactif") continue;
    const name = String(brand?.name || "").trim();
    if (!name || names.has(brandKey(name))) continue;
    names.set(brandKey(name), name);
  }
  return [...names.values()]
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map(name => ({
      name,
      models: [...new Set(
        (articles || [])
          .filter(article => article?.active !== false && article?.status !== "Inactif" && matchesArticleBrand(article, name))
          .map(article => String(article?.name || article?.designation || "").trim())
          .filter(Boolean),
      )].sort((a, b) => a.localeCompare(b, "fr")),
    }));
}

export function modelsForMaintenanceBrand(catalog = [], brand = "") {
  const found = (catalog || []).find(item => brandKey(item?.name) === brandKey(brand));
  return found?.models || [];
}

function clientKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Marque, modèle et fluide déjà notés pour ce client, repris l’année suivante. */
export function installationIdentityFromReports(reports = [], { clientId = "", client = "", exceptId = "" } = {}) {
  const id = String(clientId || "").trim();
  const name = clientKey(client);
  const rows = (reports || [])
    .filter(item => String(item?.id || "") !== String(exceptId || ""))
    .filter(item => (id ? String(item?.clientId || "") === id : Boolean(name) && clientKey(item?.client) === name))
    .sort((a, b) => String(b?.updatedAt || b?.date || "").localeCompare(String(a?.updatedAt || a?.date || "")));
  const pick = field => String(rows.find(item => String(item?.[field] || "").trim())?.[field] || "").trim();
  return { brand: pick("brand"), model: pick("model"), refrigerant: pick("refrigerant") };
}

export function maintenanceMachineLabel(visit, reports = []) {
  const id = String(visit?.id || "");
  const current = (reports || []).find(item => id && String(item?.id || "") === id);
  const prior = installationIdentityFromReports(reports, {
    clientId: visit?.client_id || visit?.clientId || current?.clientId || "",
    client: String(visit?.title || "").replace(/^Entretien\s+/i, "").trim() || current?.client || "",
    exceptId: id,
  });
  return [current?.brand || prior.brand, current?.model || prior.model, current?.refrigerant || prior.refrigerant]
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .join(" · ");
}
