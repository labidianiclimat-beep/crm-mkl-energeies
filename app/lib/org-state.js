export const ORG_STATE_KEYS = [
  "mkl-contracts",
  "mkl-article-groups",
  "mkl-cost-requests",
  "mkl-suppliers",
  "mkl-technical-visits",
  "mkl-installations",
  "mkl-installation-teams",
  "mkl-thermal-studies",
  "mkl-pv-simulations",
  "mkl-pv-projects",
  "mkl-purchase-orders",
  "mkl-maintenance-reports",
];

export const ORG_STATE_MODULES = {
  "mkl-contracts": "Maintenance",
  "mkl-article-groups": "Gestion des articles",
  "mkl-cost-requests": "Demandes de chiffrage",
  "mkl-suppliers": "Fournisseurs",
  "mkl-technical-visits": "Visites techniques",
  "mkl-installations": "Chantiers",
  "mkl-installation-teams": "Équipes d’installation",
  "mkl-thermal-studies": "Études thermiques",
  "mkl-pv-simulations": "Études thermiques",
  "mkl-pv-projects": "Photovoltaïque administratif",
  "mkl-purchase-orders": "Visites techniques",
  "mkl-maintenance-reports": "Maintenance",
};

export const READ_ONLY_ORG_STATE_KEYS = ["mkl-article-groups"];

export function isReadOnlyOrgStateKey(key) {
  return READ_ONLY_ORG_STATE_KEYS.includes(key);
}

export function orgStateModuleForKey(key) {
  return ORG_STATE_MODULES[key] || "";
}

export const DEFAULT_ARTICLE_GROUPS = [
  { id: 1, code: "GM", name: "Grand matériel", parent: "", description: "Équipements nécessitant une consultation fournisseur", margin: 22 },
  { id: 2, code: "PF", name: "Petite fourniture", parent: "", description: "Consommables, accessoires et raccords", margin: 35 },
  { id: 3, code: "INS", name: "Installation", parent: "", description: "Prestations de pose et mise en service", margin: 45 },
  { id: 11, code: "CLIM", name: "Climatisation", parent: "Grand matériel", description: "Systèmes de climatisation", margin: 25 },
  { id: 12, code: "CHAUF", name: "Chauffage", parent: "Grand matériel", description: "Équipements de chauffage", margin: 25 },
  { id: 13, code: "BTD", name: "Ballon thermodynamique", parent: "Grand matériel", description: "Ballons et accessoires", margin: 25 },
  { id: 14, code: "ADO", name: "Adoucisseur d’eau", parent: "Grand matériel", description: "Adoucisseurs et traitement de l’eau", margin: 25 },
  { id: 15, code: "PV", name: "Panneaux photovoltaïques", parent: "Grand matériel", description: "Panneaux, onduleurs et équipements", margin: 28 },
];

const DEMO_CONTRACT_NUMBERS = new Set(["ENT-2026-018", "ENT-2026-024", "ENT-2025-091"]);
const DEMO_SUPPLIER_EMAILS = new Set(["devis@solar-ouest.example", "chiffrage@thermopro.example"]);

export function isKnownOrgStateKey(key) {
  return ORG_STATE_KEYS.includes(key);
}

export function orgRecordId(record) {
  if (!record || record.id == null || record.id === "") return "";
  return String(record.id);
}

export function collectDeletedIds(previous = [], next = []) {
  const nextIds = new Set((Array.isArray(next) ? next : []).map(orgRecordId).filter(Boolean));
  return (Array.isArray(previous) ? previous : [])
    .map(orgRecordId)
    .filter(id => id && !nextIds.has(id));
}

export function orgRevisionConflicts(storedUpdatedAt, expectedUpdatedAt) {
  const stored = String(storedUpdatedAt || "");
  const expected = String(expectedUpdatedAt || "");
  if (!stored || !expected) return false;
  return stored !== expected;
}

export function mergeOrgStateRecords(current = [], incoming = [], deletedIds = []) {
  const removed = new Set((deletedIds || []).map(value => String(value)));
  const seen = new Set();
  const next = [];
  for (const row of Array.isArray(incoming) ? incoming : []) {
    const id = orgRecordId(row);
    if (id && removed.has(id)) continue;
    if (id) seen.add(id);
    next.push(row);
  }
  for (const row of Array.isArray(current) ? current : []) {
    const id = orgRecordId(row);
    if (!id || removed.has(id) || seen.has(id)) continue;
    next.push(row);
  }
  return next;
}

export function normalizeArticleGroups(records) {
  const mainCategories = ["Grand matériel", "Petite fourniture", "Installation"];
  const legacyParents = { "Photovoltaïque": "Grand matériel", "Pompes à chaleur": "Grand matériel", "Main-d’œuvre": "Installation" };
  const list = Array.isArray(records) ? records : [];
  const normalized = list.map(group => ({
    ...group,
    parent: mainCategories.includes(group.name) ? "" : group.parent || legacyParents[group.name] || "Grand matériel",
  }));
  const missing = DEFAULT_ARTICLE_GROUPS.filter(required => !normalized.some(group => group.name === required.name));
  const unique = new Map([...normalized, ...missing].map(group => [group.name, group]));
  return [...unique.values()];
}

export function isDemoOrgRecord(key, record) {
  if (!record) return false;
  if (key === "mkl-contracts") return DEMO_CONTRACT_NUMBERS.has(String(record.number || ""));
  if (key === "mkl-suppliers") return DEMO_SUPPLIER_EMAILS.has(String(record.email || "").toLowerCase());
  if (key === "mkl-technical-visits") {
    return String(record.client || "") === "Maison Durand" && String(record.quoteNumber || "") === "DEV-2026-042";
  }
  if (key === "mkl-installations") {
    return String(record.client || "") === "SCI Horizon" && String(record.project || "") === "Installation PAC + solaire" && Number(record.id) === 1;
  }
  if (key === "mkl-installation-teams") {
    return String(record.name || "") === "Équipe installation 1" && String(record.leader || "") === "Karim Aït" && Number(record.id) === 1;
  }
  if (key === "mkl-pv-projects") {
    return String(record.name || "") === "Centrale toiture 9 kWc" && String(record.client || "") === "EARL Bellevue" && Number(record.id) === 1;
  }
  return false;
}

export function stripDemoOrgRecords(key, records) {
  const list = Array.isArray(records) ? records : [];
  if (key === "mkl-article-groups") return normalizeArticleGroups(list);
  return list.filter(record => !isDemoOrgRecord(key, record));
}

export function readLocalOrgState(key) {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
