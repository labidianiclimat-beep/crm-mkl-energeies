import { displayClientName, normalizeText } from "./clients.js";
import { collectDeletedIds, orgRecordId } from "./org-state.js";
import { locksFieldSalesData } from "./permissions.js";
import {
  isFieldSalesScopedOrgKey,
  isFieldSalesScopedRecordKind,
} from "./record-table-kinds.js";
import { canAccessScopedRow } from "./scoping.js";

export { isFieldSalesScopedOrgKey, isFieldSalesScopedRecordKind };

export function shouldScopeFieldSalesRecords(profile) {
  return locksFieldSalesData(profile?.role);
}

function recordOwnerId(record = {}) {
  return String(record.commercialId || record.commercial_id || "").trim();
}

function recordCreatedBy(record = {}) {
  return String(record.createdBy || record.created_by || "").trim();
}

function recordClientId(record = {}) {
  return String(record.clientId || record.client_id || "").trim();
}

function clientNameKeys(row) {
  const keys = new Set();
  const display = normalizeText(displayClientName(row));
  if (display) keys.add(display);
  const full = normalizeText(`${row.prenom || ""} ${row.nom || ""}`);
  if (full) keys.add(full);
  const reverse = normalizeText(`${row.nom || ""} ${row.prenom || ""}`);
  if (reverse) keys.add(reverse);
  const company = normalizeText(row.raison_sociale || "");
  if (company) keys.add(company);
  return keys;
}

export function stampRecordOwner(record, userId, scopedIds) {
  if (!record || !userId) return record;
  const next = { ...record };
  const owner = recordOwnerId(next);
  if (!owner) next.commercialId = userId;
  else if (Array.isArray(scopedIds) && !scopedIds.includes(owner)) next.commercialId = userId;
  if (!recordCreatedBy(next)) next.createdBy = userId;
  return next;
}

export function canSeeFieldSalesRecord(record, ctx) {
  if (!record) return false;
  if (!ctx || ctx.scopedIds == null) return true;
  if (
    canAccessScopedRow(
      ctx.profile,
      ctx.userId,
      {
        organization_id: ctx.profile?.organization_id,
        commercial_id: recordOwnerId(record) || null,
        created_by: recordCreatedBy(record) || null,
      },
      ctx.teamIds || []
    )
  ) {
    return true;
  }
  const clientId = recordClientId(record);
  if (clientId && ctx.clientIds?.has(clientId)) return true;
  const quoteId = String(record.quoteId || record.quote_id || "").trim();
  if (quoteId && ctx.quoteIds?.has(quoteId)) return true;
  const studyId = String(record.id == null ? "" : record.id);
  if (studyId && ctx.studyIdsFromQuotes?.has(studyId)) return true;
  const quoteNumber = String(record.quoteNumber || record.quote_number || "").trim();
  if (quoteNumber && ctx.quoteNumbers?.has(quoteNumber)) return true;
  const clientName = normalizeText(record.client || record.clientName || "");
  if (clientName && ctx.clientNames?.has(clientName)) return true;
  return false;
}

export function filterFieldSalesRecords(records, ctx) {
  if (!ctx || ctx.scopedIds == null) return Array.isArray(records) ? records : [];
  return (Array.isArray(records) ? records : []).filter(record => canSeeFieldSalesRecord(record, ctx));
}

export function buildFieldSalesRecordContext({
  profile,
  userId,
  teamIds = [],
  scopedIds,
  clients = [],
  devis = [],
} = {}) {
  const clientIds = new Set((clients || []).map(row => String(row.id)));
  const clientNames = new Set();
  for (const row of clients || []) {
    for (const key of clientNameKeys(row)) clientNames.add(key);
  }
  const quoteIds = new Set((devis || []).map(row => String(row.id)));
  const quoteNumbers = new Set(
    (devis || []).map(row => String(row.numero_devis || "").trim()).filter(Boolean)
  );
  const studyIdsFromQuotes = new Set(
    (devis || []).map(row => (row.pv_study_id == null ? "" : String(row.pv_study_id))).filter(Boolean)
  );
  const ctx = {
    profile,
    userId,
    scopedIds,
    teamIds,
    clientIds,
    clientNames,
    quoteIds,
    quoteNumbers,
    studyIdsFromQuotes,
  };
  return { ...ctx, canSee: record => canSeeFieldSalesRecord(record, ctx) };
}

export function prepareScopedRecordMutation({
  current = [],
  incoming = [],
  deletedIds,
  canSee = () => true,
  userId,
  scopedIds,
  stampOwners = false,
} = {}) {
  const currentList = Array.isArray(current) ? current : [];
  const incomingList = Array.isArray(incoming) ? incoming : [];
  const currentById = new Map(currentList.map(row => [orgRecordId(row), row]).filter(([id]) => id));

  const requestedDelete = Array.isArray(deletedIds)
    ? deletedIds.map(value => String(value)).filter(Boolean)
    : collectDeletedIds(currentList.filter(canSee), incomingList);

  const toDelete = requestedDelete.filter(id => {
    const existing = currentById.get(id);
    return existing ? canSee(existing) : false;
  });

  const toUpsert = [];
  for (const row of incomingList) {
    const id = orgRecordId(row);
    const existing = id ? currentById.get(id) : null;
    if (existing && !canSee(existing)) continue;
    const next = stampOwners ? stampRecordOwner(row, userId, scopedIds) : row;
    toUpsert.push(next);
  }

  return { toDelete, toUpsert };
}
