/** Tableau RDV commerciaux — lecture des rendez-vous déjà en agenda, sans doublon. */

import { appointmentEnd, isPersonalAgendaKind, parseAgendaDate } from "./agenda.js";
import { extraOf } from "./prospects.js";
import {
  ICOLL_RDV_STATUSES,
  normalizeAgendaStatus,
  statusMatchesFilter,
} from "./appointment-status.js";

export const RDV_TABLE_PERIODS = [
  { id: "", label: "Tous" },
  { id: "today", label: "Aujourd’hui" },
  { id: "week", label: "Cette semaine" },
  { id: "month", label: "Ce mois" },
  { id: "upcoming", label: "À venir" },
  { id: "past", label: "Passés" },
];

export const RDV_TABLE_PAGE_SIZES = [25, 50, 100];

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function isCommercialRdvRow(item = {}) {
  if (!item || item.source === "google") return false;
  if (item.private || item.kind === "busy") return false;
  // Formation, accompagnement et « autre » occupent un créneau mais ne sont
  // pas des rendez-vous commerciaux : ils n'ont pas de prospect, donc pas
  // d'origine. Les compter gonflerait le nombre de rendez-vous par provenance
  // et ferait baisser artificiellement les taux de conversion.
  if (isPersonalAgendaKind(item.kind)) return false;
  return Boolean(item.id);
}

export function formatRdvDate(value) {
  const date = parseAgendaDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" }).format(date);
}

export function formatRdvClock(value) {
  const date = parseAgendaDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(date);
}

export function rdvPartyType(item = {}, prospect) {
  if (prospect?.clientId || prospect?.convertedAt || prospect?.stage === "Gagné") return "Client";
  if (item.kind === "rappel") return "Rappel";
  return "Prospect";
}

export function resolveRdvClient(item = {}, prospect, clients = []) {
  if (prospect?.clientId) {
    const linked = (clients || []).find(client => String(client.id) === String(prospect.clientId));
    if (linked) return linked;
  }
  const number = Number(prospect?.prospectNumber || item.prospectNumber);
  if (number > 0) {
    const byNumber = (clients || []).find(client => Number(client.prospectNumber) === number);
    if (byNumber) return byNumber;
  }
  return null;
}

export function mergeRdvProspects(openProspects = [], converted = []) {
  const map = new Map();
  for (const item of [...(converted || []), ...(openProspects || [])]) {
    if (!item?.id) continue;
    const key = String(item.id);
    map.set(key, { ...(map.get(key) || {}), ...item });
  }
  return [...map.values()];
}

export function appointmentsForClient(client, appointments = [], prospects = []) {
  if (!client?.id) return [];
  const id = String(client.id);
  const number = Number(client.prospectNumber);
  const prospectIds = new Set();
  for (const prospect of prospects || []) {
    const linked = prospect?.clientId && String(prospect.clientId) === id;
    const numbered = number > 0 && Number(prospect?.prospectNumber) === number;
    if (linked || numbered) prospectIds.add(String(prospect.id));
  }
  return (appointments || [])
    .filter(item => item?.id && item.source !== "google" && !item.private && item.kind !== "busy")
    .filter(item => prospectIds.has(String(item.prospectId || "")))
    .sort((a, b) => String(b.start || "").localeCompare(String(a.start || "")));
}

export function enrichCommercialRdvRow(item = {}, prospect) {
  const extra = extraOf(item);
  const postalCode = item.postalCode || extra.postalCode || extra.code_postal || prospect?.postalCode || "";
  const city = item.city || prospect?.city || "";
  const phone = item.phone || extra.phone || extra.telephone || prospect?.phone || "";
  const status = normalizeAgendaStatus(item.status);
  const start = parseAgendaDate(item.start || item.starts_at);
  const end = appointmentEnd(item) || start;
  return {
    ...item,
    status,
    postalCode,
    city,
    phone,
    partyType: rdvPartyType(item, prospect),
    prospector: prospect?.prospector || extra.prospector || "",
    prospectorId: prospect?.prospectorId || extra.prospectorId || "",
    calendar: item.commercial || "—",
    dateLabel: formatRdvDate(start),
    startLabel: formatRdvClock(start),
    endLabel: formatRdvClock(end),
    searchText: [
      item.prospectName,
      postalCode,
      city,
      phone,
      item.commercial,
      prospect?.prospector || extra.prospector,
      status,
      item.appointmentType,
      item.kind,
    ].join(" ").toLowerCase(),
  };
}

export function matchesRdvCommercial(item, commercialId) {
  if (!commercialId) return true;
  if (commercialId === "unassigned") return !item.commercialId;
  return String(item.commercialId || "") === String(commercialId);
}

export function rdvTableCommercials(commercials = [], rows = []) {
  const seen = new Map();
  for (const user of commercials || []) {
    if (!user?.id) continue;
    seen.set(String(user.id), { id: String(user.id), name: user.name || "Sans nom" });
  }
  for (const row of rows || []) {
    const id = String(row.commercialId || "");
    if (!id || seen.has(id)) continue;
    seen.set(id, { id, name: row.commercial || row.calendar || id });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function matchesRdvProspector(item, prospectorId) {
  if (!prospectorId) return true;
  if (prospectorId === "unassigned") return !item.prospectorId && !item.prospector;
  return String(item.prospectorId || "") === String(prospectorId)
    || String(item.prospector || "") === String(prospectorId);
}

export function rdvTableProspectors(rows = []) {
  const seen = new Map();
  for (const row of rows || []) {
    const id = String(row.prospectorId || row.prospector || "");
    if (!id || seen.has(id)) continue;
    seen.set(id, { id, name: row.prospector || id });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function matchesRdvOnDate(item, date) {
  if (!date) return true;
  const start = parseAgendaDate(item.start || item.starts_at);
  if (!start) return false;
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(start);
  return key === date;
}

export function matchesRdvPeriod(item, period, now = new Date()) {
  if (!period) return true;
  const start = parseAgendaDate(item.start || item.starts_at);
  if (!start) return false;
  const today0 = startOfDay(now);
  const today1 = endOfDay(now);
  if (period === "today") return start >= today0 && start <= today1;
  if (period === "week") {
    const from = new Date(today0);
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
    const to = new Date(from);
    to.setDate(from.getDate() + 7);
    return start >= from && start < to;
  }
  if (period === "month") {
    return start.getFullYear() === now.getFullYear() && start.getMonth() === now.getMonth();
  }
  if (period === "upcoming") return start >= today0;
  if (period === "past") return start < today0;
  return true;
}

export function buildCommercialRdvTable(appointments = [], prospects = [], {
  query = "",
  period = "",
  status = "",
  commercialId = "",
  prospectorId = "",
  onDate = "",
  commercials = [],
  clients = [],
  page = 1,
  pageSize = 100,
  now = new Date(),
} = {}) {
  const byId = new Map((prospects || []).map(row => [String(row.id), row]));
  const seen = new Set();
  const rows = [];
  for (const item of appointments || []) {
    if (!isCommercialRdvRow(item)) continue;
    const key = String(item.id);
    if (seen.has(key)) continue;
    seen.add(key);
    const prospect = byId.get(String(item.prospectId || ""));
    const row = enrichCommercialRdvRow(item, prospect);
    const client = resolveRdvClient(item, prospect, clients);
    rows.push({ ...row, clientId: client?.id ? String(client.id) : "", clientName: client?.name || "" });
  }
  const needle = String(query || "").trim().toLowerCase();
  const filtered = rows
    .filter(row => !needle || row.searchText.includes(needle))
    .filter(row => matchesRdvPeriod(row, period, now))
    .filter(row => statusMatchesFilter(row.status, status))
    .filter(row => matchesRdvCommercial(row, commercialId))
    .filter(row => matchesRdvProspector(row, prospectorId))
    .filter(row => matchesRdvOnDate(row, onDate))
    .sort((a, b) => String(b.start || "").localeCompare(String(a.start || "")));
  const size = RDV_TABLE_PAGE_SIZES.includes(Number(pageSize)) ? Number(pageSize) : 100;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const safePage = Math.min(Math.max(1, Number(page) || 1), pages);
  const start = (safePage - 1) * size;
  return {
    rows: filtered.slice(start, start + size),
    total: filtered.length,
    page: safePage,
    pageSize: size,
    pages,
    statuses: ICOLL_RDV_STATUSES,
    commercials: rdvTableCommercials(commercials, rows),
    prospectors: rdvTableProspectors(rows),
  };
}
