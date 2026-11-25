/** Contrôle du chiffre d’affaires des rendez-vous au statut Commande signée. */

import { extraOf } from "./prospects.js";
import { normalizeAgendaStatus } from "./appointment-status.js";
import { normalizeRoleLabel } from "./roles.js";

const VIEW_ROLES = ["Admin VIP", "Superadmin", "Responsable commercial"];
const DEPOSIT_ROLES = ["Admin VIP", "Superadmin"];

export function canAccessCaControl(profile) {
  return VIEW_ROLES.includes(normalizeRoleLabel(profile?.role));
}

export function canDepositSignedOrder(profile) {
  return DEPOSIT_ROLES.includes(normalizeRoleLabel(profile?.role));
}

export function isSignedOrderStatus(status) {
  return normalizeAgendaStatus(status) === "Commande signée";
}

function historyText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return String(value);
}

export function parisDay(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function signatureInstant(appointment, history = []) {
  const id = String(appointment?.id || "");
  const times = (history || [])
    .filter(row => String(row.appointmentId || row.appointment_id || "") === id)
    .filter(row => String(row.field || "") === "status")
    .filter(row => isSignedOrderStatus(historyText(row.newValue ?? row.new_value)))
    .map(row => new Date(row.createdAt || row.created_at || "").getTime())
    .filter(time => Number.isFinite(time))
    .sort((left, right) => right - left);
  if (times.length) return new Date(times[0]).toISOString();
  return String(appointment?.start || appointment?.starts_at || "");
}

function quoteTime(quote) {
  const time = new Date(quote?.date || quote?.date_creation || quote?.created_at || "").getTime();
  return Number.isFinite(time) ? time : 0;
}

function isDevis(quote) {
  return (quote?.kind || "Devis") === "Devis" && Boolean(quote?.id);
}

export function quotesForSignedOrder(quotes, { clientId = "", prospectId = "", commercialId = "" } = {}) {
  const owner = String(commercialId || "");
  const sameOwner = (quotes || []).filter(quote => {
    if (!isDevis(quote) || !owner) return false;
    return String(quote.commercialId || quote.commercial_id || "") === owner;
  });
  const byClient = String(clientId || "")
    ? sameOwner.filter(quote => String(quote.clientId || quote.client_id || "") === String(clientId))
    : [];
  const byProspect = String(prospectId || "")
    ? sameOwner.filter(quote => {
      const extra = extraOf(quote);
      const source = String(quote.prospectId || extra.sourceProspectId || extra.prospectId || "");
      return source === String(prospectId);
    })
    : [];
  const pool = [...new Map([...byClient, ...byProspect].map(quote => [String(quote.id), quote])).values()];
  return pool.sort((left, right) => quoteTime(right) - quoteTime(left)).map(quote => ({
    id: String(quote.id),
    number: String(quote.number || quote.numero_devis || ""),
    status: String(quote.status || quote.statut || ""),
    totalHT: money(quote, "totalHT"),
    totalTTC: money(quote, "totalTTC"),
  }));
}

function money(quote, key) {
  const raw = quote?.[key] ?? quote?.[key === "totalHT" ? "total_ht" : "total_ttc"];
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : 0;
}

function includesText(row, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  return [row.client, row.commercial, row.city, row.manager, ...(row.quotes || []).flatMap(quote => [quote.number, quote.status])]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function buildCaControl({
  appointments = [],
  prospects = [],
  quotes = [],
  history = [],
  profiles = [],
  from = "",
  to = "",
  commercialId = "",
  manager = "",
  deposit = "",
  query = "",
} = {}) {
  const people = new Map((profiles || []).filter(user => user?.id).map(user => [String(user.id), user]));
  const prospectById = new Map((prospects || []).filter(item => item?.id).map(item => [String(item.id), item]));
  const rows = [];

  for (const item of appointments || []) {
    if (!item?.id || !isSignedOrderStatus(item.status)) continue;
    const ownerId = String(item.commercialId || item.commercial_id || "");
    if (commercialId && ownerId !== String(commercialId)) continue;
    const person = people.get(ownerId);
    const managerName = String(person?.manager || "").trim();
    if (manager && managerName !== manager) continue;
    const extra = extraOf(item);
    const deposited = extra.dossierDepose === true;
    if (deposit === "depose" && !deposited) continue;
    if (deposit === "non" && deposited) continue;
    const prospectId = String(item.prospectId || item.opportunity_id || "");
    const prospect = prospectById.get(prospectId);
    const prospectExtra = extraOf(prospect);
    const clientId = String(prospect?.clientId || prospectExtra.clientId || prospectExtra.client_id || "");
    const signedAt = signatureInstant(item, history);
    const day = parisDay(signedAt);
    if (from && (!day || day < from)) continue;
    if (to && (!day || day > to)) continue;
    const orderQuotes = quotesForSignedOrder(quotes, { clientId, prospectId, commercialId: ownerId });
    const row = {
      id: String(item.id),
      signedAt,
      client: item.prospectName || item.prospect_name || prospect?.name || "Client",
      city: item.city || prospect?.city || "",
      commercialId: ownerId,
      commercial: person?.name || item.commercial || "Commercial",
      manager: managerName,
      deposited,
      quotes: orderQuotes,
    };
    if (!includesText(row, query)) continue;
    rows.push(row);
  }

  rows.sort((left, right) => String(right.signedAt).localeCompare(String(left.signedAt)));
  return { rows, totals: caControlTotals(rows) };
}

export function caControlTotals(rows = []) {
  const byQuote = new Map();
  let pendingDossiers = 0;
  let depositedDossiers = 0;
  for (const row of rows) {
    if (row.deposited) depositedDossiers += 1;
    else pendingDossiers += 1;
    for (const quote of row.quotes || []) {
      if (!quote?.id) continue;
      const current = byQuote.get(quote.id) || {
        totalHT: Number(quote.totalHT) || 0,
        totalTTC: Number(quote.totalTTC) || 0,
        deposited: true,
      };
      current.deposited = current.deposited && Boolean(row.deposited);
      byQuote.set(quote.id, current);
    }
  }
  let totalHT = 0;
  let totalTTC = 0;
  let depositedHT = 0;
  let depositedTTC = 0;
  let pendingHT = 0;
  let pendingTTC = 0;
  for (const quote of byQuote.values()) {
    totalHT += quote.totalHT;
    totalTTC += quote.totalTTC;
    if (quote.deposited) {
      depositedHT += quote.totalHT;
      depositedTTC += quote.totalTTC;
    } else {
      pendingHT += quote.totalHT;
      pendingTTC += quote.totalTTC;
    }
  }
  return {
    dossiers: rows.length,
    pendingDossiers,
    depositedDossiers,
    quotes: byQuote.size,
    totalHT,
    totalTTC,
    depositedHT,
    depositedTTC,
    pendingHT,
    pendingTTC,
  };
}
