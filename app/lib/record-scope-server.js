import {
  buildFieldSalesRecordContext,
  filterFieldSalesRecords,
  isFieldSalesScopedOrgKey,
  isFieldSalesScopedRecordKind,
  shouldScopeFieldSalesRecords,
} from "./record-scope.js";
import { resolveScopedCommercialIds } from "./scoping.js";
import { listAllRows } from "./supabase-list.js";
import { commercialScopeQuery, loadTeamMemberIds } from "./team-scope.js";

export {
  filterFieldSalesRecords,
  isFieldSalesScopedOrgKey,
  isFieldSalesScopedRecordKind,
  prepareScopedRecordMutation,
  shouldScopeFieldSalesRecords,
  stampRecordOwner,
} from "./record-scope.js";

export async function loadFieldSalesRecordContext(profile, userId) {
  if (!shouldScopeFieldSalesRecords(profile) || !userId) {
    return { scopedIds: null, canSee: () => true };
  }

  const teamIds = await loadTeamMemberIds(profile, userId);
  const scopedIds = resolveScopedCommercialIds(profile, userId, teamIds || []);
  const orgId = profile.organization_id;
  const scope = await commercialScopeQuery(profile, userId);
  let clients = [];
  let devis = [];
  try {
    clients = await listAllRows(
      `/rest/v1/clients?select=id,nom,prenom,raison_sociale,type_client&organization_id=eq.${encodeURIComponent(orgId)}${scope}`
    );
  } catch (error) {
    console.warn("record-scope clients", error.message);
  }
  try {
    devis = await listAllRows(
      `/rest/v1/devis?select=id,numero_devis,pv_study_id,client_id&organization_id=eq.${encodeURIComponent(orgId)}${scope}`
    );
  } catch (error) {
    console.warn("record-scope devis", error.message);
  }

  return buildFieldSalesRecordContext({
    profile,
    userId,
    teamIds: teamIds || [],
    scopedIds,
    clients,
    devis,
  });
}

export async function scopeFieldSalesRecords(profile, userId, records, { kind, orgKey } = {}) {
  const applies = kind
    ? isFieldSalesScopedRecordKind(kind)
    : isFieldSalesScopedOrgKey(orgKey);
  if (!applies || !shouldScopeFieldSalesRecords(profile)) {
    return { records: Array.isArray(records) ? records : [], ctx: { scopedIds: null, canSee: () => true } };
  }
  const ctx = await loadFieldSalesRecordContext(profile, userId);
  return { records: filterFieldSalesRecords(records, ctx), ctx };
}
