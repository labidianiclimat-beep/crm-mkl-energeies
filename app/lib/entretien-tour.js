import { addDaysIso, buildCrmVisitRecord, isFieldMaintenanceTechnician, startOfWeekMonday } from "./entretien-agenda.js";
import { normalizeRoleLabel } from "./roles.js";
import { readMaintenanceStop, stopLabel } from "./entretien-warranty.js";

export const TOUR_SLOTS = ["08:30", "10:15", "13:30", "15:00", "16:30"];

export const TOUR_PRESTATIONS = [
  { id: "maintenance", label: "Maintenance", nature: "entretien" },
  { id: "depannage", label: "Dépannage", nature: "depannage" },
  { id: "installation", label: "Installation", nature: "installation" },
  { id: "visite", label: "Visite technique", nature: "visite_technique" },
];
export const CALL_LEAD_DAYS = 30;
export const TOUR_RADIUS_KM = 30;
export const TOUR_RADIUS_WIDE_KM = 45;
export const TOUR_NEARBY_LIMIT = 12;
export const TOUR_CALL_LIMIT = 15;

const RAPPEL = /\[\[rappel:(\d{4}-\d{2}-\d{2})\]\]/;

function isoDay(value) {
  const day = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

function frDate(iso) {
  const day = isoDay(iso);
  if (!day) return "";
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

export function addYearsIso(day, years) {
  const date = new Date(`${isoDay(day)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setFullYear(date.getFullYear() + Number(years || 0));
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const datePart = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${datePart}`;
}

export function readCallbackOn(notes) {
  const match = String(notes || "").match(RAPPEL);
  return match ? match[1] : "";
}

export function writeCallbackOn(notes, day) {
  const cleaned = String(notes || "").replace(/\n?\[\[rappel:\d{4}-\d{2}-\d{2}\]\]/g, "").trim();
  const iso = isoDay(day);
  if (!iso) return cleaned;
  return `${cleaned}${cleaned ? "\n" : ""}[[rappel:${iso}]]`;
}

export function dueOn(contract = {}) {
  const existing = isoDay(contract.next_due_on);
  if (existing) return existing;
  const last = isoDay(contract.last_confirmed_entretien_on);
  if (!last) return "";
  if (contract.frequency === "Semestrielle") return addDaysIso(last, 182);
  if (contract.frequency === "Trimestrielle") return addDaysIso(last, 91);
  return addYearsIso(last, 1);
}

export function callCard(contract = {}, today) {
  const day = isoDay(today);
  const stopped = readMaintenanceStop(contract.notes);
  if (stopped) {
    return {
      callable: false,
      tone: "arret",
      label: stopLabel(stopped.reason),
      callbackOn: "",
      dueOn: "",
      lastOn: isoDay(contract.last_confirmed_entretien_on),
    };
  }
  const callback = isoDay(contract.callback_on) || readCallbackOn(contract.notes);
  const last = isoDay(contract.last_confirmed_entretien_on);
  const due = dueOn(contract);
  const waiting = Boolean(callback && day && callback > day);
  let tone = "premier";
  let label = "Premier passage";
  if (last && due && day) {
    const lateDays = Math.round((Date.parse(`${day}T12:00:00`) - Date.parse(`${due}T12:00:00`)) / 86400000);
    if (lateDays >= 365) {
      const years = Math.max(1, Math.round(lateDays / 365));
      tone = "retard";
      label = years <= 1 ? "En retard · 1 an" : `En retard · ${years} ans`;
    } else if (lateDays > 0) {
      tone = "retard";
      label = "En retard";
    } else {
      const open = addDaysIso(due, -CALL_LEAD_DAYS);
      const left = Math.max(0, -lateDays);
      if (day >= open) {
        tone = "echeance";
        label = left === 0 ? "Échéance aujourd’hui" : `Échéance dans ${left} j`;
      } else {
        tone = "trop-tot";
        label = `Pas avant le ${frDate(open)}`;
      }
    }
  }
  const callbackReached = Boolean(callback && day && callback <= day);
  if (callbackReached && tone === "trop-tot") {
    tone = "rappel";
    label = "Rappel aujourd’hui";
  }
  const windowOpen = tone === "premier" || tone === "retard" || tone === "echeance" || tone === "rappel";
  return {
    callable: !waiting && windowOpen,
    tone: waiting ? "rappel-futur" : tone,
    label: waiting ? `Rappeler le ${frDate(callback)}` : label,
    callbackOn: callback,
    dueOn: due,
    lastOn: last,
  };
}

export function haversineKm(a, b) {
  const lat1 = Number(a?.lat);
  const lon1 = Number(a?.lon);
  const lat2 = Number(b?.lat);
  const lon2 = Number(b?.lon);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const earth = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return Math.round(earth * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10;
}

function parisParts(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
}

export function parisToday(now = new Date()) {
  return visitParisDay({ scheduled_start: now.toISOString() });
}

export function visitParisDay(visit = {}) {
  const date = new Date(visit.scheduled_start || "");
  if (Number.isNaN(date.getTime())) return "";
  const parts = parisParts(date);
  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  const day = parts.find(part => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function visitClock(visit = {}) {
  const date = new Date(visit.scheduled_start || "");
  if (Number.isNaN(date.getTime())) return "";
  const parts = parisParts(date);
  const hour = parts.find(part => part.type === "hour")?.value;
  const minute = parts.find(part => part.type === "minute")?.value;
  return `${hour}:${minute}`;
}

export function parisRange(day, time, durationMinutes = 75) {
  const isoDay = String(day || "").slice(0, 10);
  const clock = String(time || "08:30").slice(0, 5);
  const guess = new Date(`${isoDay}T${clock}:00Z`);
  if (Number.isNaN(guess.getTime())) throw new Error("Date ou heure invalide.");
  const parts = parisParts(guess);
  const get = type => parts.find(part => part.type === type)?.value;
  const asParis = Date.parse(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:00Z`);
  const start = new Date(guess.getTime() - (asParis - guess.getTime()));
  const end = new Date(start.getTime() + Number(durationMinutes || 75) * 60000);
  return { scheduled_start: start.toISOString(), scheduled_end: end.toISOString() };
}

export function confirmedSite(input = {}) {
  const address = String(input.address || "").replace(/\s+/g, " ").trim();
  const postal = String(input.postal || input.postalCode || "").replace(/\s/g, "").trim();
  const city = String(input.city || "").replace(/\s+/g, " ").trim();
  if (address.length < 4) return { ok: false, error: "Confirmez l’adresse avec le client." };
  if (!/^\d{5}$/.test(postal)) return { ok: false, error: "Confirmez le code postal avec le client." };
  if (city.length < 2) return { ok: false, error: "Confirmez la ville avec le client." };
  return { ok: true, address, postal, city, location: `${address}, ${postal} ${city}` };
}

export function agreedClock(value) {
  const time = String(value || "").trim().slice(0, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "";
}

export function nextFreeSlot(usedTimes = []) {
  const used = new Set((usedTimes || []).map(time => String(time || "").slice(0, 5)));
  return TOUR_SLOTS.find(slot => !used.has(slot)) || "";
}

function clockMinutes(clock) {
  const match = String(clock || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function nearestFreeSlot(slots, clock) {
  const minutes = clockMinutes(clock);
  const free = slots.filter(slot => !slot.visit);
  if (minutes == null || !free.length) return null;
  return free.reduce((best, slot) => (
    Math.abs(clockMinutes(slot.standardTime) - minutes) < Math.abs(clockMinutes(best.standardTime) - minutes)
      ? slot
      : best
  ));
}

export function visitPrestation(visit = {}) {
  const nature = String(
    visit.nature_validated || visit.natureValidated || visit.nature_proposed || visit.natureProposed || ""
  );
  if (nature === "depannage") return "depannage";
  if (nature === "installation") return "installation";
  if (nature === "visite_technique" || nature === "visite") return "visite";
  return "maintenance";
}

export function isMaintenanceVisit(visit = {}) {
  return visitPrestation(visit) === "maintenance";
}

export function tourPrestationById(id) {
  return TOUR_PRESTATIONS.find(item => item.id === id) || TOUR_PRESTATIONS[0];
}

/** La base des appels reste un entretien. Un dépannage ou une installation occupe le créneau sans devenir cette base. */
export function pickTourAnchorVisit(slots = [], dayVisits = []) {
  const slotted = [...(slots || [])].reverse().find(slot => slot?.visit && isMaintenanceVisit(slot.visit));
  if (slotted?.visit) return slotted.visit;
  return [...(dayVisits || [])].reverse().find(visit => isMaintenanceVisit(visit) && (visit.location || visit.client_id)) || null;
}

export function serviceTaskText(value) {
  return String(value || "").trim().slice(0, 2000);
}

export function buildServiceVisitRecord({
  organizationId,
  technicianId,
  clientId,
  title,
  location,
  day,
  time,
  nature,
  description,
  actorId,
} = {}) {
  const kind = nature === "installation"
    ? "installation"
    : nature === "visite"
      ? "visite_technique"
      : "depannage";
  const label = kind === "installation"
    ? "Installation"
    : kind === "visite_technique"
      ? "Visite technique"
      : "Dépannage";
  const record = buildCrmVisitRecord({
    organizationId,
    technicianId,
    clientId,
    title: String(title || "").trim() || label,
    location,
    day,
    time,
    durationMinutes: 75,
    actorId,
  });
  return {
    ...record,
    contract_id: null,
    nature_proposed: kind,
    nature_status: "valide",
    nature_validated: kind,
    title: String(title || "").trim() || label,
    description: serviceTaskText(description),
  };
}

export function placeDaySlots(visits = [], day) {
  const slots = TOUR_SLOTS.map(time => ({ time, standardTime: time, visit: null, shifted: false }));
  const extras = [];
  const onDay = (visits || [])
    .filter(visit => visitParisDay(visit) === isoDay(day))
    .sort((a, b) => String(a.scheduled_start || "").localeCompare(String(b.scheduled_start || "")));
  const pending = [];
  for (const visit of onDay) {
    const clock = visitClock(visit);
    const exact = slots.find(item => item.standardTime === clock && !item.visit);
    if (exact) exact.visit = visit;
    else pending.push(visit);
  }
  for (const visit of pending) {
    const clock = visitClock(visit);
    const slot = nearestFreeSlot(slots, clock);
    if (!slot) {
      extras.push(visit);
      continue;
    }
    slot.visit = visit;
    slot.time = clock || slot.standardTime;
    slot.shifted = slot.time !== slot.standardTime;
  }
  return { slots, extras };
}

export function plannedClientIds(visits = [], today) {
  const day = isoDay(today);
  const ids = new Set();
  for (const visit of visits || []) {
    if (!visit?.client_id || !visit?.technician_id) continue;
    if (visit.realization_status === "confirme") continue;
    const when = String(visit.scheduled_start || "").slice(0, 10);
    if (when && day && when >= day) ids.add(visit.client_id);
  }
  return [...ids];
}

const CIVILITY_WORD = /^(m|mr|mme|mlle|me|monsieur|madame|maitre)$/;

function foldSearch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function entretienSearchWords(query) {
  const words = foldSearch(query).split(/[^a-z0-9]+/).filter(Boolean);
  const kept = words.filter(word => !CIVILITY_WORD.test(word));
  return kept.length ? kept : words;
}

export function entretienSearchMatches(hay, query) {
  const words = entretienSearchWords(query);
  if (!words.length) return true;
  const text = foldSearch(hay);
  return words.every(word => text.includes(word));
}

function personLabel(client = {}) {
  return `${client.prenom || client.firstName || ""} ${client.nom || client.lastName || ""}`.trim()
    || client.raison_sociale
    || client.company
    || client.name
    || "";
}

function samePersonName(left, right) {
  const a = entretienSearchWords(left);
  const b = entretienSearchWords(right);
  if (!a.length || !b.length) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.every(word => longer.includes(word));
}

const CLOSED_CONTRACT = /termin|regl|suspend|annul|resili/i;

export function crmContractsAsTourContracts(rows = [], clients = [], coveredIds = []) {
  const covered = new Set(coveredIds || []);
  const byId = new Map((clients || []).filter(client => client?.id).map(client => [String(client.id), client]));
  const out = [];
  for (const row of rows || []) {
    const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
    const status = String(row?.status || payload.status || "");
    if (CLOSED_CONTRACT.test(foldSearch(status))) continue;
    let clientId = String(row?.client_id || payload.clientId || "");
    if (!byId.has(clientId)) {
      const wanted = String(row?.client_name || payload.client || "").trim();
      const match = (clients || []).find(client => samePersonName(wanted, personLabel(client)));
      clientId = match?.id ? String(match.id) : "";
    }
    if (!clientId || covered.has(clientId)) continue;
    covered.add(clientId);
    out.push({
      id: `paper:${row.record_id || clientId}`,
      client_id: clientId,
      frequency: payload.frequency || "Annuelle",
      notes: "",
      number: payload.number || row?.title || null,
      status: status || "Actif",
      amount: payload.amount ?? null,
    });
  }
  return out;
}

export function postalNear(anchorPostal, postal) {
  const left = String(anchorPostal || "").replace(/\D/g, "").slice(0, 2);
  const right = String(postal || "").replace(/\D/g, "").slice(0, 2);
  return Boolean(left && right && left === right);
}

export function pickGeocodeCandidates(rows = [], anchorPostal, cap = 40) {
  const same = [];
  const rest = [];
  for (const row of rows || []) {
    if (postalNear(anchorPostal, row.client_postal)) same.push(row);
    else rest.push(row);
  }
  return [...same, ...rest].slice(0, cap);
}

const TONE_RANK = { retard: 0, premier: 1, echeance: 2, rappel: 3, "rappel-futur": 4, "trop-tot": 5, planifie: 6, arret: 7 };

export function rankCallList(rows = [], {
  today,
  query = "",
  anchor = null,
  bookedClientIds = [],
  radiusKm = TOUR_RADIUS_KM,
  limit,
} = {}) {
  const q = String(query || "").trim().toLowerCase();
  const booked = new Set(bookedClientIds || []);
  const useKm = !q && anchor?.lat != null && anchor?.lon != null;
  const scored = [];
  for (const row of rows || []) {
    if (!row?.client_id || booked.has(row.client_id)) continue;
    const card = callCard(row, today);
    const hay = `${row.client_name || ""} ${row.client_city || ""} ${row.client_postal || ""} ${row.phone || ""}`;
    if (q && !entretienSearchMatches(hay, q)) continue;
    if (!q && !card.callable) continue;
    const km = useKm ? haversineKm(anchor, row) : null;
    if (useKm && (km == null || km > radiusKm)) continue;
    scored.push({ ...row, ...card, km });
  }
  scored.sort((a, b) => {
    const tone = (TONE_RANK[a.tone] ?? 9) - (TONE_RANK[b.tone] ?? 9);
    if (tone) return tone;
    if (useKm) return (a.km ?? 999) - (b.km ?? 999);
    return String(a.lastOn || "9999").localeCompare(String(b.lastOn || "9999"));
  });
  const cap = limit ?? (q ? 20 : useKm ? TOUR_NEARBY_LIMIT : TOUR_CALL_LIMIT);
  return scored.slice(0, cap);
}

export function tourWeekDays(anchor) {
  const start = startOfWeekMonday(anchor);
  return Array.from({ length: 6 }, (_, index) => addDaysIso(start, index));
}

function foldRole(role) {
  return String(role || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function tourTechnicianRole(role) {
  const folded = foldRole(role);
  if (folded === "technicien" || folded.startsWith("technicien ")) return "Technicien";
  if (folded === "responsable technique" || folded === "conducteur de travaux") return "Responsable technique";
  const label = normalizeRoleLabel(role);
  const known = foldRole(label);
  if (known === "technicien") return "Technicien";
  if (known === "responsable technique") return "Responsable technique";
  return "";
}

export function parseTourTechnicianIds(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  const seen = new Set();
  const ids = [];
  for (const item of raw) {
    const id = String(item || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function pickTourTechnicians(rows = []) {
  return (rows || [])
    .map(row => {
      const role = tourTechnicianRole(row?.role);
      if (!row?.id || !role) return null;
      return {
        id: row.id,
        name: row.full_name || row.name || row.email || row.id,
        role,
        active: row.active !== false && row.active !== "false",
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const rank = role => (isFieldMaintenanceTechnician(role) ? 0 : 1);
      const byRole = rank(a.role) - rank(b.role);
      if (byRole) return byRole;
      return String(a.name).localeCompare(String(b.name), "fr");
    });
}

export function indicatedEntretienRecord({
  organizationId,
  clientId,
  contractId,
  day,
  actorId,
  title,
  location,
} = {}) {
  const iso = isoDay(day);
  if (!iso) throw new Error("Date invalide.");
  if (!clientId) throw new Error("Client manquant.");
  const at = new Date().toISOString();
  return {
    organization_id: organizationId,
    technician_id: null,
    contract_id: contractId || null,
    source: "saisie",
    title: String(title || "").trim() || "Entretien indiqué à l’appel",
    location: location || "",
    scheduled_start: null,
    scheduled_end: null,
    client_id: clientId,
    client_link_status: "valide",
    client_linked_at: at,
    client_linked_by: actorId || null,
    nature_proposed: "entretien",
    nature_status: "valide",
    nature_validated: "entretien",
    nature_validated_at: at,
    nature_validated_by: actorId || null,
    realization_status: "confirme",
    realization_date: iso,
    realization_basis: "autre",
    realization_note: "Date indiquée par le client lors de l’appel. Ce n’est pas un rendez-vous d’agenda.",
    realization_recorded_at: at,
    realization_recorded_by: actorId || null,
  };
}
