/** Statuts RDV commerciaux — labels iCollect, sans second fichier. */

import { normalizeRoleLabel } from "./roles.js";

export const ICOLL_RDV_STATUSES = [
  "Non statué",
  "Client absent",
  "Client problématique",
  "Client non équipable",
  "RDV annulé définitivement",
  "Commande refusée",
  "RDV à repositionner",
  "RDV repositionné par le client",
  "RDV repositionné par le vendeur",
  "Nouveau RDV pour pièces",
  "Client en réflexion",
  "Commande signée",
];

export const LEGACY_AGENDA_STATUSES = [
  "Planifié",
  "À confirmer",
  "Confirmé",
  "Réalisé",
  "Rappel effectué",
  "Reporté",
  "Annulé",
  "Absence du prospect",
  "À dispatcher",
  "Affecté",
];

export const APPOINTMENT_STATUSES = [...new Set([...ICOLL_RDV_STATUSES, ...LEGACY_AGENDA_STATUSES])];

export const AGENDA_STATUSES = ICOLL_RDV_STATUSES;

export const VISIT_OUTCOME_STATUSES = [
  "Client absent",
  "Client problématique",
  "Client non équipable",
  "Commande refusée",
  "Nouveau RDV pour pièces",
  "Client en réflexion",
  "Commande signée",
];

export const PLANNING_RDV_STATUSES = [
  "Non statué",
  "RDV à repositionner",
  "RDV repositionné par le client",
  "RDV repositionné par le vendeur",
  "RDV annulé définitivement",
];

const STATUER_OWN_ROLES = ["Commercial"];
const STATUER_ALL_ROLES = ["Responsable commercial", "Responsable prospection", "Admin VIP", "Superadmin", "Direction"];
const ORDER_SIGN_ROLES = ["Admin VIP", "Superadmin"];
export const ORDER_SIGN_DENIED = "Seuls le Superadmin et l’Admin VIP peuvent poser le statut Commande signée.";

const LEGACY_STATUS = {
  "À dispatcher": "Non statué",
  Affecté: "Non statué",
  Planifié: "Non statué",
  "À confirmer": "Non statué",
  "Absence du prospect": "Client absent",
  Annulé: "RDV annulé définitivement",
  Reporté: "RDV à repositionner",
};

export const CLOSED_STATUSES = [
  "Client absent",
  "Client problématique",
  "Client non équipable",
  "RDV annulé définitivement",
  "Commande refusée",
  "Commande signée",
  "Réalisé",
  "Rappel effectué",
  "Annulé",
  "Absence du prospect",
];

export function normalizeAgendaStatus(status) {
  const raw = String(status || "").trim();
  if (LEGACY_STATUS[raw]) return LEGACY_STATUS[raw];
  if (APPOINTMENT_STATUSES.includes(raw)) return raw;
  return "Non statué";
}

export function displayRdvStatus(status) {
  if (!String(status || "").trim()) return "Aucun rendez-vous";
  return normalizeAgendaStatus(status);
}

export function isOpenAgendaStatus(status) {
  return !CLOSED_STATUSES.includes(normalizeAgendaStatus(status));
}

export function statusMatchesFilter(status, filter) {
  if (!filter) return true;
  return normalizeAgendaStatus(status) === normalizeAgendaStatus(filter);
}

export function rdvStatusOptions(current) {
  const value = normalizeAgendaStatus(current);
  return ICOLL_RDV_STATUSES.includes(value) ? ICOLL_RDV_STATUSES : [value, ...ICOLL_RDV_STATUSES];
}

export function appointmentHasStarted(item, now = Date.now()) {
  const start = new Date(item?.start || item?.starts_at || "").getTime();
  return Number.isFinite(start) && start <= Number(now);
}

export function isAssignedRdvCommercial(item, userId) {
  const assigned = String(item?.commercialId || item?.commercial_id || "");
  return Boolean(assigned && userId && assigned === String(userId));
}

export function canStatuerAppointment(profile, userId, item) {
  if (!profile?.active || !profile?.onboarding_completed_at) return false;
  const role = normalizeRoleLabel(profile.role);
  if (STATUER_ALL_ROLES.includes(role)) return true;
  if (STATUER_OWN_ROLES.includes(role)) return isAssignedRdvCommercial(item, userId);
  return false;
}

export function canSignCommercialOrder(profile) {
  return ORDER_SIGN_ROLES.includes(normalizeRoleLabel(profile?.role));
}

function withoutUnsignedOrder(profile, item, statuses) {
  if (canSignCommercialOrder(profile)) return statuses;
  const current = normalizeAgendaStatus(item?.status);
  return statuses.filter(status => status !== "Commande signée" || current === "Commande signée");
}

export function allowedRdvStatusesFor(profile, userId, item, now = Date.now()) {
  if (!canStatuerAppointment(profile, userId, item)) return [];
  const current = normalizeAgendaStatus(item?.status);
  const role = normalizeRoleLabel(profile?.role);
  const statuses = STATUER_ALL_ROLES.includes(role) || appointmentHasStarted(item, now)
    ? rdvStatusOptions(current)
    : (PLANNING_RDV_STATUSES.includes(current) ? PLANNING_RDV_STATUSES : [current, ...PLANNING_RDV_STATUSES]);
  return withoutUnsignedOrder(profile, item, statuses);
}

export function canApplyRdvStatus(profile, userId, item, nextStatus, now = Date.now()) {
  const next = normalizeAgendaStatus(nextStatus);
  return allowedRdvStatusesFor(profile, userId, item, now).includes(next);
}

export function rdvStatusDeniedMessage(profile, userId, item, nextStatus, now = Date.now()) {
  const next = normalizeAgendaStatus(nextStatus);
  if (next === "Commande signée" && normalizeAgendaStatus(item?.status) !== "Commande signée" && !canSignCommercialOrder(profile)) {
    return ORDER_SIGN_DENIED;
  }
  if (canApplyRdvStatus(profile, userId, item, nextStatus, now)) return "";
  return rdvStatuerHint(profile, userId, item, now) || "Ce statut ne peut pas encore être posé.";
}

export function rdvStatuerHint(profile, userId, item, now = Date.now()) {
  if (!canStatuerAppointment(profile, userId, item)) {
    return "Seul le commercial du rendez-vous, le responsable commercial ou la responsable de prospection peut statuer.";
  }
  if (STATUER_ALL_ROLES.includes(normalizeRoleLabel(profile?.role)) || appointmentHasStarted(item, now)) return "";
  return "Résultat de visite : à partir de l’heure du rendez-vous. Avant, seulement reporter ou annuler.";
}

export function rdvStatuerRule() {
  return "Le commercial statue son RDV à partir de l’heure prévue. Avant, il peut seulement reporter ou annuler. Le responsable commercial et la responsable de prospection peuvent statuer tous les rendez-vous.";
}

export function rdvStatusTone(status) {
  if (!String(status || "").trim()) return "muted";
  const value = normalizeAgendaStatus(status);
  if (value === "Commande signée" || value === "Réalisé" || value === "Rappel effectué") return "ok";
  if (
    value === "Client absent"
    || value === "Client problématique"
    || value === "Client non équipable"
    || value === "RDV annulé définitivement"
    || value === "Commande refusée"
    || value === "Annulé"
    || value === "Absence du prospect"
  ) return "bad";
  if (
    value === "RDV à repositionner"
    || value === "RDV repositionné par le client"
    || value === "RDV repositionné par le vendeur"
    || value === "Nouveau RDV pour pièces"
    || value === "Client en réflexion"
  ) return "wait";
  return "";
}

const OUTCOME_ONLY_KEYS = [
  "status",
  "start",
  "starts_at",
  "appointmentAt",
  "appointmentDate",
  "appointmentStart",
  "appointmentEnd",
  "end",
  "duration",
  "duration_minutes",
  "commercialId",
  "commercial_id",
  "notes",
  "prospectId",
  "opportunity_id",
  "kind",
  "subject",
  "address",
  "phone",
];

export function isAppointmentOutcomeOnlyPatch(body = {}) {
  const keys = OUTCOME_ONLY_KEYS.filter(key => Object.prototype.hasOwnProperty.call(body, key));
  return keys.length === 1 && keys[0] === "status";
}
