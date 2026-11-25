import { parseClientNumber } from "./client-number.js";
import { FINANCE_STATUSES } from "./devis-wizard.js";
import { parseProspectNumber } from "./prospect-number.js";

export const PREVISIT_SCHEDULED_STATUS = "Prévisite programmée";
export const FINANCE_DECISIONS = ["Accepté", "Refusé"];

export function hasQuoteFinancing(doc) {
  if (!doc || (doc.kind && doc.kind !== "Devis")) return false;
  if (doc.financeMode === "credit") return true;
  const financier = String(doc.financier || "").trim();
  return Boolean(financier && financier !== "Sans financement");
}

export function isKnownFinanceStatus(status) {
  return FINANCE_STATUSES.includes(String(status || "").trim());
}

export function formatFrDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("fr-FR");
}

function foldName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function samePositiveNumber(left, right) {
  const a = Number(left);
  const b = Number(right);
  return Number.isInteger(a) && Number.isInteger(b) && a > 0 && a === b;
}

export function sameClientRecord(doc, client) {
  if (!doc || !client) return false;
  if (doc.clientId != null && client.id != null && String(doc.clientId) === String(client.id)) return true;
  if (samePositiveNumber(parseClientNumber(doc.clientNumber) || doc.clientNumber, client.clientNumber)) return true;
  if (samePositiveNumber(parseProspectNumber(doc.prospectNumber) || doc.prospectNumber, client.prospectNumber)) return true;
  if (client.prospectId && [doc.prospectId, doc.sourceProspectId].some(id => id != null && String(id) === String(client.prospectId))) return true;
  const docName = foldName(doc.client || doc.name);
  const clientName = foldName(client.name);
  if (docName && clientName && docName === clientName) return true;
  const docLast = foldName(doc.lastName);
  const docFirst = foldName(doc.firstName);
  const clientLast = foldName(client.lastName);
  const clientFirst = foldName(client.firstName);
  if (docLast && docFirst && clientLast && clientFirst && docLast === clientLast && docFirst === clientFirst) return true;
  const composed = foldName(`${client.lastName || ""} ${client.firstName || ""}`);
  const flipped = foldName(`${client.firstName || ""} ${client.lastName || ""}`);
  if (docName && composed && (docName === composed || docName === flipped)) return true;
  return false;
}

export function scheduledPrevisit(visits = []) {
  const open = visits.filter(visit => {
    const status = String(visit?.status || "");
    return !status.includes("Validée") && !status.includes("Complétée");
  });
  const list = open.length ? open : visits;
  return [...list].sort((a, b) => String(b.date || b.created || "").localeCompare(String(a.date || a.created || "")))[0] || null;
}

export function withScheduledPrevisit(visits, client, date) {
  const related = (visits || []).filter(visit => sameClientRecord(visit, client));
  const current = scheduledPrevisit(related);
  const next = {
    ...(current || {
      id: Date.now(),
      client: client.name,
      clientId: client.id,
      technician: "Responsable technique",
      created: new Date().toISOString(),
      source: "Fiche client",
    }),
    date,
    status: PREVISIT_SCHEDULED_STATUS,
  };
  if (current) return (visits || []).map(item => item.id === current.id ? next : item);
  return [next, ...(visits || [])];
}
