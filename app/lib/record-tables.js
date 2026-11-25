import { isMissingRelation } from "./article-taxonomy.js";
import { stripInstallationFinance } from "./installation-finance.js";
import { stripDemoOrgRecords } from "./org-state.js";
import { hydratePvProjectImages, persistPvProjectImages } from "./pv-study-assets.js";
import { recordTableConfig } from "./record-table-kinds.js";
import { serviceRequest } from "./supabase-server.js";

export {
  FIELD_SALES_SCOPED_RECORD_KINDS,
  isFieldSalesScopedOrgKey,
  isFieldSalesScopedRecordKind,
  isKnownRecordTable,
  RECORD_TABLE_BY_ORG_KEY,
  RECORD_TABLES,
  recordTableConfig,
  recordTableModules,
} from "./record-table-kinds.js";

const MIGRATION_STATE_KEY = "mkl-table-migrations";
const SELECT = "organization_id,record_id,client_id,client_name,title,status,payload,created_at,updated_at,updated_by";

function withoutInstallationFinance(kind, records) {
  if (kind !== "installations") return records;
  return (records || []).map(stripInstallationFinance);
}

function asRecordId(record) {
  if (!record || record.id == null || record.id === "") return "";
  return String(record.id);
}

function uuidOrNull(value) {
  const raw = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
}

export function recordToRow(organizationId, record, userId) {
  const id = asRecordId(record);
  if (!id) return null;
  return {
    organization_id: organizationId,
    record_id: id,
    client_id: uuidOrNull(record.clientId),
    client_name: String(record.client || record.clientName || "").trim() || null,
    title: String(record.name || record.number || record.title || "").trim() || null,
    status: String(record.status || record.townHallStatus || "").trim() || null,
    payload: record,
    updated_at: new Date().toISOString(),
    updated_by: userId || null,
  };
}

export function rowToRecord(row) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  return {
    ...payload,
    id: payload.id != null && payload.id !== "" ? payload.id : row.record_id,
    clientId: payload.clientId || row.client_id || "",
    client: payload.client || row.client_name || "",
  };
}

async function loadCrmBlob(organizationId, key) {
  const rows = await serviceRequest(
    `/rest/v1/crm_state?select=state_value&organization_id=eq.${encodeURIComponent(organizationId)}&state_key=eq.${encodeURIComponent(key)}&limit=1`
  );
  return stripDemoOrgRecords(key, rows?.[0]?.state_value);
}

async function loadMigrationFlags(organizationId) {
  const rows = await serviceRequest(
    `/rest/v1/crm_state?select=state_value&organization_id=eq.${encodeURIComponent(organizationId)}&state_key=eq.${encodeURIComponent(MIGRATION_STATE_KEY)}&limit=1`
  );
  const value = rows?.[0]?.state_value;
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function markMigrated(organizationId, kind, userId) {
  const flags = await loadMigrationFlags(organizationId);
  flags[kind] = new Date().toISOString();
  await serviceRequest("/rest/v1/crm_state?on_conflict=organization_id,state_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: {
      organization_id: organizationId,
      state_key: MIGRATION_STATE_KEY,
      state_value: flags,
      updated_by: userId || null,
      updated_at: new Date().toISOString(),
    },
  });
}

export async function listRecordTable(organizationId, kind) {
  const config = recordTableConfig(kind);
  const rows = await serviceRequest(
    `/rest/v1/${config.table}?select=${SELECT}&organization_id=eq.${encodeURIComponent(organizationId)}&order=updated_at.desc`
  );
  return withoutInstallationFinance(kind, (rows || []).map(rowToRecord));
}

async function importFromOrgState(organizationId, kind, userId) {
  const config = recordTableConfig(kind);
  const blob = await loadCrmBlob(organizationId, config.orgStateKey);
  if (!blob.length) {
    await markMigrated(organizationId, kind, userId);
    return [];
  }
  const prepared = withoutInstallationFinance(
    kind,
    kind === "pv_projects" ? await persistPvProjectImages(organizationId, blob) : blob
  );
  await upsertRecordRows(organizationId, kind, prepared, userId);
  await markMigrated(organizationId, kind, userId);
  return prepared;
}

export async function loadRecordTable(organizationId, kind, userId) {
  const existing = await listRecordTable(organizationId, kind);
  if (existing.length) return existing;
  const flags = await loadMigrationFlags(organizationId);
  if (flags[kind]) return [];
  return importFromOrgState(organizationId, kind, userId);
}

export async function upsertRecordRows(organizationId, kind, records, userId) {
  const config = recordTableConfig(kind);
  const prepared = withoutInstallationFinance(
    kind,
    kind === "pv_projects" ? await persistPvProjectImages(organizationId, records) : records
  );
  const rows = (prepared || []).map(record => recordToRow(organizationId, record, userId)).filter(Boolean);
  if (!rows.length) return prepared;
  await serviceRequest(`/rest/v1/${config.table}?on_conflict=organization_id,record_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: rows,
  });
  return prepared;
}

export async function deleteRecordRows(organizationId, kind, deletedIds) {
  const config = recordTableConfig(kind);
  const ids = (deletedIds || []).map(value => String(value)).filter(Boolean);
  if (!ids.length) return;
  const filter = ids.map(id => `"${id.replace(/"/g, "")}"`).join(",");
  await serviceRequest(
    `/rest/v1/${config.table}?organization_id=eq.${encodeURIComponent(organizationId)}&record_id=in.(${filter})`,
    { method: "DELETE" }
  );
}

export async function hydrateRecordTable(organizationId, kind, records) {
  if (kind !== "pv_projects") return records;
  return hydratePvProjectImages(organizationId, records);
}

export function isRecordTableMissing(error, kind) {
  const config = recordTableConfig(kind);
  return isMissingRelation(error, config?.table);
}
