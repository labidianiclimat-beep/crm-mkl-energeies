/**
 * Comparaison entre l'ancien stockage (blob crm_state et localStorage) et les
 * tables Supabase, avant de retirer le blob.
 *
 * Le blob a longtemps été la seule persistance de certaines entités, et
 * l'import CSV de clients n'écrivait qu'en local. Des enregistrements réels
 * peuvent donc n'exister que là. On les identifie ici pour pouvoir les
 * recopier en base au lieu de les perdre.
 */

import { normalizeClientStatus } from "./clients.js";

export const LEGACY_STATE_KEYS = {
  clients: "mkl-clients",
  articles: "mkl-articles",
  billing: "mkl-billing",
  prospects: "mkl-prospects",
  appointments: "mkl-commercial-appointments",
};

const DEMO_PROSPECT_NAMES = new Set([
  "boulangerie le sillon",
  "earl des chenes",
  "sci horizon",
  "ateliers brossard",
]);

const DEMO_CLIENT_NAMES = new Set([
  "earl bellevue",
  "sci horizon",
  "ferme de la prairie",
]);

const DEMO_CLIENT_EMAILS = new Set([
  "paul@bellevue.fr",
  "s.richard@horizon.fr",
  "luc@laprairie.fr",
]);

const DEMO_ARTICLE_CODES = new Set([
  "pv-450w",
  "ond-10k",
  "mo-pose",
  "gm-ond100",
]);

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

export function prospectIdentity(record) {
  const email = normalize(record?.email);
  if (email) return `email:${email}`;
  const name = normalize(record?.name);
  if (!name) return "";
  return `name:${name}|${normalize(record?.city)}`;
}

export function appointmentIdentity(record) {
  const start = String(record?.start || record?.starts_at || "").trim();
  const name = normalize(record?.prospectName || record?.prospect_name);
  if (!start || !name) return "";
  return `rdv:${name}|${start}`;
}

export function isDemoProspect(record) {
  const name = normalize(record?.name).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (DEMO_PROSPECT_NAMES.has(name)) return true;
  const id = Number(record?.id);
  return id >= 101 && id <= 104;
}

export function isDemoClient(record) {
  const email = normalize(record?.email);
  if (email.endsWith("@mkl-demo.fr") || DEMO_CLIENT_EMAILS.has(email)) return true;
  const name = normalize(record?.name).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (DEMO_CLIENT_NAMES.has(name)) return true;
  return String(record?.name || "").includes("(exemple)");
}

export function isDemoArticle(record) {
  const code = normalize(record?.code || record?.reference);
  return DEMO_ARTICLE_CODES.has(code);
}

export const IDENTITIES = {
  clients: clientIdentity,
  articles: articleIdentity,
  billing: billingIdentity,
  prospects: prospectIdentity,
  appointments: appointmentIdentity,
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
  const report = {
    clients: [],
    articles: [],
    billing: [],
    prospects: [],
    appointments: [],
    total: 0,
    recoverable: 0,
  };

  for (const entity of Object.keys(LEGACY_STATE_KEYS)) {
    const identity = IDENTITIES[entity];
    const sources = Array.isArray(legacy[entity]) ? legacy[entity] : [];
    let merged = mergeLegacySources(sources, identity);
    if (entity === "prospects") merged = merged.filter(row => !isDemoProspect(row));
    if (entity === "clients") merged = merged.filter(row => !isDemoClient(row));
    if (entity === "articles") merged = merged.filter(row => !isDemoArticle(row));
    report[entity] = diffLegacyRecords(merged, current[entity], identity);
    report.total += report[entity].length;
  }

  // Les devis ne sont pas recréés automatiquement : leur numéro est attribué
  // par la base et leur historique de statuts ne peut pas être reconstitué.
  report.recoverable =
    report.clients.length +
    report.articles.length +
    report.prospects.length +
    report.appointments.length;
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
    status: normalizeClientStatus(record?.status),
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

function recoveryNextAction(record) {
  const start = String(record?.start || record?.appointmentAt || record?.starts_at || "").trim();
  const kindRaw = String(record?.kind || record?.actionKind || "").toLowerCase();
  const kind = kindRaw.includes("rendez") || kindRaw === "rdv" ? "rendez-vous" : "rappel";
  if (start && !Number.isNaN(new Date(start).getTime())) {
    return { start, kind };
  }
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return { start: next.toISOString(), kind };
}

export function legacyProspectToPayload(record) {
  const { start, kind } = recoveryNextAction(record);
  return {
    name: record?.name || "Prospect récupéré",
    phone: record?.phone || record?.mobile || "",
    email: record?.email || "",
    address: record?.address || "",
    addressComplement: record?.addressComplement || "",
    postalCode: record?.postalCode || "",
    city: record?.city || "",
    type: record?.type || record?.projectType || "Photovoltaïque",
    value: Number(record?.value || 0),
    source: record?.source || "",
    stage: record?.stage || "Nouveau",
    notes: record?.notes || "",
    power: record?.power || "À définir",
    color: record?.color || "#405fae",
    appointmentAt: start,
    start,
    kind,
    actionKind: kind,
  };
}

export function legacyAppointmentToPayload(record, prospectId = "") {
  return {
    prospectId,
    prospectName: record?.prospectName || "",
    city: record?.city || "",
    type: record?.type || "",
    start: record?.start || record?.starts_at || "",
    duration: Number(record?.duration || 60),
    status: record?.status || "À dispatcher",
    notes: record?.notes || "",
    appointmentType: record?.appointmentType || "",
    commercial: record?.commercial || "",
    manager: record?.manager || "",
  };
}
