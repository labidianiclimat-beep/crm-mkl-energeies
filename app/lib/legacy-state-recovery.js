/**
 * Comparaison entre l'ancien stockage (blob crm_state et localStorage) et les
 * tables Supabase, avant de retirer le blob.
 *
 * Le blob a longtemps été la seule persistance de certaines entités, et
 * l'import CSV de clients n'écrivait qu'en local. Des enregistrements réels
 * peuvent donc n'exister que là. On les identifie ici pour pouvoir les
 * recopier en base au lieu de les perdre.
 */

export const LEGACY_STATE_KEYS = {
  clients: "mkl-clients",
  articles: "mkl-articles",
  billing: "mkl-billing",
};

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Identité d'un client : l'email quand il existe, sinon le nom associé à la
 * ville. Un enregistrement sans aucun des deux n'est pas identifiable de façon
 * fiable et sera ignoré plutôt que dupliqué.
 */
export function clientIdentity(record) {
  const email = normalize(record?.email);
  if (email) return `email:${email}`;
  const composed = `${normalize(record?.firstName)} ${normalize(record?.lastName)}`.trim();
  const name = normalize(record?.name) || normalize(record?.company) || composed;
  if (!name) return "";
  return `name:${name}|${normalize(record?.city)}`;
}

export function articleIdentity(record) {
  const code = normalize(record?.code);
  if (code) return `code:${code}`;
  const name = normalize(record?.name);
  return name ? `name:${name}` : "";
}

export function billingIdentity(record) {
  const number = normalize(record?.number);
  return number ? `number:${number}` : "";
}

export const IDENTITIES = {
  clients: clientIdentity,
  articles: articleIdentity,
  billing: billingIdentity,
};

/**
 * Enregistrements présents dans l'ancien stockage et absents des tables.
 * Les doublons internes à l'ancien stockage sont réduits à une occurrence.
 */
export function diffLegacyRecords(legacyRows, currentRows, identity) {
  const legacy = Array.isArray(legacyRows) ? legacyRows : [];
  const current = Array.isArray(currentRows) ? currentRows : [];

  const known = new Set();
  for (const row of current) {
    const id = identity(row);
    if (id) known.add(id);
  }

  const missing = [];
  const seen = new Set();
  for (const row of legacy) {
    const id = identity(row);
    if (!id || known.has(id) || seen.has(id)) continue;
    seen.add(id);
    missing.push(row);
  }
  return missing;
}

/** Fusionne les sources d'ancien stockage en dédupliquant par identité. */
export function mergeLegacySources(sources, identity) {
  const merged = [];
  const seen = new Set();
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const row of source) {
      const id = identity(row);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(row);
    }
  }
  return merged;
}

/**
 * Rapport complet. `legacy` et `current` portent les mêmes clés que
 * LEGACY_STATE_KEYS ; chaque entrée de `legacy` est une liste de sources.
 */
export function buildLegacyReport({ legacy = {}, current = {} } = {}) {
  const report = { clients: [], articles: [], billing: [], total: 0, recoverable: 0 };

  for (const entity of Object.keys(LEGACY_STATE_KEYS)) {
    const identity = IDENTITIES[entity];
    const sources = Array.isArray(legacy[entity]) ? legacy[entity] : [];
    const merged = mergeLegacySources(sources, identity);
    report[entity] = diffLegacyRecords(merged, current[entity], identity);
    report.total += report[entity].length;
  }

  // Les devis ne sont pas recréés automatiquement : leur numéro est attribué
  // par la base et leur historique de statuts ne peut pas être reconstitué.
  report.recoverable = report.clients.length + report.articles.length;
  return report;
}

/** Charge une clé de l'ancien stockage navigateur, en tolérant une donnée abîmée. */
export function readLocalLegacyState(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Charge de client hérité vers le format attendu par POST /api/clients. */
export function legacyClientToPayload(record) {
  const firstName = record?.firstName || "";
  const lastName = record?.lastName || "";
  return {
    customerType: record?.customerType || "Particulier",
    firstName,
    lastName,
    company: record?.company || "",
    name: record?.name || record?.company || `${firstName} ${lastName}`.trim(),
    contact: record?.contact || `${firstName} ${lastName}`.trim(),
    email: record?.email || "",
    phone: record?.phone || "",
    mobile: record?.mobile || "",
    address: record?.address || "",
    addressComplement: record?.addressComplement || "",
    postalCode: record?.postalCode || "",
    city: record?.city || "",
    projectType: record?.projectType || "",
    install: record?.install || "",
    source: record?.source || "",
    status: record?.status || "Actif",
    notes: record?.notes || "",
  };
}

/** Charge d'article hérité vers le format attendu par POST /api/articles. */
export function legacyArticleToPayload(record) {
  return {
    code: record?.code || "",
    name: record?.name || "Article récupéré",
    category: record?.category || "Autre",
    subcategory: record?.subcategory || "",
    brand: record?.brand || "",
    description: record?.description || "",
    unit: record?.unit || "Unité",
    buy: Number(record?.buy || 0),
    sell: Number(record?.sell || 0),
    tax: Number(record?.tax ?? 20),
    status: record?.status || "Actif",
  };
}
