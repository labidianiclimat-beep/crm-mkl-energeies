import { serviceRequest } from "./supabase-server";
import {
  buildCommercialScopeFilter,
  canViewOrgWideCommercialData,
  canViewTeamCommercialData,
  resolveScopedCommercialIds,
} from "./scoping";

export async function loadTeamMemberIds(profile, userId) {
  if (!profile?.organization_id || !userId) return [userId].filter(Boolean);
  if (canViewOrgWideCommercialData(profile)) return null;
  if (!canViewTeamCommercialData(profile)) return [userId];

  const orgId = profile.organization_id;
  const names = [profile.full_name, profile.email].filter(Boolean);
  let path = `/rest/v1/profiles?select=id&organization_id=eq.${encodeURIComponent(orgId)}&active=eq.true`;
  if (names.length) {
    const managerFilters = names.map(name => `manager.eq.${encodeURIComponent(name)}`).join(",");
    path += `&or=(id.eq.${encodeURIComponent(userId)},${managerFilters})`;
  } else {
    path += `&id=eq.${encodeURIComponent(userId)}`;
  }

  try {
    const rows = await serviceRequest(path);
    const ids = [...new Set([userId, ...(rows || []).map(row => row.id)].filter(Boolean))];
    return ids;
  } catch (error) {
    console.warn("loadTeamMemberIds", error.message);
    return [userId];
  }
}

export async function commercialScopeQuery(profile, userId, columns = ["commercial_id", "created_by"]) {
  const teamIds = await loadTeamMemberIds(profile, userId);
  const scoped = resolveScopedCommercialIds(profile, userId, teamIds || []);
  return buildCommercialScopeFilter(columns, scoped);
}

export { canViewOrgWideCommercialData, canViewTeamCommercialData, resolveScopedCommercialIds };
