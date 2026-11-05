/** Agenda commercial MKL — kinds, statuts, conflits, notifications. */

import { canAssignClientCommercial, isPhoneNumber } from "./clients.js";
import { canDispatchProspects, isFieldProspector, isProspectDispatcher } from "./prospect-dispatch.js";
import { isOpenAgendaStatus, normalizeAgendaStatus } from "./appointment-status.js";
import { getRoleDefinition, normalizeRoleLabel } from "./roles.js";

export {
  AGENDA_STATUSES,
  CLOSED_STATUSES,
  ICOLL_RDV_STATUSES,
  normalizeAgendaStatus,
  isOpenAgendaStatus,
  statusMatchesFilter,
} from "./appointment-status.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAgendaUuid(value) {
  return UUID_RE.test(String(value || ""));
}

function extraOf(row) {
  const extra = row?.extra;
  if (extra && typeof extra === "object" && !Array.isArray(extra)) return extra;
  if (typeof extra === "string") {
    try {
      const parsed = JSON.parse(extra);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export const PARIS_TZ = "Europe/Paris";

export const ACTION_KINDS = [
  { id: "rendez-vous", label: "Programmer un rendez-vous" },
  { id: "rappel", label: "Programmer un rappel téléphonique" },
];

export const AGENDA_CREATE_KINDS = [
  { id: "rendez-vous", label: "Rendez-vous" },
  { id: "rappel", label: "Rappel" },
  { id: "formation", label: "Formation" },
  { id: "accompagnement", label: "Accompagnement" },
  { id: "autre", label: "Autre" },
];

const PERSONAL_AGENDA_KINDS = new Set(["formation", "accompagnement", "autre"]);

export const MEETING_MODES = ["domicile", "bureau", "téléphone", "visioconférence"];

export const PRIORITIES = ["basse", "normale", "haute", "urgente"];

export const APPOINTMENT_TYPES = [
  "Visite commerciale",
  "Appel téléphonique",
  "Visioconférence",
  "Relance",
  "Présentation devis",
  "Autre",
];

export const REMINDER_PRESETS = [
  { value: 1440, label: "24 heures avant" },
  { value: 120, label: "2 heures avant" },
  { value: 30, label: "30 minutes avant" },
];

export function normalizeActionKind(kind) {
  const value = String(kind || "").trim().toLowerCase();
  if (value.includes("rappel")) return "rappel";
  if (PERSONAL_AGENDA_KINDS.has(value)) return value;
  return "rendez-vous";
}

export function isPersonalAgendaKind(kind) {
  return PERSONAL_AGENDA_KINDS.has(normalizeActionKind(kind));
}

export function agendaKindLabel(kind) {
  return {
    rappel: "Rappel",
    formation: "Formation",
    accompagnement: "Accompagnement",
    autre: "Autre",
    busy: "Indisponible",
  }[normalizeActionKind(kind)] || "RDV";
}

export function agendaEventTone(item = {}) {
  if (item.source === "google") return "google";
  if (item.private || item.kind === "busy") return "busy";
  const status = normalizeAgendaStatus(item.status);
  if (
    status === "Annulé"
    || status === "Absence du prospect"
    || status === "Client absent"
    || status === "Client problématique"
    || status === "Client non équipable"
    || status === "RDV annulé définitivement"
    || status === "Commande refusée"
  ) return "cancelled";
  if (status === "Réalisé" || status === "Rappel effectué" || status === "Commande signée") return "done";
  if (status === "Confirmé" || status === "Client en réflexion") return "confirmed";
  const kind = normalizeActionKind(item.kind);
  if (kind === "rappel") return "reminder";
  if (kind === "formation" || kind === "accompagnement" || kind === "autre") return kind;
  return "visit";
}

export function agendaEventColor(item = {}) {
  return {
    visit: "#2563eb",
    reminder: "#f5b400",
    formation: "#0f766e",
    accompagnement: "#c2410c",
    autre: "#0369a1",
    confirmed: "#059669",
    cancelled: "#e11d48",
    done: "#64748b",
    busy: "#0f172a",
    google: "#039be5",
  }[agendaEventTone(item)] || "#2563eb";
}

const GOOGLE_CALENDAR_PALETTE = [
  "#039be5",
  "#7986cb",
  "#33b679",
  "#8e24aa",
  "#e67c73",
  "#f6bf26",
  "#f4511e",
  "#0b8043",
  "#3f51b5",
  "#616161",
  "#d50000",
  "#009688",
];

export function googleCalendarColor(id, colors = {}, fallback = "") {
  const chosen = String(colors?.[String(id || "")] || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(chosen)) return chosen.toLowerCase();
  const given = String(fallback || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(given)) return given.toLowerCase();
  const raw = String(id || "agenda");
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  return GOOGLE_CALENDAR_PALETTE[hash % GOOGLE_CALENDAR_PALETTE.length];
}

export function parseAgendaDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function appointmentEnd(item = {}) {
  const start = parseAgendaDate(item.start || item.starts_at);
  if (!start) return null;
  const duration = Number(item.duration || item.duration_minutes || 60) || 60;
  return new Date(start.getTime() + duration * 60000);
}

export function eventsOverlap(a, b) {
  const aStart = parseAgendaDate(a.start || a.starts_at)?.getTime();
  const aEnd = appointmentEnd(a)?.getTime();
  const bStart = parseAgendaDate(b.start || b.starts_at)?.getTime();
  const bEnd = appointmentEnd(b)?.getTime();
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart < bEnd && bStart < aEnd;
}

export function findOverlaps(appointments, candidate, { excludeId } = {}) {
  const commercialId = String(candidate.commercialId || candidate.commercial_id || "");
  if (!commercialId) return [];
  return (appointments || []).filter(item => {
    if (excludeId && String(item.id) === String(excludeId)) return false;
    if (String(item.commercialId || item.commercial_id || "") !== commercialId) return false;
    if (!isOpenAgendaStatus(item.status)) return false;
    return eventsOverlap(item, candidate);
  });
}

export function nextAvailableSlots(appointments, { commercialId, duration = 60, from = new Date(), count = 3 } = {}) {
  const slots = [];
  const cursor = new Date(from);
  if (cursor.getMinutes() > 0 || cursor.getSeconds() > 0) {
    cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
  }
  let guard = 0;
  while (slots.length < count && guard < 240) {
    guard += 1;
    if (cursor.getHours() < 8) cursor.setHours(8, 0, 0, 0);
    if (cursor.getHours() >= 18) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(8, 0, 0, 0);
      continue;
    }
    if (cursor.getDay() === 0) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(8, 0, 0, 0);
      continue;
    }
    const candidate = { commercialId, start: cursor.toISOString(), duration };
    if (!findOverlaps(appointments, candidate).length) {
      slots.push(new Date(cursor));
    }
    cursor.setMinutes(cursor.getMinutes() + 30);
  }
  return slots;
}

export function canAssignAgendaCommercial(profile) {
  return canDispatchProspects(profile);
}

export function canOverrideAgendaConflicts(profile) {
  return canAssignClientCommercial(profile);
}

/** L'agenda du responsable commercial n'a pas de limite de rendez-vous sur un créneau : il les reçoit pour les répartir. */
export function allowsStackedAgendaSlots(profile, userId, commercialId, holderRole = "") {
  const holder = String(commercialId || "");
  if (!holder) return false;
  if (normalizeRoleLabel(holderRole) === "Responsable commercial") return true;
  if (normalizeRoleLabel(profile?.role) !== "Responsable commercial") return false;
  return holder === String(userId || "");
}

export function resolveAssignedCommercialId(profile, userId, requestedId) {
  if (canAssignAgendaCommercial(profile) && isAgendaUuid(requestedId)) return String(requestedId);
  if (isProspectDispatcher(profile) && !requestedId) return "";
  if (isFieldProspector(profile)) return "";
  return String(userId || "");
}

const ASSIGN_COMMENT_KEYS = new Set(["commercialId", "commercial", "notes"]);
const PHONE_KEYS = new Set(["phone", "appointmentPhone"]);

/** Attribution au vendeur et commentaire, sans déplacer ni réécrire le rendez-vous. */
export function isAgendaAssignOrCommentPatch(body = {}) {
  const keys = Object.keys(body || {});
  return keys.length > 0 && keys.every(key => ASSIGN_COMMENT_KEYS.has(key));
}

export function isAgendaPhonePatch(body = {}) {
  const keys = Object.keys(body || {});
  return keys.length > 0 && keys.every(key => PHONE_KEYS.has(key));
}

export function agendaInstant(value) {
  const time = new Date(value || "").getTime();
  return Number.isNaN(time) ? null : time;
}

/** Vrai dès qu’une requête tente de changer la date, l’heure ou la durée. */
export function agendaScheduleIsChanging(existing = {}, body = {}) {
  const currentStart = agendaInstant(existing.starts_at || existing.start);
  const nextStartRaw = combineDateAndTime(body.appointmentDate, body.appointmentStart)
    || body.start
    || body.appointmentAt
    || body.starts_at
    || "";
  if (nextStartRaw) {
    const nextStart = agendaInstant(nextStartRaw);
    if (nextStart == null || currentStart == null || nextStart !== currentStart) return true;
  } else if (body.appointmentDate || body.appointmentStart || body.appointmentEnd || body.end) {
    return true;
  }
  if (body.duration != null || body.duration_minutes != null) {
    const nextDuration = Number(body.duration ?? body.duration_minutes);
    const currentDuration = Number(existing.duration_minutes ?? existing.duration ?? 60);
    if (nextDuration !== currentDuration) return true;
  }
  return false;
}

export const APPOINTMENT_MOVE_ERROR = "Un rendez-vous existant ne peut pas être déplacé. Sa date et son heure restent celles d’origine. Dupliquez-le pour en créer un autre.";

/** Réattribution sans limite de date : l’ancienneté du rendez-vous n’entre pas en compte. */
export function canReassignAgendaAppointment(profile, _appointment = null) {
  return canAssignClientCommercial(profile) || isProspectDispatcher(profile);
}

export function canCorrectAppointmentPhone(_profile, userId, item) {
  const assigned = String(item?.commercialId || item?.commercial_id || "");
  return Boolean(userId && assigned && assigned === String(userId));
}

export function appointmentPhoneError(value) {
  const phone = String(value || "").trim();
  if (!phone) return "Indiquez le numéro de téléphone.";
  if (!isPhoneNumber(phone)) return "Le numéro de téléphone est invalide.";
  return "";
}

export function canViewAppointmentHistory(profile) {
  const definition = getRoleDefinition(profile?.role);
  if (definition) return Boolean(definition.isAdmin);
  return ["Admin VIP", "Superadmin"].includes(normalizeRoleLabel(profile?.role));
}

export const APPOINTMENT_HISTORY_ACTIONS = {
  create: "Création",
  phone: "Correction du numéro",
  reassign: "Réattribution",
  duplicate: "Duplication",
  update: "Modification",
};

const HISTORY_FIELDS = {
  create: "Création",
  phone: "Téléphone",
  commercial_id: "Commercial",
  status: "Statut",
  notes: "Commentaire",
  starts_at: "Date",
  duration_minutes: "Durée",
  duplicate: "Lien de duplication",
};

export function appointmentHistoryAction(row = {}) {
  if (row.action && APPOINTMENT_HISTORY_ACTIONS[row.action]) return row.action;
  if (row.field === "commercial_id") return "reassign";
  if (row.field === "phone") return "phone";
  if (row.field === "create") return "create";
  if (row.field === "duplicate") return "duplicate";
  return "update";
}

export function presentAppointmentHistoryEntry(row = {}) {
  const action = appointmentHistoryAction(row);
  return {
    id: row.id,
    at: row.created_at || row.at || "",
    userName: row.user_name || row.userName || "—",
    action,
    actionLabel: APPOINTMENT_HISTORY_ACTIONS[action] || "Modification",
    field: row.field || "",
    fieldLabel: HISTORY_FIELDS[row.field] || row.field || "Champ",
    oldValue: row.old_value === undefined ? (row.oldValue ?? null) : row.old_value,
    newValue: row.new_value === undefined ? (row.newValue ?? null) : row.new_value,
  };
}

export function canWriteAgendaComment(profile, userId, item) {
  if (canAssignClientCommercial(profile)) return true;
  const assigned = String(item?.commercialId || item?.commercial_id || "");
  return Boolean(userId && assigned && assigned === String(userId));
}

export function readAgendaExtra(row = {}) {
  const extra = extraOf(row);
  return {
    kind: normalizeActionKind(row.kind || extra.kind || extra.actionKind),
    subject: String(row.subject || extra.subject || extra.objet || ""),
    address: String(row.address || extra.address || extra.adresse || ""),
    phone: String(row.phone || extra.phone || extra.telephone || ""),
    priority: PRIORITIES.includes(extra.priority) ? extra.priority : (row.priority || "normale"),
    meetingMode: MEETING_MODES.includes(extra.meetingMode) ? extra.meetingMode : (extra.meeting_mode || row.meeting_mode || ""),
    reminderOffsets: Array.isArray(extra.reminderOffsets)
      ? extra.reminderOffsets.map(Number).filter(n => n >= 0)
      : Array.isArray(row.reminder_offsets)
        ? row.reminder_offsets.map(Number)
        : [1440, 120, 30],
    notifyCrm: extra.notifyCrm !== false,
    notifyEmail: extra.notifyEmail !== false,
    notifyGoogle: extra.notifyGoogle !== false,
    googleEventId: row.google_event_id || extra.googleEventId || "",
    googleCalendarId: row.google_calendar_id || extra.googleCalendarId || "primary",
    syncStatus: row.sync_status || extra.syncStatus || "none",
    syncError: row.sync_error || extra.syncError || "",
    lastSyncedAt: row.last_synced_at || extra.lastSyncedAt || "",
    notifiedAt: extra.notifiedAt && typeof extra.notifiedAt === "object" ? extra.notifiedAt : {},
  };
}

export function writeAgendaExtra(input = {}, previous = {}) {
  const extra = extraOf(previous);
  const kind = normalizeActionKind(input.kind || input.actionKind || extra.kind);
  const reminderOffsets = Array.isArray(input.reminderOffsets)
    ? input.reminderOffsets.map(Number).filter(n => n >= 0)
    : typeof input.reminderCustom === "string" && input.reminderCustom
      ? [...REMINDER_PRESETS.map(item => item.value).filter(value => input[`reminder_${value}`] === "on" || input[`reminder_${value}`] === true), Number(input.reminderCustom)].filter(n => n >= 0)
      : extra.reminderOffsets || [1440, 120, 30];
  return {
    ...extra,
    kind,
    actionKind: kind,
    subject: String(input.subject || extra.subject || "").trim(),
    address: String(input.address || extra.address || "").trim(),
    phone: String(input.phone || extra.phone || "").trim(),
    priority: PRIORITIES.includes(input.priority) ? input.priority : extra.priority || "normale",
    meetingMode: MEETING_MODES.includes(input.meetingMode) ? input.meetingMode : extra.meetingMode || (kind === "rappel" ? "téléphone" : "domicile"),
    reminderOffsets,
    notifyCrm: input.notifyCrm !== false && input.notifyCrm !== "off",
    notifyEmail: input.notifyEmail !== false && input.notifyEmail !== "off",
    notifyGoogle: input.notifyGoogle !== false && input.notifyGoogle !== "off",
    googleEventId: extra.googleEventId || "",
    googleCalendarId: extra.googleCalendarId || "primary",
    syncStatus: extra.syncStatus || "none",
    syncError: extra.syncError || "",
    lastSyncedAt: extra.lastSyncedAt || "",
    notifiedAt: extra.notifiedAt || {},
  };
}

export function validateNextAction(input = {}, { required = true } = {}) {
  const errors = [];
  const kind = String(input.kind || input.actionKind || "").trim().toLowerCase();
  if (required && kind !== "rendez-vous" && kind !== "rappel" && kind !== "rdv") {
    errors.push("Choisissez une prochaine action : rendez-vous ou fiche contact.");
  }
  const start = String(input.start || input.appointmentAt || input.starts_at || "").trim();
  if (required && !start) errors.push("La date et l’heure de la prochaine action sont obligatoires.");
  if (start && Number.isNaN(new Date(start).getTime())) {
    errors.push("La date de la prochaine action est invalide.");
  }
  return errors;
}

const HAS_ZONE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

function zonePart(date, timeZone, type) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const value = parts.find(part => part.type === type)?.value || "0";
  return type === "hour" && value === "24" ? "0" : value;
}

function timeZoneOffsetMs(date, timeZone = PARIS_TZ) {
  const asUtc = Date.UTC(
    Number(zonePart(date, timeZone, "year")),
    Number(zonePart(date, timeZone, "month")) - 1,
    Number(zonePart(date, timeZone, "day")),
    Number(zonePart(date, timeZone, "hour")),
    Number(zonePart(date, timeZone, "minute")),
    Number(zonePart(date, timeZone, "second"))
  );
  return asUtc - date.getTime();
}

/** Heure civile saisie (sans fuseau) → instant UTC de cette heure à Paris. */
export function parisWallTimeToIso(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (HAS_ZONE.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return "";
  const utcGuess = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0
  );
  const offset = timeZoneOffsetMs(new Date(utcGuess));
  let instant = utcGuess - offset;
  const offsetAtInstant = timeZoneOffsetMs(new Date(instant));
  if (offsetAtInstant !== offset) instant = utcGuess - offsetAtInstant;
  return new Date(instant).toISOString();
}

export function parisDateTimeParts(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (!HAS_ZONE.test(raw)) {
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    if (match) return { date: match[1], time: match[2] };
  }
  const date = parseAgendaDate(raw);
  if (!date) return null;
  const hour = zonePart(date, PARIS_TZ, "hour").padStart(2, "0");
  const minute = zonePart(date, PARIS_TZ, "minute").padStart(2, "0");
  const month = zonePart(date, PARIS_TZ, "month").padStart(2, "0");
  const day = zonePart(date, PARIS_TZ, "day").padStart(2, "0");
  return {
    date: `${zonePart(date, PARIS_TZ, "year")}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

export function combineDateAndTime(dateValue, timeValue) {
  const date = String(dateValue || "").trim();
  const time = String(timeValue || "").trim() || "09:00";
  if (!date) return "";
  if (HAS_ZONE.test(date)) return parisWallTimeToIso(date);
  const wall = date.includes("T") ? date : `${date}T${time.slice(0, 5)}`;
  return parisWallTimeToIso(wall) || wall;
}

export function durationFromRange(start, end, fallback = 60) {
  const from = parseAgendaDate(start);
  const to = parseAgendaDate(end);
  if (!from || !to || to <= from) return fallback;
  return Math.max(15, Math.round((to.getTime() - from.getTime()) / 60000));
}

export function isOverdue(item, now = Date.now()) {
  if (!isOpenAgendaStatus(item?.status)) return false;
  const end = appointmentEnd(item) || parseAgendaDate(item?.start || item?.starts_at);
  return Boolean(end && end.getTime() < now);
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function sameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function groupUpcomingAgenda(appointments = [], now = new Date()) {
  const open = (appointments || []).filter(item => isOpenAgendaStatus(item.status));
  const overdue = open.filter(item => isOverdue(item, now.getTime())).sort(byStart);
  const remaining = open.filter(item => !isOverdue(item, now.getTime())).sort(byStart);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);
  return {
    overdue,
    today: remaining.filter(item => sameDay(parseAgendaDate(item.start) || 0, now)),
    tomorrow: remaining.filter(item => sameDay(parseAgendaDate(item.start) || 0, tomorrow)),
    week: remaining.filter(item => {
      const start = parseAgendaDate(item.start);
      return start && start >= startOfDay(now) && start < weekEnd;
    }),
    upcoming: remaining,
  };
}

function byStart(a, b) {
  return String(a.start || a.starts_at || "").localeCompare(String(b.start || b.starts_at || ""));
}

export function agendaHomeMetrics(appointments = [], now = new Date()) {
  const groups = groupUpcomingAgenda(appointments, now);
  return {
    todayVisits: groups.today.filter(item => normalizeActionKind(item.kind) === "rendez-vous").length,
    todayReminders: groups.today.filter(item => normalizeActionKind(item.kind) === "rappel").length,
    overdueCount: groups.overdue.length,
    weekCount: groups.week.length,
  };
}

export function dueReminders(appointments = [], now = Date.now()) {
  return (appointments || []).flatMap(item => {
    if (!isOpenAgendaStatus(item.status) || item.notifyCrm === false) return [];
    const start = parseAgendaDate(item.start)?.getTime();
    if (!start) return [];
    const notifiedAt = item.notifiedAt || {};
    return (item.reminderOffsets || [1440, 120, 30])
      .filter(offset => {
        const dueAt = start - Number(offset) * 60000;
        return dueAt <= now && start > now && !notifiedAt[String(offset)];
      })
      .map(offset => ({ appointment: item, offset }));
  });
}

export function isAuxiliaryGoogleCalendar(calendar = {}) {
  return /holiday|weeknum|contacts|#en\.|#fr\./i.test(`${calendar.id || ""} ${calendar.summary || ""}`);
}

export function googlePrimaryAliases({ primaryId = "", accountCalendarId = "" } = {}) {
  return [...new Set(
    ["primary", primaryId, accountCalendarId].map(id => String(id || "").trim()).filter(Boolean)
  )];
}

export function isGooglePrimaryAlias(calendarId, aliases = []) {
  return aliases.includes(String(calendarId || "primary").trim() || "primary");
}

export function findStoredGoogleEvent(items = [], eventId, calendarId, aliases = []) {
  const id = String(eventId || "");
  if (!id) return null;
  const incoming = String(calendarId || "primary");
  const primary = isGooglePrimaryAlias(incoming, aliases);
  return (items || []).find(item => {
    if (String(item?.googleEventId || "") !== id) return false;
    const stored = String(item.googleCalendarId || "primary");
    if (stored === incoming) return true;
    return primary && isGooglePrimaryAlias(stored, aliases);
  }) || null;
}

export function isTechnicalGoogleCalendarId(value) {
  const text = String(value || "").trim();
  return /@(group|resource)\.calendar\.google\.com$/i.test(text) || /^[a-f0-9]{16,}$/i.test(text);
}

export function isCheckedGoogleCalendar(calendar = {}) {
  if (calendar.hidden === true && calendar.onSidebar !== true) return false;
  if (calendar.selected === false) return false;
  if (calendar.selected === true || calendar.primary === true) return true;
  return calendar.onSidebar === true;
}

function readableGoogleCalendarName(name, id) {
  const text = String(name || "").trim();
  if (!text || isTechnicalGoogleCalendarId(text)) return "";
  if (text === id && isTechnicalGoogleCalendarId(id)) return "";
  return text;
}

export function googleCalendarsToImport(calendars = [], calendarIds) {
  const list = calendars || [];
  if (Array.isArray(calendarIds)) {
    const wanted = new Set(calendarIds.map(id => String(id || "").trim()).filter(Boolean));
    return list.filter(calendar => wanted.has(calendar.id));
  }
  return list.filter(isCheckedGoogleCalendar);
}

export function googleAgendaChoices(calendars = [], appointments = [], viewerId = "") {
  const byId = new Map();
  const add = (id, summary, primary, color) => {
    const key = String(id || "").trim();
    if (!key || key === "primary") return;
    const current = byId.get(key);
    const isPrimary = Boolean(primary || current?.primary);
    const name = readableGoogleCalendarName(summary, key) || readableGoogleCalendarName(current?.summary, key);
    const paint = /^#[0-9a-f]{6}$/i.test(String(color || "")) ? String(color).toLowerCase() : (current?.color || "");
    byId.set(key, {
      id: key,
      summary: name || (isPrimary ? "Agenda principal" : "Agenda"),
      primary: isPrimary,
      color: paint,
    });
  };
  for (const calendar of calendars || []) {
    if (isCheckedGoogleCalendar(calendar)) add(calendar.id, calendar.summary, calendar.primary, calendar.backgroundColor);
  }
  const primary = [...byId.values()].find(item => item.primary);
  for (const item of appointments || []) {
    if (item?.source !== "google") continue;
    if (viewerId && String(item.commercialId || "") !== String(viewerId)) continue;
    const id = String(item.googleCalendarId || "");
    if (!id || id === "primary") continue;
    const summary = item.googleCalendarSummary || (isTechnicalGoogleCalendarId(id) ? "" : id);
    add(id, summary, Boolean(primary && id === primary.id));
  }
  return [...byId.values()].sort((a, b) => Number(b.primary) - Number(a.primary) || a.summary.localeCompare(b.summary, "fr"));
}

export function isGoogleAgendaCalendarShown(item, hidden = {}, menu = [], viewerId = "") {
  if (item?.source !== "google") return true;
  if (viewerId && String(item.commercialId || "") !== String(viewerId)) return true;
  const stored = String(item.googleCalendarId || "primary");
  if (hidden?.[stored]) return false;
  const primary = (menu || []).find(calendar => calendar.primary);
  const aliases = googlePrimaryAliases({ primaryId: primary?.id || "" });
  if (primary && aliases.includes(stored) && hidden?.[primary.id]) return false;
  return true;
}

export function extraGoogleCopies(items = [], eventId, calendarId, aliases = [], keeperId = "") {
  const id = String(eventId || "");
  const incoming = String(calendarId || "primary");
  const primary = isGooglePrimaryAlias(incoming, aliases);
  return (items || []).filter(item => {
    if (item?.source !== "google" || !isAgendaUuid(item?.id)) return false;
    if (keeperId && String(item.id) === String(keeperId)) return false;
    if (String(item.googleEventId || "") !== id) return false;
    const stored = String(item.googleCalendarId || "primary");
    if (stored === incoming) return true;
    return primary && isGooglePrimaryAlias(stored, aliases);
  });
}

export function googleEventToRecord(event, { organizationId, commercialId, calendarId, calendarSummary } = {}) {
  if (!event?.id || event.status === "cancelled" || event.transparency === "transparent") return null;
  const start = new Date(event.start?.dateTime || (event.start?.date ? `${event.start.date}T09:00:00` : ""));
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(event.end?.dateTime || (event.end?.date ? `${event.end.date}T09:00:00` : start.getTime() + 60 * 60000));
  const duration = Number.isNaN(end.getTime()) || end <= start
    ? 60
    : Math.min(24 * 60, Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)));
  const title = String(event.summary || "").trim() || "Sans titre";
  const address = String(event.location || "").trim();
  const notes = String(event.description || "").trim();
  const allDay = Boolean(event.start?.date && !event.start?.dateTime);
  return {
    organization_id: organizationId,
    opportunity_id: null,
    prospect_name: title,
    city: null,
    project_type: null,
    starts_at: start.toISOString(),
    duration_minutes: duration,
    commercial_id: commercialId || null,
    manager_id: null,
    status: "Planifié",
    notes: notes || null,
    extra: {
      kind: "busy",
      actionKind: "busy",
      subject: title,
      address,
      source: "google",
      private: false,
      allDay,
      googleEventId: event.id,
      googleCalendarId: calendarId || "primary",
      googleCalendarSummary: String(calendarSummary || "").trim(),
      syncStatus: "Synchronisé",
      notifyGoogle: false,
      notifyCrm: false,
      notifyEmail: false,
    },
    created_by: commercialId || null,
    updated_at: new Date().toISOString(),
  };
}

export function googleEventPayload(item = {}, { crmUrl = "" } = {}) {
  const start = parseAgendaDate(item.start);
  const end = appointmentEnd(item) || start;
  const kindLabel = normalizeActionKind(item.kind) === "rappel" ? "Rappel" : "Rendez-vous";
  const lines = [
    `${kindLabel} commercial MKL Énergies`,
    item.subject && `Objet : ${item.subject}`,
    item.phone && `Téléphone : ${item.phone}`,
    item.commercial && `Commercial : ${item.commercial}`,
    item.notes && item.notes,
    item.prospectId && crmUrl && `Fiche CRM : ${crmUrl.replace(/\/$/, "")}/?agenda=${item.id}`,
  ].filter(Boolean);
  return {
    summary: `${kindLabel} — ${item.prospectName || "Prospect"}`.slice(0, 250),
    description: lines.join("\n"),
    location: item.address || item.city || "",
    start: start ? { dateTime: start.toISOString(), timeZone: PARIS_TZ } : null,
    end: end ? { dateTime: end.toISOString(), timeZone: PARIS_TZ } : null,
  };
}

export function formatAgendaTime(value) {
  const date = parseAgendaDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: PARIS_TZ }).format(date);
}

function parisMinutes(date) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: PARIS_TZ,
  }).formatToParts(date);
  return Number(parts.find(part => part.type === "hour")?.value || 0) * 60
    + Number(parts.find(part => part.type === "minute")?.value || 0);
}

export const AGENDA_DAY_START_HOUR = 7;
export const AGENDA_DAY_HOUR_COUNT = 13;
export const AGENDA_DURATIONS = [30, 60, 90, 120, 180, 240];

export function agendaDateKey(value) {
  const date = value instanceof Date ? value : parseAgendaDate(value);
  if (!date) return "";
  return parisDateTimeParts(date.toISOString())?.date || "";
}

export function formatTimeFromMinutes(total) {
  const hours = Math.floor(Number(total) / 60);
  const minutes = Math.round(Number(total) % 60);
  return `${String(((hours % 24) + 24) % 24).padStart(2, "0")}:${String(((minutes % 60) + 60) % 60).padStart(2, "0")}`;
}

export function minutesFromCanvasPoint(clientY, rect, {
  startHour = AGENDA_DAY_START_HOUR,
  hourCount = AGENDA_DAY_HOUR_COUNT,
  step = 15,
} = {}) {
  const height = Number(rect?.height) || 1;
  const ratio = Math.min(1, Math.max(0, (Number(clientY) - Number(rect?.top || 0)) / height));
  const raw = startHour * 60 + ratio * hourCount * 60;
  return Math.round(raw / step) * step;
}

export function nearestAgendaDuration(minutes) {
  const value = Math.max(AGENDA_DURATIONS[0], Number(minutes) || AGENDA_DURATIONS[0]);
  return AGENDA_DURATIONS.reduce((best, option) => (
    Math.abs(option - value) < Math.abs(best - value) ? option : best
  ));
}

export function slotCreateDefaults(day, startMinutes, endMinutes) {
  const from = Math.min(Number(startMinutes) || 0, Number(endMinutes) || 0);
  const to = Math.max(Number(startMinutes) || 0, Number(endMinutes) || 0);
  return {
    appointmentDate: agendaDateKey(day),
    appointmentStart: formatTimeFromMinutes(from),
    duration: String(nearestAgendaDuration(Math.max(30, to - from))),
  };
}

export function slotDraftLayout(startMinutes, endMinutes, {
  startHour = AGENDA_DAY_START_HOUR,
  hourCount = AGENDA_DAY_HOUR_COUNT,
} = {}) {
  const windowStart = startHour * 60;
  const windowEnd = windowStart + hourCount * 60;
  const from = Math.min(Math.max(Math.min(Number(startMinutes) || windowStart, Number(endMinutes) || windowStart), windowStart), windowEnd - 15);
  const to = Math.min(Math.max(Math.max(Number(startMinutes) || from, Number(endMinutes) || from), from + 15), windowEnd);
  const span = windowEnd - windowStart;
  return {
    topPercent: ((from - windowStart) / span) * 100,
    heightPercent: ((to - from) / span) * 100,
  };
}

export function isAllDayAgendaEvent(item = {}) {
  return Boolean(item.allDay || item.extra?.allDay) || Number(item.duration || item.duration_minutes || 0) >= 23 * 60;
}

export function formatAgendaRange(item = {}) {
  const start = formatAgendaTime(item.start);
  if (!start) return "";
  if (isAllDayAgendaEvent(item)) return "Journée";
  const endLabel = formatAgendaTime(appointmentEnd(item));
  if (!endLabel || endLabel === start) return start;
  return `${start} – ${endLabel}`;
}

function agendaEventInterval(item) {
  const layout = eventTimeLayout(item);
  if (!layout) return null;
  return {
    id: String(item.id),
    topPercent: layout.topPercent,
    heightPercent: layout.heightPercent,
    end: layout.topPercent + layout.heightPercent,
  };
}

export function packAgendaColumns(items = []) {
  const sorted = (items || []).map(agendaEventInterval).filter(Boolean)
    .sort((a, b) => a.topPercent - b.topPercent || b.heightPercent - a.heightPercent);
  const placed = new Map();
  let cluster = [];
  let clusterEnd = -1;
  function flush() {
    if (!cluster.length) return;
    const columnEnds = [];
    for (const item of cluster) {
      let column = 0;
      while (columnEnds[column] != null && columnEnds[column] > item.topPercent + 0.05) column += 1;
      columnEnds[column] = item.end;
      item.column = column;
    }
    const count = Math.max(columnEnds.length, 1);
    for (const item of cluster) {
      placed.set(item.id, {
        topPercent: item.topPercent,
        heightPercent: item.heightPercent,
        column: item.column,
        columns: count,
      });
    }
    cluster = [];
    clusterEnd = -1;
  }
  for (const item of sorted) {
    if (cluster.length && item.topPercent >= clusterEnd - 0.05) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return placed;
}

export function eventTimeLayout(item, {
  startHour = AGENDA_DAY_START_HOUR,
  hourCount = AGENDA_DAY_HOUR_COUNT,
} = {}) {
  const start = parseAgendaDate(item.start);
  if (!start || isAllDayAgendaEvent(item)) return null;
  const end = appointmentEnd(item) || new Date(start.getTime() + 60 * 60000);
  const windowStart = startHour * 60;
  const windowEnd = (startHour + hourCount) * 60;
  const from = Math.max(parisMinutes(start), windowStart);
  let to = parisMinutes(end);
  if (to <= parisMinutes(start)) {
    to = Math.min(windowEnd, parisMinutes(start) + Number(item.duration || item.duration_minutes || 60));
  }
  to = Math.min(Math.max(to, from + 15), windowEnd);
  if (to <= from) return null;
  const span = windowEnd - windowStart;
  return {
    topPercent: ((from - windowStart) / span) * 100,
    heightPercent: ((to - from) / span) * 100,
  };
}

export function dedupeGoogleAgendaItems(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items || []) {
    const googleId = String(item.googleEventId || "").trim();
    if (googleId) {
      if (seen.has(googleId)) continue;
      seen.add(googleId);
    }
    result.push(item);
  }
  return result;
}

export const AGENDA_LAYOUT_VIEWS = ["day", "week", "month", "list", "table"];

function plainAgendaMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

/** Dernier affichage de l’agenda : vue, période, personnes, filtres. */
export function readAgendaLayout(raw, { fallbackView = "week" } = {}) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const requested = String(source.view || "");
  const view = AGENDA_LAYOUT_VIEWS.includes(requested)
    ? requested
    : (AGENDA_LAYOUT_VIEWS.includes(fallbackView) ? fallbackView : "week");
  const anchorDate = new Date(source.anchor || "");
  const filters = plainAgendaMap(source.filters);
  return {
    hidden: plainAgendaMap(source.hidden),
    colors: plainAgendaMap(source.colors),
    view,
    anchor: Number.isNaN(anchorDate.getTime()) ? "" : anchorDate.toISOString(),
    filters: {
      commercialId: String(filters.commercialId || ""),
      kind: String(filters.kind || ""),
      status: String(filters.status || ""),
    },
  };
}

export function mergeAgendaLayout(current, patch = {}) {
  const source = current && typeof current === "object" && !Array.isArray(current) ? current : {};
  const next = { ...source };
  if (patch.hidden && typeof patch.hidden === "object") next.hidden = patch.hidden;
  if (patch.colors && typeof patch.colors === "object") next.colors = patch.colors;
  if (AGENDA_LAYOUT_VIEWS.includes(patch.view)) next.view = patch.view;
  if (patch.anchor) next.anchor = patch.anchor;
  if (patch.filters && typeof patch.filters === "object") {
    next.filters = { ...plainAgendaMap(source.filters), ...patch.filters };
  }
  return next;
}

export function formatAgendaDay(value) {
  const date = parseAgendaDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: PARIS_TZ,
  }).format(date);
}
