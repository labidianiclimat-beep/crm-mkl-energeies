import { isAdminVipRole, normalizeRoleLabel } from "./roles.js";
import { isProspectDispatcher } from "./prospect-dispatch.js";

/** Accès org entière : admins, direction, secrétariat. */
export function canViewOrgWideCommercialData(profile) {
  return ["Admin VIP", "Superadmin", "Direction", "Secrétariat"].includes(
    normalizeRoleLabel(profile?.role)
  );
}

/** Responsable commercial : soi + équipe (manager = full_name / email). */
export function canViewTeamCommercialData(profile) {
  return normalizeRoleLabel(profile?.role) === "Responsable commercial";
}

function personKey(value) {
  return String(value || "").trim().toLowerCase();
}

/** Vendeurs dont le responsable hiérarchique est cette personne. Les autres restent hors équipe. */
export function teamMemberIdsFromProfiles(profile, userId, rows = []) {
  const selfId = String(userId || "");
  const keys = new Set([profile?.full_name, profile?.name, profile?.email].map(personKey).filter(Boolean));
  const ids = new Set(selfId ? [selfId] : []);
  for (const row of rows || []) {
    if (!row?.id || row.active === false) continue;
    const id = String(row.id);
    if (id === selfId) {
      ids.add(id);
      continue;
    }
    if (normalizeRoleLabel(row.role) !== "Commercial") continue;
    const manager = personKey(row.manager);
    if (manager && keys.has(manager)) ids.add(id);
  }
  return [...ids];
}

/**
 * null  → pas de filtre (org entière)
 * uuid[] → restreindre commercial_id / created_by à ces utilisateurs
 */
export function resolveScopedCommercialIds(profile, userId, teamIds = [], { forDispatch = false } = {}) {
  if (!profile || !userId) return [];
  if (canViewOrgWideCommercialData(profile)) return null;
  if (forDispatch && isProspectDispatcher(profile)) return null;
  if (canViewTeamCommercialData(profile)) {
    const ids = new Set([userId, ...(teamIds || [])].filter(Boolean).map(String));
    return [...ids];
  }
  return [String(userId)];
}

/**
 * Accès à une ligne client/devis scopée (ÉTAPE 9 + 13).
 * @param {{ organization_id?: string, commercial_id?: string, created_by?: string }} row
 * @param {string[]} teamIds ids équipe déjà résolus (responsable)
 */
export function canAccessScopedRow(profile, userId, row, teamIds = [], { forDispatch = false } = {}) {
  if (!row || !profile || !userId) return false;
  if (
    row.organization_id &&
    profile.organization_id &&
    String(row.organization_id) !== String(profile.organization_id)
  ) {
    return false;
  }
  const scoped = resolveScopedCommercialIds(profile, userId, teamIds, { forDispatch });
  if (scoped == null) return true;
  const commercialId = row.commercial_id != null ? String(row.commercial_id) : "";
  const createdBy = row.created_by != null ? String(row.created_by) : "";
  const extra = row.extra && typeof row.extra === "object" && !Array.isArray(row.extra) ? row.extra : {};
  const prospectorId = String(row.prospectorId || row.prospector_id || extra.prospectorId || extra.prospector_id || "");
  return scoped.includes(commercialId) || scoped.includes(createdBy) || scoped.includes(prospectorId);
}

/**
 * Prospect déjà attribué : seul le commercial de la fiche (ou son équipe, ou l’org) le voit.
 * Sans commercial, le créateur et le prospecteur gardent la fiche.
 */
export function canSeeAssignedProspect(profile, userId, row, teamIds = [], options = {}) {
  if (!row || !profile || !userId) return false;
  if (
    row.organization_id &&
    profile.organization_id &&
    String(row.organization_id) !== String(profile.organization_id)
  ) {
    return false;
  }
  const scoped = resolveScopedCommercialIds(profile, userId, teamIds, options);
  if (scoped == null) return true;
  const commercialId = String(row.commercial_id || row.commercialId || "");
  if (commercialId) return scoped.map(String).includes(commercialId);
  return canAccessScopedRow(profile, userId, row, teamIds, options);
}

export function buildProspectScopeFilter(scopedIds) {
  if (scopedIds == null) return "";
  if (!scopedIds.length) return "&commercial_id=eq.00000000-0000-0000-0000-000000000000";
  const parts = [];
  for (const id of scopedIds) {
    parts.push(`commercial_id.eq.${id}`);
    parts.push(`and(commercial_id.is.null,created_by.eq.${id})`);
    parts.push(`and(commercial_id.is.null,extra->>prospectorId.eq.${id})`);
  }
  return `&or=(${parts.join(",")})`;
}

/** Un rendez-vous d’un autre commercial reste invisible, même s’il a été créé par l’équipe. */
export function visibleAgendaAppointment(row, scopedIds) {
  if (scopedIds == null) return true;
  const allowed = new Set((scopedIds || []).map(id => String(id || "")).filter(Boolean));
  const commercialId = String(row?.commercial_id || row?.commercialId || "");
  const createdBy = String(row?.created_by || row?.createdBy || "");
  if (commercialId) return allowed.has(commercialId);
  return Boolean(createdBy) && allowed.has(createdBy);
}

/** Comptes dont l’agenda personnel reste visible seulement pour l’Admin VIP. */
export function privateAgendaOwnerIds(rows = []) {
  const ids = new Set();
  for (const row of rows || []) {
    if (row?.id && isAdminVipRole(row.role)) ids.add(String(row.id));
  }
  return ids;
}

export function visibleAgendaRowForViewer(row, scopedIds, profile, privateOwnerIds = new Set()) {
  if (!visibleAgendaAppointment(row, scopedIds)) return false;
  if (isAdminVipRole(profile?.role)) return true;
  const commercialId = String(row?.commercial_id || row?.commercialId || "");
  if (!commercialId) return true;
  const hidden = privateOwnerIds instanceof Set
    ? privateOwnerIds
    : new Set([...(privateOwnerIds || [])].map(id => String(id || "")).filter(Boolean));
  return !hidden.has(commercialId);
}

export function buildCommercialScopeFilter(columnNames, scopedIds) {
  if (scopedIds == null) return "";
  if (!scopedIds.length) return `&${columnNames[0]}=eq.00000000-0000-0000-0000-000000000000`;
  const parts = [];
  for (const column of columnNames) {
    for (const id of scopedIds) {
      parts.push(`${column}.eq.${id}`);
    }
  }
  return `&or=(${parts.join(",")})`;
}

/**
 * URLs à refuser côté serveur (middleware) — ÉTAPE 13.
 * Retourne le code denied ou null si OK.
 */
export function deniedDirectUrlReason(pathname = "") {
  const path = String(pathname || "").split("?")[0];
  if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/administration")) {
    return "admin";
  }
  if (path === "/users" || path.startsWith("/users/")) {
    return "users";
  }
  return null;
}
