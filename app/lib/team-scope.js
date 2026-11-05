import { serviceRequest } from "./supabase-server";
import {
  buildCommercialScopeFilter,
  canViewOrgWideCommercialData,
  canViewTeamCommercialData,
  privateAgendaOwnerIds,
  resolveScopedCommercialIds,
  teamMemberIdsFromProfiles,
} from "./scoping";
import { isProspectDispatcher } from "./prospect-dispatch";

export async function loadTeamMemberIds(profile, userId, { forDispatch = false } = {}) {
  if (!profile?.organization_id || !userId) return [userId].filter(Boolean);
  if (canViewOrgWideCommercialData(profile) || (forDispatch && isProspectDispatcher(profile))) return null;
  if (!canViewTeamCommercialData(profile)) return [userId];

  const orgId = profile.organization_id;
  try {
    const rows = await serviceRequest(
      `/rest/v1/profiles?select=id,full_name,email,role,manager,active&organization_id=eq.${encodeURIComponent(orgId)}&or=(active.eq.true,active.is.null)`
    );
    return teamMemberIdsFromProfiles(profile, userId, rows);
  } catch (error) {
    console.warn("loadTeamMemberIds", error.message);
    return [userId];
  }
}

export async function loadPrivateAgendaOwnerIds(orgId) {
  if (!orgId) return new Set();
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,role&organization_id=eq.${encodeURIComponent(orgId)}`
  );
  return privateAgendaOwnerIds(rows);
}

export async function commercialScopeQuery(profile, userId, columns = ["commercial_id", "created_by"], { forDispatch = false } = {}) {
  const teamIds = await loadTeamMemberIds(profile, userId, { forDispatch });
  const scoped = resolveScopedCommercialIds(profile, userId, teamIds || [], { forDispatch });
  return buildCommercialScopeFilter(columns, scoped);
}

export { canViewOrgWideCommercialData, canViewTeamCommercialData, resolveScopedCommercialIds };
