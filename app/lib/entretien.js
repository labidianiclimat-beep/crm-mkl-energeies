/** Contrats d’entretien — constantes et garde-fous du modèle additif. */

export const CLIENT_IMPORT_TARGETS = [
  "type_client",
  "civilite",
  "nom",
  "prenom",
  "raison_sociale",
  "adresse",
  "complement_adresse",
  "code_postal",
  "ville",
  "telephone",
  "telephone_secondaire",
  "email",
  "origine_lead",
  "statut",
  "notes",
  "import_key",
];

export const INVOICE_IMPORT_TARGETS = [
  "external_number",
  "invoice_date",
  "amount_ht",
  "amount_tva",
  "amount_ttc",
  "client_import_key",
  "client_name",
  "payment_status",
  "payment_date",
  "visit_date_hint",
  "document_ref",
];

export const REALIZATION_STATUSES = ["inconnu", "confirme", "non_confirme"];
export const REALIZATION_BASES = [
  "rapport_signe",
  "attestation_technicien",
  "confirmation_client",
  "revue_humaine",
  "autre",
];
export const NATURES = ["entretien", "installation", "depannage", "autre"];
export const NATURE_STATUSES = ["brut", "propose", "ambigu", "valide", "ecarte"];

export const DEFAULT_CLASSIFY_RULES = [
  { family: "entretien", pattern: "entretien", weight: 3, aloneIsInsufficient: false, active: true },
  { family: "entretien", pattern: "maintenance", weight: 3, aloneIsInsufficient: false, active: true },
  { family: "entretien", pattern: "visite annuelle", weight: 3, aloneIsInsufficient: false, active: true },
  { family: "entretien", pattern: "contrat d'entretien", weight: 3, aloneIsInsufficient: false, active: true },
  { family: "entretien", pattern: "revision", weight: 2, aloneIsInsufficient: true, active: true },
  { family: "entretien", pattern: "controle etancheite", weight: 2, aloneIsInsufficient: false, active: true },
  { family: "installation", pattern: "pose", weight: 2, aloneIsInsufficient: true, active: true },
  { family: "installation", pattern: "installation", weight: 2, aloneIsInsufficient: true, active: true },
  { family: "installation", pattern: "chantier", weight: 2, aloneIsInsufficient: true, active: true },
  { family: "installation", pattern: "photovoltaique", weight: 1, aloneIsInsufficient: true, active: true },
  { family: "installation", pattern: "pv", weight: 1, aloneIsInsufficient: true, active: true },
  { family: "installation", pattern: "mise en service", weight: 1, aloneIsInsufficient: true, active: true },
];

export function normalizeClassifyText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasSufficientSignal(matches) {
  return matches.some(rule => !rule.aloneIsInsufficient);
}

export function classifyAgendaTitle(title, rules = DEFAULT_CLASSIFY_RULES) {
  const text = normalizeClassifyText(title);
  const matched = (rules || []).filter(rule => (
    rule.active !== false
    && text
    && text.includes(normalizeClassifyText(rule.pattern))
  ));
  const entretien = matched.filter(rule => rule.family === "entretien");
  const installation = matched.filter(rule => rule.family === "installation");

  if (!text || (entretien.length && installation.length) || (!entretien.length && !installation.length)) {
    return { natureProposed: null, natureStatus: "ambigu", matched };
  }
  if (entretien.length && hasSufficientSignal(entretien) && !installation.length) {
    return { natureProposed: "entretien", natureStatus: "propose", matched };
  }
  if (installation.length >= 2 && hasSufficientSignal(installation) && !entretien.length) {
    return { natureProposed: "installation", natureStatus: "propose", matched };
  }
  return { natureProposed: null, natureStatus: "ambigu", matched };
}

export function emptyRealization() {
  return {
    realizationStatus: "inconnu",
    realizationDate: null,
    realizationBasis: null,
    realizationNote: "",
    realizationRecordedAt: null,
    realizationRecordedBy: null,
  };
}

export function applyNatureValidation(visit, { clientId, natureValidated, actorId, at } = {}) {
  return {
    ...visit,
    clientId: clientId ?? visit.clientId ?? null,
    clientLinkStatus: clientId ? "valide" : visit.clientLinkStatus,
    clientLinkedAt: clientId ? at : visit.clientLinkedAt,
    clientLinkedBy: clientId ? actorId : visit.clientLinkedBy,
    natureStatus: "valide",
    natureValidated,
    natureValidatedAt: at,
    natureValidatedBy: actorId,
    realizationStatus: visit.realizationStatus || "inconnu",
    realizationDate: visit.realizationDate || null,
    realizationBasis: visit.realizationBasis || null,
    realizationNote: visit.realizationNote || "",
    realizationRecordedAt: visit.realizationRecordedAt || null,
    realizationRecordedBy: visit.realizationRecordedBy || null,
  };
}

export function applyRealization(visit, { status, date, basis, note, actorId, at } = {}) {
  if (status === "inconnu") return { ...visit, ...emptyRealization() };
  if (status === "non_confirme") {
    return {
      ...visit,
      realizationStatus: "non_confirme",
      realizationDate: null,
      realizationBasis: basis || null,
      realizationNote: note || "",
      realizationRecordedAt: at,
      realizationRecordedBy: actorId,
    };
  }
  return {
    ...visit,
    realizationStatus: "confirme",
    realizationDate: date,
    realizationBasis: basis,
    realizationNote: note || "",
    realizationRecordedAt: at,
    realizationRecordedBy: actorId,
  };
}

export function lastConfirmedEntretienDate(visits = []) {
  const dates = (visits || [])
    .filter(visit => (
      visit.natureStatus === "valide"
      && visit.natureValidated === "entretien"
      && visit.realizationStatus === "confirme"
      && visit.realizationDate
    ))
    .map(visit => visit.realizationDate)
    .sort()
    .reverse();
  return dates[0] || null;
}

function addFrequency(isoDate, frequency) {
  if (!isoDate || !frequency) return null;
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (frequency === "Annuelle") date.setFullYear(date.getFullYear() + 1);
  else if (frequency === "Semestrielle") date.setMonth(date.getMonth() + 6);
  else if (frequency === "Trimestrielle") date.setMonth(date.getMonth() + 3);
  else return null;
  return date.toISOString().slice(0, 10);
}

export function visitNeedsReview(visit) {
  const nature = visit?.natureStatus || visit?.nature_status;
  const link = visit?.clientLinkStatus || visit?.client_link_status;
  return ["brut", "propose", "ambigu"].includes(nature)
    || ["non_rapproche", "propose"].includes(link);
}

export function invoiceNeedsReview(invoice) {
  const link = invoice?.clientLinkStatus || invoice?.client_link_status;
  return ["non_rapproche", "propose"].includes(link);
}

export function clientPilotageFlags({ visits = [], invoices = [], frequency, today } = {}) {
  const lastConfirmedEntretienOn = lastConfirmedEntretienDate(visits);
  const nextDueOn = addFrequency(lastConfirmedEntretienOn, frequency);
  const day = today || new Date().toISOString().slice(0, 10);
  return {
    lastConfirmedEntretienOn,
    nextDueOn,
    isLastEntretienUnknown: !lastConfirmedEntretienOn,
    isConfirmedOverdue: Boolean(lastConfirmedEntretienOn && nextDueOn && nextDueOn < day),
    hasItemsToReview: visits.some(visitNeedsReview) || invoices.some(invoiceNeedsReview),
  };
}

export function applyColumnMap(row = {}, columnMap = {}) {
  const mapped = {};
  for (const [target, source] of Object.entries(columnMap || {})) {
    mapped[target] = row[source] ?? row[String(source || "").toLowerCase()] ?? "";
  }
  return mapped;
}
