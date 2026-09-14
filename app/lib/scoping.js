import { normalizeRoleLabel } from "./roles.js";

/** Accès org entière : admins, direction, secrétariat. */
export function canViewOrgWideCommercialData(profile) {
  return ["Admin VIP", "Admin second", "Direction", "Secrétariat"].includes(
    normalizeRoleLabel(profile?.role)
  );
}

/** Responsable commercial : soi + équipe (manager = full_name / email). */
export function canViewTeamCommercialData(profile) {
  return normalizeRoleLabel(profile?.role) === "Responsable commercial";
}

/**
 * null  → pas de filtre (org entière)
 * uuid[] → restreindre commercial_id / created_by à ces utilisateurs
 */
export function resolveScopedCommercialIds(profile, userId, teamIds = []) {
  if (!profile || !userId) return [];
  if (canViewOrgWideCommercialData(profile)) return null;
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
export function canAccessScopedRow(profile, userId, row, teamIds = []) {
  if (!row || !profile || !userId) return false;
  if (
    row.organization_id &&
    profile.organization_id &&
    String(row.organization_id) !== String(profile.organization_id)
  ) {
    return false;
  }
  const scoped = resolveScopedCommercialIds(profile, userId, teamIds);
  if (scoped == null) return true;
  const commercialId = row.commercial_id != null ? String(row.commercial_id) : "";
  const createdBy = row.created_by != null ? String(row.created_by) : "";
  return scoped.includes(commercialId) || scoped.includes(createdBy);
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
