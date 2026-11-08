/** Dispatch prospects — rôle, file d’attente, reco, historique. */

import { extraOf, isUuid } from "./prospects.js";
import { getRoleDefinition, isAdminVipRole, normalizeRoleLabel } from "./roles.js";
import { isConvertedProspect } from "./prospect-to-client.js";
import { findOverlaps, isOpenAgendaStatus, nextAvailableSlots, parseAgendaDate } from "./agenda.js";

export const DISPATCHER_ROLE = "Responsable prospection";
export const FIELD_PROSPECTOR_ROLE = "Prospecteur terrain";
export const FIELD_PROSPECTOR_MANAGERS = ["Responsable prospection", "Admin VIP"];

export const DISPATCHER_DENIED_MODULES = [
  "Clients",
  "Devis",
  "Factures",
  "Factures pro forma",
  "Demandes de chiffrage",
  "Fournisseurs",
  "Planning",
  "Chantiers",
  "Équipes d’installation",
  "Maintenance",
  "Photovoltaïque administratif",
  "Visites techniques",
  "Grilles tarifaires PDF",
  "Utilisateurs",
  "Études thermiques",
];

export const DISPATCH_COMMERCIAL_ROLES = [
  "Commercial",
  "Responsable commercial",
  "Admin VIP",
  "Superadmin",
  "Direction",
];

export function isDispatchCommercialRole(role) {
  return DISPATCH_COMMERCIAL_ROLES.includes(normalizeRoleLabel(role));
}

export const REASSIGN_REASONS = [
  "Le commercial est absent",
  "Le commercial refuse le rendez-vous",
  "Le client demande une autre date",
  "Le rendez-vous est trop loin",
  "Un autre commercial est plus disponible",
  "Attribution par erreur",
  "Autre",
];

export const DISPATCH_OUTCOMES = [
  "À contacter",
  "Rendez-vous programmé",
  "Rendez-vous confirmé",
  "Rendez-vous reporté",
  "Rendez-vous annulé",
  "Prospect absent",
  "Rendez-vous réalisé",
  "Non intéressé",
  "À rappeler",
  "Transformé en client",
];

const APPOINTMENT_OUTCOME = {
  Planifié: "Rendez-vous programmé",
  "À confirmer": "Rendez-vous programmé",
  Confirmé: "Rendez-vous confirmé",
  "Non statué": "Rendez-vous programmé",
  Reporté: "Rendez-vous reporté",
  "RDV à repositionner": "Rendez-vous reporté",
  "RDV repositionné par le client": "Rendez-vous reporté",
  "RDV repositionné par le vendeur": "Rendez-vous reporté",
  "Nouveau RDV pour pièces": "Rendez-vous programmé",
  Annulé: "Rendez-vous annulé",
  "RDV annulé définitivement": "Rendez-vous annulé",
  "Absence du prospect": "Prospect absent",
  "Client absent": "Prospect absent",
  "Client problématique": "Client problématique",
  "Client non équipable": "Client non équipable",
  "Commande refusée": "Commande refusée",
  "Client en réflexion": "Client en réflexion",
  "Commande signée": "Commande signée",
  Réalisé: "Rendez-vous réalisé",
  "Rappel effectué": "Rendez-vous réalisé",
};

export function isProspectDispatcherRole(role) {
  return normalizeRoleLabel(role) === DISPATCHER_ROLE;
}

export function isProspectDispatcher(profile) {
  return isProspectDispatcherRole(profile?.role);
}

export function isFieldProspectorRole(role) {
  return normalizeRoleLabel(role) === FIELD_PROSPECTOR_ROLE;
}

export function isFieldProspector(profile) {
  return isFieldProspectorRole(profile?.role);
}

export function canEditExistingProspect(profile) {
  if (!profile?.active || !profile?.onboarding_completed_at) return false;
  if (isProspectDispatcher(profile)) return true;
  const definition = getRoleDefinition(profile.role);
  if (definition) return Boolean(definition.isAdmin);
  return ["Admin VIP", "Superadmin"].includes(normalizeRoleLabel(profile.role));
}

export const FIELD_REVISE_MINUTES = 30;

export function fieldReviseOpen(createdAt, now = new Date()) {
  const created = new Date(createdAt || 0).getTime();
  const at = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!created || Number.isNaN(at)) return false;
  const elapsed = at - created;
  return elapsed >= 0 && elapsed <= FIELD_REVISE_MINUTES * 60 * 1000;
}

export function canReviseProspect(profile, prospect, now = new Date()) {
  if (canEditExistingProspect(profile)) return true;
  if (!isFieldProspector(profile) || !prospect) return false;
  return fieldReviseOpen(prospect.created || prospect.created_at, now);
}

export function deniesFinancialAccess(profile) {
  return isProspectDispatcher(profile);
}

export function canDispatchProspects(profile) {
  const role = normalizeRoleLabel(profile?.role);
  return (
    isProspectDispatcherRole(role) ||
    ["Admin VIP", "Superadmin", "Direction", "Responsable commercial"].includes(role)
  );
}

/** File « À dispatcher » : Admin VIP et responsable de prospection seulement. */
export function canSeeDispatchQueue(profile) {
  const role = normalizeRoleLabel(profile?.role);
  return isAdminVipRole(role) || isProspectDispatcherRole(role);
}

/** Menu d’attribution du formulaire prospect : VIP, Admin, prospection, responsable commercial. */
export const PROSPECT_FORM_ASSIGN_ROLES = [
  "Admin VIP",
  "Superadmin",
  "Responsable prospection",
  "Responsable commercial",
];

export function canAssignProspectCommercial(profile) {
  return PROSPECT_FORM_ASSIGN_ROLES.includes(normalizeRoleLabel(profile?.role));
}

export function canPickOrgProspectCommercial(profile) {
  return ["Admin VIP", "Superadmin", "Responsable prospection"].includes(normalizeRoleLabel(profile?.role));
}

function managerNameKeys(...values) {
  return [...new Set(values.map(value => String(value || "").trim().toLowerCase()).filter(Boolean))];
}

export function commercialsForProspectAssign(profile, commercials = [], {
  team = [],
  currentUserId = "",
  currentUserName = "",
} = {}) {
  if (!canAssignProspectCommercial(profile)) return [];
  const assignable = (commercials || []).filter(user => isDispatchCommercialRole(user.role));
  if (canPickOrgProspectCommercial(profile)) return assignable;

  const selfId = String(currentUserId || profile?.id || "");
  const me = (team || []).find(user => String(user.id) === selfId);
  const managerKeys = new Set(managerNameKeys(
    profile?.full_name,
    profile?.name,
    profile?.email,
    currentUserName,
    me?.name,
    me?.email
  ));
  const filtered = assignable.filter(user => {
    if (String(user.id) === selfId) return true;
    if (normalizeRoleLabel(user.role) !== "Commercial") return false;
    const member = (team || []).find(item => String(item.id) === String(user.id));
    const manager = String(member?.manager || user.manager || "").trim().toLowerCase();
    return manager && managerKeys.has(manager);
  });
  if (selfId && !filtered.some(user => String(user.id) === selfId)) {
    const self = assignable.find(user => String(user.id) === selfId)
      || { id: selfId, name: currentUserName || me?.name || "Moi", role: "Responsable commercial" };
    return [self, ...filtered];
  }
  return filtered;
}

export function resolveProspectCommercialId(profile, userId, requestedId, { teamIds = [], existingId } = {}) {
  if (isFieldProspector(profile)) return "";

  const requested = isUuid(requestedId) ? String(requestedId) : "";
  const existing = isUuid(existingId) ? String(existingId) : "";
  const self = String(userId || "");

  if (canPickOrgProspectCommercial(profile)) {
    if (requested) return requested;
    if (isProspectDispatcher(profile)) return "";
    return existing || self;
  }

  if (normalizeRoleLabel(profile?.role) === "Responsable commercial") {
    const allowed = new Set([self, ...(teamIds || []).map(String)].filter(Boolean));
    if (requested && allowed.has(requested)) return requested;
    if (existing && allowed.has(existing)) return existing;
    return self;
  }

  return existing || self;
}

export function canViewOrgWideProspectDispatch(profile) {
  return isProspectDispatcher(profile);
}

export function isUnassignedProspect(prospect) {
  if (!prospect || isConvertedProspect(prospect)) return false;
  const commercialId = prospect.commercialId || prospect.commercial_id || "";
  return !isUuid(commercialId);
}

export function isAssignedProspect(prospect) {
  if (!prospect) return false;
  return isUuid(prospect.commercialId || prospect.commercial_id);
}

export function dispatchOutcome(prospect, appointment) {
  if (isConvertedProspect(prospect) || prospect?.stage === "Gagné") return "Transformé en client";
  const extra = extraOf(prospect);
  if (DISPATCH_OUTCOMES.includes(extra.dispatchOutcome)) return extra.dispatchOutcome;
  if (prospect?.stage === "Perdu") return "Non intéressé";
  if (prospect?.stage === "À contacter" && !appointment) return "À contacter";
  if (APPOINTMENT_OUTCOME[appointment?.status]) return APPOINTMENT_OUTCOME[appointment.status];
  if (isAssignedProspect(prospect)) return "Rendez-vous programmé";
  return "À contacter";
}

export function desiredStartOf(prospect) {
  const extra = extraOf(prospect);
  return extra.desiredAt || extra.desired_at || prospect.desiredAt || "";
}

export function prospectMoment(prospect, appointment) {
  return appointment?.start || appointment?.starts_at || desiredStartOf(prospect) || "";
}

export function formatProspectWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function parisDayKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function peopleOptions(rows = [], idKey, nameKey) {
  const seen = new Map();
  for (const row of rows) {
    const id = String(row?.[idKey] || "").trim();
    const name = String(row?.[nameKey] || "").trim();
    if (!id && !name) continue;
    const key = id || name;
    if (!seen.has(key)) seen.set(key, { id: key, name: name || "Non renseigné" });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function matchesDirectoryFilters(row, { commercialId = "", prospectorId = "", date = "" } = {}, moment = "") {
  if (commercialId === "unassigned") {
    if (row?.commercialId || row?.owner) return false;
  } else if (commercialId) {
    const id = String(row?.commercialId || "");
    const name = String(row?.owner || "");
    if (id !== commercialId && name !== commercialId) return false;
  }
  if (prospectorId === "unassigned") {
    if (row?.prospectorId || row?.prospector) return false;
  } else if (prospectorId) {
    const id = String(row?.prospectorId || "");
    const name = String(row?.prospector || "");
    if (id !== prospectorId && name !== prospectorId) return false;
  }
  if (date && parisDayKey(moment) !== date) return false;
  return true;
}

export function postalPrefix(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 2);
}

export function zoneMatch(commercial = {}, prospect = {}) {
  const prospectPostal = String(prospect.postalCode || extraOf(prospect).postalCode || "").replace(/\D/g, "");
  const commercialPostal = String(commercial.postalCode || commercial.postal_code || "").replace(/\D/g, "");
  const prospectCity = String(prospect.city || extraOf(prospect).city || "").trim().toLowerCase();
  const commercialCity = String(commercial.city || "").trim().toLowerCase();
  const zone = String(commercial.zone || "").trim().toLowerCase();
  if (prospectPostal && commercialPostal && prospectPostal === commercialPostal) {
    return { score: 30, label: "même code postal", distance: "même CP" };
  }
  if (prospectCity && commercialCity && prospectCity === commercialCity) {
    return { score: 22, label: "même commune", distance: "même commune" };
  }
  if (prospectCity && zone && zone.includes(prospectCity)) {
    return { score: 20, label: "zone du commercial", distance: "même zone" };
  }
  if (prospectPostal && commercialPostal && postalPrefix(prospectPostal) === postalPrefix(commercialPostal)) {
    return { score: 16, label: "même département", distance: "même département" };
  }
  if (prospectPostal && zone && zone.includes(postalPrefix(prospectPostal))) {
    return { score: 10, label: "département de la zone", distance: "zone proche" };
  }
  return { score: 0, label: "", distance: "hors zone" };
}

export function specialtyMatch(commercial = {}, projectType = "") {
  const needle = String(projectType || "").trim().toLowerCase();
  const specialties = parseSpecialties(commercial.specialties);
  if (!needle || !specialties.length) return { score: 0, label: "" };
  const hit = specialties.find(item => {
    const value = String(item || "").toLowerCase();
    return value && (needle.includes(value) || value.includes(needle));
  });
  if (!hit) return { score: 0, label: "" };
  return { score: 25, label: `spécialisé en ${hit}` };
}

function countInRange(appointments, commercialId, start, end) {
  return (appointments || []).filter(item => {
    if (String(item.commercialId || item.commercial_id) !== String(commercialId)) return false;
    if (!isOpenAgendaStatus(item.status)) return false;
    const time = parseAgendaDate(item.start || item.starts_at)?.getTime();
    return time && time >= start && time < end;
  }).length;
}

export function weekBounds(from = new Date()) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

export function dayBounds(from = new Date()) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start, end };
}

export function rankDispatchCommercials({
  commercials = [],
  appointments = [],
  prospect = {},
  desiredAt = "",
  duration = 60,
  now = new Date(),
} = {}) {
  const desired = parseAgendaDate(desiredAt || desiredStartOf(prospect));
  const day = dayBounds(desired || now);
  const week = weekBounds(desired || now);
  const projectType = prospect.type || prospect.project_type || extraOf(prospect).type || "";
  const ranked = (commercials || []).map(commercial => {
    const available = commercial.dispatchAvailable !== false && commercial.dispatch_available !== false;
    const dayCount = countInRange(appointments, commercial.id, day.start.getTime(), day.end.getTime());
    const weekCount = countInRange(appointments, commercial.id, week.start.getTime(), week.end.getTime());
    const zone = zoneMatch(commercial, prospect);
    const specialty = specialtyMatch(commercial, projectType);
    const candidate = {
      start: (desired || now).toISOString(),
      duration,
      commercialId: commercial.id,
    };
    const overlaps = available ? findOverlaps(appointments, candidate) : [{ id: "unavailable" }];
    const freeAtDesired = Boolean(desired && available && !overlaps.length);
    const nextSlots = nextAvailableSlots(appointments, {
      commercialId: commercial.id,
      duration,
      from: desired || now,
      count: 1,
    });
    const nextSlot = nextSlots[0] || null;
    let score = zone.score + specialty.score;
    const reasons = [];
    if (!available) score -= 80;
    else if (freeAtDesired) {
      score += 28;
      reasons.push(`disponible ${desired.toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" })}`);
    } else if (nextSlot) {
      score += 12;
      reasons.push(`prochain créneau ${nextSlot.toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" })}`);
    }
    if (zone.label) reasons.push(zone.label);
    if (specialty.label) reasons.push(specialty.label);
    score -= Math.min(18, weekCount * 2);
    if (weekCount >= 8) reasons.push("semaine déjà chargée");
    return {
      ...commercial,
      available,
      status: available ? "Disponible" : "Indisponible",
      dayCount,
      weekCount,
      nextSlot: nextSlot ? nextSlot.toISOString() : "",
      distance: zone.distance,
      score,
      freeAtDesired,
      recommendation: reasons.filter(Boolean).slice(0, 3).join(", ") || "Commercial de l’équipe",
    };
  }).sort((a, b) => b.score - a.score || String(a.name || "").localeCompare(String(b.name || ""), "fr"));

  return ranked.map((item, index) => ({
    ...item,
    rank: index === 0 ? "Commercial recommandé" : index === 1 ? "Deuxième choix" : index === 2 ? "Troisième choix" : "",
  }));
}

const COMMERCIAL_COLORS = ["#2563eb", "#e11d48", "#0d9488", "#f5b400", "#7c3aed", "#16a34a", "#ea580c", "#db2777"];

export function contrastingInk(hex) {
  const raw = String(hex || "").replace("#", "");
  if (raw.length < 6) return "#ffffff";
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? "#152347" : "#ffffff";
}

export function parseSpecialties(value) {
  if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/\s*(?:·|,|;|\|)\s*/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function commercialColor(id) {
  const raw = String(id || "");
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return COMMERCIAL_COLORS[hash % COMMERCIAL_COLORS.length];
}

export function agendaOwnerColor(id, colors = {}) {
  const chosen = String(colors?.[String(id)] || "");
  return /^#[0-9a-f]{6}$/i.test(chosen) ? chosen : commercialColor(id);
}

export function isAgendaOwnerShown(id, hidden = {}) {
  if (!id) return true;
  return hidden[String(id)] !== true;
}

export function validateReassignReason(reason, { required = false } = {}) {
  const value = String(reason || "").trim();
  if (required && !value) return "Le motif de réattribution est obligatoire.";
  return "";
}

export function assignmentHistoryRow({
  organizationId,
  prospectId,
  appointmentId,
  previousCommercialId,
  nextCommercialId,
  actorId,
  actorName,
  appointmentAt,
  reason,
  oldValue,
  newValue,
}) {
  return {
    organization_id: organizationId,
    prospect_id: prospectId,
    appointment_id: appointmentId || null,
    previous_commercial_id: previousCommercialId || null,
    next_commercial_id: nextCommercialId || null,
    actor_id: actorId || null,
    actor_name: actorName || "",
    appointment_at: appointmentAt || null,
    reason: String(reason || "").trim() || null,
    old_value: oldValue || null,
    new_value: newValue || null,
  };
}
