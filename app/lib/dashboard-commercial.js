import { isDevisOwnerRole } from "./devis.js";
import { maintenanceTtc } from "./entretien-agenda.js";

/** Métriques tableau de bord commercial (ÉTAPE 11). */

export const DEVIS_EN_COURS_STATUSES = ["Brouillon", "À valider", "Envoyé", "À relancer"];

export function daysSince(dateValue, now = Date.now()) {
  if (!dateValue) return 0;
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.floor((now - time) / 86400000);
}

export function isDevisARelancer(document, now = Date.now()) {
  if (!document || document.kind !== "Devis") return false;
  if (document.status === "À relancer") return true;
  if (document.status === "Envoyé" && daysSince(document.date || document.date_creation, now) >= 15) return true;
  return false;
}

export function computeCommercialDashboard({
  devis = [],
  clients = [],
  prospects = [],
  appointments = [],
  now = Date.now(),
} = {}) {
  const quotes = (devis || []).filter(item => (item.kind || "Devis") === "Devis");
  const devisEnCours = quotes.filter(item => DEVIS_EN_COURS_STATUSES.includes(item.status));
  const devisARelancer = quotes.filter(item => isDevisARelancer(item, now));
  const devisAcceptes = quotes.filter(item => item.status === "Accepté");
  const devisRefuses = quotes.filter(item => item.status === "Refusé");
  const caSigne = devisAcceptes.reduce((sum, item) => sum + Number(item.totalTTC ?? item.total_ttc ?? 0), 0);
  const decided = devisAcceptes.length + devisRefuses.length;
  const tauxTransformation = decided > 0 ? Math.round((devisAcceptes.length / decided) * 1000) / 10 : 0;

  const clientProspects = (clients || []).filter(client =>
    ["Prospect", "À contacter", "Rendez-vous pris", "Devis en cours"].includes(client.status)
  );
  const prospectsCount = Math.max((prospects || []).length, clientProspects.length);

  const upcomingAppointments = (appointments || [])
    .filter(item => {
      if (!item?.start && !item?.starts_at) return false;
      const start = new Date(item.start || item.starts_at).getTime();
      if (Number.isNaN(start) || start < now) return false;
      return !["Annulé", "Réalisé"].includes(item.status);
    })
    .sort((a, b) => String(a.start || a.starts_at).localeCompare(String(b.start || b.starts_at)));

  const prochainesActions = [
    ...devisARelancer.slice(0, 5).map(item => ({
      type: "relance_devis",
      title: `Relancer ${item.number || "devis"}`,
      detail: `${item.client || item.client_name || "Client"} — ${item.status}`,
      href: "Devis",
      date: item.date || item.date_creation || null,
    })),
    ...upcomingAppointments.slice(0, 5).map(item => ({
      type: "rendez_vous",
      title: item.prospectName || item.prospect_name || "Rendez-vous",
      detail: item.city || item.status || "À venir",
      href: "Agenda commercial",
      date: item.start || item.starts_at || null,
    })),
  ].slice(0, 8);

  return {
    prospectsCount,
    upcomingAppointmentsCount: upcomingAppointments.length,
    devisEnCoursCount: devisEnCours.length,
    devisARelancerCount: devisARelancer.length,
    devisAcceptesCount: devisAcceptes.length,
    caSigne,
    tauxTransformation,
    pipelineValue: devisEnCours.reduce((sum, item) => sum + Number(item.totalTTC ?? item.total_ttc ?? 0), 0),
    clientsCount: (clients || []).length,
    prochainesActions,
    devisARelancer: devisARelancer.map(item => ({
      id: item.id,
      number: item.number || item.numero_devis,
      client: item.client || item.client_name,
      status: item.status,
      age: daysSince(item.date || item.date_creation, now),
      totalTTC: Number(item.totalTTC ?? item.total_ttc ?? 0),
    })),
    upcomingAppointments: upcomingAppointments.slice(0, 8).map(item => ({
      id: item.id,
      name: item.prospectName || item.prospect_name,
      start: item.start || item.starts_at,
      status: item.status,
      city: item.city || "",
    })),
  };
}

export function filterDevisByPeriod(devis, from, to) {
  if (!from && !to) return devis;
  const fromTime = from ? new Date(from).getTime() : null;
  const toTime = to ? new Date(to).getTime() + 86400000 - 1 : null;
  return (devis || []).filter(item => {
    const time = new Date(item.date || item.date_creation || item.created_at).getTime();
    if (Number.isNaN(time)) return false;
    if (fromTime != null && time < fromTime) return false;
    if (toTime != null && time > toTime) return false;
    return true;
  });
}

export function isMaintenanceActivity(activity) {
  return String(activity || "").trim().toLowerCase() === "maintenance";
}

export function isOrganizationAgency(agency) {
  const key = String(agency || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!key) return true;
  return key === "mkl" || key === "mkl energies" || key === "toutes";
}

function calendarDay(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) return raw.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(date);
}

function dayInPeriod(day, from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function moneyAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!text) return null;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : null;
}

export function contractsPlacedInPeriod(contracts = [], { from = "", to = "", visits = [] } = {}) {
  const dated = Boolean(from || to);
  const visitedClients = new Set();
  for (const visit of visits || []) {
    if (visit?.nature_status === "ecarte" || visit?.nature_validated === "installation") continue;
    const day = calendarDay(visit.scheduled_start || visit.scheduledStart);
    if (!dayInPeriod(day, from, to)) continue;
    const clientId = visit.client_id || visit.clientId;
    if (clientId) visitedClients.add(String(clientId));
  }
  const picked = [];
  const seen = new Set();
  for (const row of contracts || []) {
    const id = String(row?.id || "");
    if (id && seen.has(id)) continue;
    const start = calendarDay(row?.start_on || row?.startOn);
    const due = calendarDay(row?.next_due_on || row?.next || row?.nextDue);
    const placed = dayInPeriod(start, from, to);
    const scheduled = dayInPeriod(due, from, to);
    const onTour = visitedClients.has(String(row?.client_id || row?.clientId || ""));
    if (dated && !placed && !onTour && !scheduled) continue;
    if (moneyAmount(row?.amount) == null) continue;
    if (id) seen.add(id);
    picked.push(row);
  }
  return picked;
}

export function sumContractAmounts(contracts = []) {
  return (contracts || []).reduce((sum, row) => sum + (moneyAmount(row?.amount) || 0), 0);
}

export function addContractCaToRanking(ranking = [], contracts = [], ownerByClient = new Map()) {
  const byOwner = new Map();
  for (const row of contracts || []) {
    const owner = String(ownerByClient.get(String(row.client_id || row.clientId || "")) || "");
    byOwner.set(owner, (byOwner.get(owner) || 0) + (moneyAmount(row.amount) || 0));
  }
  return (ranking || []).map(row => {
    const ht = byOwner.get(String(row.id || "")) || 0;
    return {
      ...row,
      caSigne: ht,
      caSigneTtc: maintenanceTtc(ht),
    };
  }).sort((left, right) => {
    if (right.caSigne !== left.caSigne) return right.caSigne - left.caSigne;
    return String(left.name).localeCompare(String(right.name), "fr");
  });
}

export function filterByActivity(rows, activity, fieldCandidates = ["projectType", "project_type", "label", "kind"]) {
  if (!activity) return rows;
  const needle = String(activity).toLowerCase();
  return (rows || []).filter(row =>
    fieldCandidates.some(field => String(row[field] || "").toLowerCase().includes(needle))
  );
}

export function rowOwnerId(row, knownIds) {
  const commercial = String(row?.commercialId || row?.commercial_id || "").trim();
  const created = String(row?.createdBy || row?.created_by || "").trim();
  if (knownIds) {
    if (commercial && knownIds.has(commercial)) return commercial;
    if (created && knownIds.has(created)) return created;
  }
  return commercial || created || "";
}

export function belongsToCommercial(row, commercialId) {
  if (!commercialId) return true;
  const target = String(commercialId);
  return (
    String(row?.commercialId || row?.commercial_id || "") === target
    || String(row?.createdBy || row?.created_by || "") === target
  );
}

export function computeCommercialRanking({
  commercials = [],
  devis = [],
  clients = [],
  prospects = [],
  appointments = [],
  now = Date.now(),
} = {}) {
  const people = (commercials || [])
    .filter(user => !user.role || isDevisOwnerRole(user.role))
    .map(user => ({
      id: String(user.id || ""),
      name: user.name || user.full_name || user.email || "Commercial",
      role: user.role || "",
    })).filter(user => user.id);
  const knownIds = new Set(people.map(user => user.id));
  const buckets = new Map(people.map(user => [user.id, { devis: [], clients: [], prospects: [], appointments: [] }]));
  const unassigned = { devis: [], clients: [], prospects: [], appointments: [] };

  function push(kind, row) {
    const id = rowOwnerId(row, knownIds);
    const bucket = buckets.get(id);
    (bucket || unassigned)[kind].push(row);
  }

  (devis || []).forEach(row => push("devis", row));
  (clients || []).forEach(row => push("clients", row));
  (prospects || []).forEach(row => push("prospects", row));
  (appointments || []).forEach(row => push("appointments", row));

  function toRow(user, bucket) {
    const metrics = computeCommercialDashboard({ ...bucket, now });
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      prospectsCount: metrics.prospectsCount,
      upcomingAppointmentsCount: metrics.upcomingAppointmentsCount,
      devisEnCoursCount: metrics.devisEnCoursCount,
      devisARelancerCount: metrics.devisARelancerCount,
      devisAcceptesCount: metrics.devisAcceptesCount,
      caSigne: metrics.caSigne,
      tauxTransformation: metrics.tauxTransformation,
      pipelineValue: metrics.pipelineValue,
    };
  }

  const rows = people.map(user => toRow(user, buckets.get(user.id)));
  if (Object.values(unassigned).some(list => list.length)) {
    rows.push(toRow({ id: "", name: "Non affecté", role: "" }, unassigned));
  }

  return rows.sort((left, right) => {
    if (right.caSigne !== left.caSigne) return right.caSigne - left.caSigne;
    if (right.tauxTransformation !== left.tauxTransformation) return right.tauxTransformation - left.tauxTransformation;
    if (right.devisAcceptesCount !== left.devisAcceptesCount) return right.devisAcceptesCount - left.devisAcceptesCount;
    return String(left.name).localeCompare(String(right.name), "fr");
  });
}
