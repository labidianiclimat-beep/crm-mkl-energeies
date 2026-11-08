/** Alertes de connexion quand un commercial laisse un rendez-vous non statué. */

import { isAssignedRdvCommercial, normalizeAgendaStatus } from "./appointment-status.js";
import { normalizeRoleLabel } from "./roles.js";

export const STATUER_DELAY_MS = 5 * 60 * 60 * 1000;
const STORAGE_PREFIX = "mkl-rdv-statuer:";
const SESSION_KEY = "mkl-supabase-session";

export function receivesStatuerAlerts(profile) {
  if (!profile?.active || !profile?.onboarding_completed_at || profile.previewUserId) return false;
  return normalizeRoleLabel(profile.role) === "Commercial";
}

export function isOverdueUnstatuedAppointment(item, userId, now = Date.now()) {
  if (!item || item.source === "google" || item.private) return false;
  if (item.kind !== "rendez-vous") return false;
  if (normalizeAgendaStatus(item.status) !== "Non statué") return false;
  if (!isAssignedRdvCommercial(item, userId)) return false;
  const start = new Date(item.start || item.starts_at || "").getTime();
  if (!Number.isFinite(start)) return false;
  return Number(now) >= start + STATUER_DELAY_MS;
}

export function overdueUnstatuedAppointments(appointments, userId, now = Date.now()) {
  return (appointments || [])
    .filter(item => isOverdueUnstatuedAppointment(item, userId, now))
    .sort((a, b) => String(a.start || a.starts_at || "").localeCompare(String(b.start || b.starts_at || "")));
}

export function normalizeStatuerAlert(record) {
  const step = Math.max(0, Math.min(3, Number(record?.step) || 0));
  return {
    step,
    connectionId: String(record?.connectionId || ""),
    dismissed: Boolean(record?.dismissed) && step > 0 && step < 3,
  };
}

/** Une connexion = un `connected_at` de session. La même session ne fait pas monter l’alerte. */
export function advanceStatuerAlert(record, { connectionId = "", hasOverdue = false } = {}) {
  const previous = normalizeStatuerAlert(record);
  const id = String(connectionId || "");
  if (!hasOverdue) {
    return { step: 0, connectionId: id || previous.connectionId, dismissed: false };
  }
  if (!id) {
    return previous.step > 0 ? previous : { step: 1, connectionId: "", dismissed: false };
  }
  if (previous.connectionId === id) return previous;
  return {
    step: Math.min(3, previous.step + 1),
    connectionId: id,
    dismissed: false,
  };
}

export function dismissStatuerAlert(record) {
  const current = normalizeStatuerAlert(record);
  if (current.step >= 3) return current;
  return { ...current, dismissed: true };
}

export function statuerAlertShows(record, overdueCount) {
  const current = normalizeStatuerAlert(record);
  if (!overdueCount || current.step < 1) return false;
  if (current.step >= 3) return true;
  return !current.dismissed;
}

export function statuerAlertCopy(step, count = 1) {
  const several = Number(count) > 1;
  if (step <= 1) {
    return several
      ? "Première alerte : des rendez-vous sont encore non statués."
      : "Première alerte : un rendez-vous est encore non statué.";
  }
  if (step === 2) {
    return several
      ? "Deuxième alerte : ces rendez-vous ne sont toujours pas statués."
      : "Deuxième alerte : ce rendez-vous n’est toujours pas statué.";
  }
  return several
    ? "Pour continuer à utiliser votre espace CRM, merci de statuer les rendez-vous ci-dessous."
    : "Pour continuer à utiliser votre espace CRM, merci de statuer le rendez-vous ci-dessous.";
}

export function formatStatuerWhen(start) {
  const date = new Date(start || "");
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statuerAlertStorageKey(userId) {
  return `${STORAGE_PREFIX}${userId || ""}`;
}

export function readStatuerAlert(storage, userId) {
  try {
    return normalizeStatuerAlert(JSON.parse(storage.getItem(statuerAlertStorageKey(userId)) || "null"));
  } catch {
    return normalizeStatuerAlert(null);
  }
}

export function writeStatuerAlert(storage, userId, record) {
  storage.setItem(statuerAlertStorageKey(userId), JSON.stringify(normalizeStatuerAlert(record)));
}

export function readSessionConnectionId(storage) {
  try {
    const session = JSON.parse(storage.getItem(SESSION_KEY) || "null");
    const id = Number(session?.connected_at || 0);
    return id > 0 ? String(id) : "";
  } catch {
    return "";
  }
}
