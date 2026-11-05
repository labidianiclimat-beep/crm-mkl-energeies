import { normalizeRoleLabel } from "./roles.js";

function toIsoDay(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function startOfWeekMonday(day = new Date()) {
  const date = new Date(`${toIsoDay(day)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  const shift = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - shift);
  return date.toISOString().slice(0, 10);
}

export function addDaysIso(day, days) {
  const date = new Date(`${toIsoDay(day)}T12:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export const MAINTENANCE_VAT_RATE = 0.1;

export function maintenanceTtc(ht) {
  const amount = Number(ht);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * (1 + MAINTENANCE_VAT_RATE) * 100) / 100;
}

export function placedContractTotals(contracts = [], now = new Date()) {
  const today = toIsoDay(now);
  const weekStart = startOfWeekMonday(now);
  const weekEnd = addDaysIso(weekStart, 6);
  const month = today.slice(0, 7);
  const totals = { day: 0, week: 0, month: 0, dayCount: 0, weekCount: 0, monthCount: 0 };
  for (const row of contracts || []) {
    const start = String(row?.start_on || row?.startOn || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    if (start === today) {
      totals.day += amount;
      totals.dayCount += 1;
    }
    if (start >= weekStart && start <= weekEnd) {
      totals.week += amount;
      totals.weekCount += 1;
    }
    if (start.slice(0, 7) === month) {
      totals.month += amount;
      totals.monthCount += 1;
    }
  }
  return totals;
}

export function weekRange(anchor) {
  const start = startOfWeekMonday(anchor);
  return {
    start,
    end: addDaysIso(start, 7),
    days: Array.from({ length: 7 }, (_, index) => addDaysIso(start, index)),
  };
}

export function visitDayKey(visit = {}) {
  return String(visit.scheduled_start || visit.scheduledStart || "").slice(0, 10);
}

export function visitsOnDay(visits = [], day) {
  return (visits || [])
    .filter(visit => visitDayKey(visit) === day)
    .sort((a, b) => String(a.scheduled_start || "").localeCompare(String(b.scheduled_start || "")));
}

export function isEntretienTechnicianRole(role) {
  return ["Technicien", "Responsable technique"].includes(normalizeRoleLabel(role));
}

export function isFieldMaintenanceTechnician(role) {
  return normalizeRoleLabel(role) === "Technicien";
}

/** Sans choix, les agendas des techniciens. Le responsable technique seulement s’il est sélectionné. */
export function maintenanceAgendaBoards(technicians = [], selectedId = "") {
  const selected = String(selectedId || "").trim();
  const list = technicians || [];
  if (selected) return list.filter(tech => String(tech.id) === selected);
  return list.filter(tech => isFieldMaintenanceTechnician(tech.role) && tech.active !== false);
}

const CLIENT_NOISE = /^(m|mr|mme|mlle|me|monsieur|madame|maitre|mademoiselle|et)$/;

function foldClientText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function maintenanceVisitClientName(visit) {
  return String(visit?.title || "").replace(/^Entretien\s+/i, "").trim();
}

export function clientForMaintenanceVisit(visit, clients = []) {
  const id = String(visit?.client_id || visit?.clientId || "").trim();
  const byId = id ? (clients || []).find(item => String(item?.id || "") === id) : null;
  if (byId) return byId;
  const words = foldClientText(maintenanceVisitClientName(visit))
    .split(" ")
    .filter(word => word && !CLIENT_NOISE.test(word));
  if (!words.length) return null;
  const matches = (clients || []).filter(item => {
    const hay = foldClientText([item?.name, item?.firstName, item?.lastName, item?.company, item?.contact].filter(Boolean).join(" "));
    return words.every(word => hay.includes(word));
  });
  return matches.length === 1 ? matches[0] : null;
}

export function maintenanceReportHref(visit, technicianName = "") {
  const params = new URLSearchParams();
  const client = maintenanceVisitClientName(visit);
  const clientId = String(visit?.client_id || visit?.clientId || "").trim();
  if (client) params.set("client", client);
  if (clientId) params.set("clientId", clientId);
  if (visit?.location) params.set("address", visit.location);
  const day = visitDayKey(visit);
  if (day) params.set("date", day);
  const start = visit?.scheduled_start ? new Date(visit.scheduled_start) : null;
  if (start && !Number.isNaN(start.getTime())) {
    params.set("startTime", `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`);
  }
  if (technicianName) params.set("technician", technicianName);
  if (visit?.id) params.set("id", String(visit.id));
  const query = params.toString();
  return query ? `/maintenance-form?${query}` : "/maintenance-form";
}

export function mapsSearchUrl(address) {
  const query = String(address || "").trim();
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function phoneCallHref(value) {
  const compact = String(value || "").trim().replace(/[^\d+]/g, "");
  return compact ? `tel:${compact}` : "";
}

export function technicianVisitReach(visit, client) {
  const phones = [];
  for (const value of [client?.telephone, client?.telephone_secondaire, visit?.client_phone, visit?.client_phone_alt]) {
    const phone = String(value || "").trim();
    if (phone && !phones.includes(phone)) phones.push(phone);
  }
  const street = String(client?.adresse || "").trim();
  const cityLine = [client?.code_postal, client?.ville].map(item => String(item || "").trim()).filter(Boolean).join(" ");
  const postal = [street, cityLine].filter(Boolean).join(", ");
  const address = postal || String(visit?.client_address || visit?.location || "").trim();
  return {
    client_phone: phones[0] || "",
    client_phone_alt: phones[1] || "",
    client_address: address,
    maps_url: mapsSearchUrl(address),
  };
}

export function attachTechnicianReach(visits, clients = []) {
  const byId = new Map((clients || []).map(row => [String(row.id), row]));
  return (visits || []).map(visit => ({
    ...visit,
    ...technicianVisitReach(visit, byId.get(String(visit.client_id || ""))),
  }));
}

export function buildCrmVisitRecord({
  organizationId,
  technicianId,
  clientId,
  contractId,
  title,
  location,
  day,
  time,
  durationMinutes = 60,
  actorId,
} = {}) {
  const clock = String(time || "09:00");
  const start = new Date(`${day}T${clock}:00`);
  if (!day || Number.isNaN(start.getTime())) {
    throw new Error("Date ou heure invalide.");
  }
  const end = new Date(start.getTime() + Number(durationMinutes || 60) * 60000);
  const at = new Date().toISOString();
  const linked = Boolean(clientId);
  return {
    organization_id: organizationId,
    technician_id: technicianId || null,
    contract_id: contractId || null,
    source: "saisie",
    title: String(title || "").trim() || "Entretien / maintenance",
    location: location || "",
    scheduled_start: start.toISOString(),
    scheduled_end: end.toISOString(),
    client_id: clientId || null,
    client_link_status: linked ? "valide" : "non_rapproche",
    client_linked_at: linked ? at : null,
    client_linked_by: linked ? actorId || null : null,
    nature_proposed: "entretien",
    nature_status: linked ? "valide" : "propose",
    nature_validated: linked ? "entretien" : null,
    nature_validated_at: linked ? at : null,
    nature_validated_by: linked ? actorId || null : null,
    realization_status: "inconnu",
  };
}

export function manualContractNumber(startOn = "") {
  const year = String(startOn || "").slice(0, 4) || String(new Date().getFullYear());
  const token = Date.now().toString(36).toUpperCase().slice(-5);
  return `ENT-${year}-${token}`;
}

function foldContractText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function reportInterventionDay(report) {
  const raw = String(report?.date || report?.updatedAt || report?.updated_at || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function contractAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function contractPriceRows(contracts = []) {
  return (contracts || []).flatMap(row => {
    const amount = contractAmount(row?.amount);
    if (amount === null) return [];
    return [{
      number: foldContractText(row?.number || row?.contract_number),
      clientId: String(row?.client_id || row?.clientId || "").trim(),
      name: foldContractText(row?.client_name || row?.client || row?.name),
      amount,
    }];
  });
}

export function contractPriceForReport(report, contracts = []) {
  const rows = contractPriceRows(contracts);
  const number = foldContractText(report?.contract || report?.contractNumber);
  const clientId = String(report?.clientId || report?.client_id || "").trim();
  const name = foldContractText(report?.client || report?.clientName);
  if (number) {
    const hits = rows.filter(row => row.number && row.number === number);
    if (hits.length) return hits[0].amount;
  }
  if (clientId) {
    const hits = rows.filter(row => row.clientId && row.clientId === clientId);
    if (hits.length === 1) return hits[0].amount;
  }
  if (name) {
    const hits = rows.filter(row => row.name && row.name === name);
    if (hits.length === 1) return hits[0].amount;
  }
  return null;
}

export function shiftMonthKey(month, delta = 0) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  const base = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, 1, 12)
    : new Date();
  base.setMonth(base.getMonth() + Number(delta || 0));
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
}

function periodContractTotal(rows) {
  const seen = new Set();
  let total = 0;
  for (const row of rows) {
    if (!Number.isFinite(row.amount)) continue;
    if (seen.has(row.contractKey)) continue;
    seen.add(row.contractKey);
    total += row.amount;
  }
  return Math.round(total * 100) / 100;
}

export function maintenanceReportBoards(reports = [], contracts = [], { weekStart, month } = {}) {
  const start = startOfWeekMonday(weekStart || new Date());
  const end = addDaysIso(start, 6);
  const monthKey = /^\d{4}-\d{2}$/.test(String(month || "")) ? String(month) : toIsoDay(new Date()).slice(0, 7);
  const rows = (reports || []).map(report => {
    const day = reportInterventionDay(report);
    const amount = contractPriceForReport(report, contracts);
    const contract = String(report?.contract || report?.contractNumber || "").trim();
    const clientId = String(report?.clientId || report?.client_id || "").trim();
    const client = String(report?.client || report?.clientName || "").trim();
    return {
      id: String(report?.id || ""),
      day,
      client,
      technician: String(report?.technician || "").trim(),
      contract,
      amount,
      contractKey: foldContractText(contract) || clientId || foldContractText(client) || String(report?.id || ""),
    };
  }).filter(row => row.day);
  const byDay = (left, right) => right.day.localeCompare(left.day) || left.client.localeCompare(right.client, "fr");
  const weekRows = rows.filter(row => row.day >= start && row.day <= end).sort(byDay);
  const monthRows = rows.filter(row => row.day.slice(0, 7) === monthKey).sort(byDay);
  return {
    week: { start, end, rows: weekRows, total: periodContractTotal(weekRows) },
    month: { key: monthKey, rows: monthRows, total: periodContractTotal(monthRows) },
  };
}

export function buildManualEntretienContract({ organizationId, clientId, startOn, actorId, number } = {}) {
  const id = String(clientId || "").trim();
  if (!id) throw new Error("Client manquant.");
  const day = String(startOn || "").slice(0, 10);
  return {
    organization_id: organizationId,
    client_id: id,
    number: number || manualContractNumber(day),
    frequency: "Annuelle",
    amount: null,
    start_on: day || null,
    status: "Actif",
    notes: "Contrat créé lors de la planification.",
    created_by: actorId || null,
  };
}
