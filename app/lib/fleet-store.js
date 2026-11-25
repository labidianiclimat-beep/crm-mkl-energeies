import {
  DEFAULT_FLEET_SETTINGS,
  FLEET_DOCUMENTS_BUCKET,
  applyValidatedMileage,
  buildFleetAlerts,
  displayPlate,
  fleetCapabilities,
  deadlineInput,
  mergeAlerts,
  normalizeVehicleInput,
  openDeadline,
} from "./fleet.js";
import { serviceRequest } from "./supabase-server.js";

const VEHICLE_SELECT = "id,organization_id,internal_code,plate,plate_key,brand,model,category,year,energy,entry_date,holding_mode,current_km,last_validated_reading_at,status,notes,archived_at,created_by,updated_by,created_at,updated_at";
const ASSIGNMENT_COLUMNS = "id,organization_id,vehicle_id,driver_id,started_on,ended_on,start_km,end_km,status,prepared_by,validated_by,rejected_reason,created_at,updated_at";
let assignmentSelectIncludesHolder = true;
const HANDOVER_SELECT = "id,organization_id,assignment_id,vehicle_id,kind,handover_date,km,damages,accessories,observations,created_by,created_at";
const MILEAGE_SELECT = "id,organization_id,vehicle_id,driver_id,reading_date,km,photo_document_id,status,rejection_reason,flag_low,flag_incoherent,submitted_at,reviewed_at,reviewed_by";
const INCIDENT_SELECT = "id,organization_id,vehicle_id,reporter_id,occurred_on,kind,description,urgency,owner_id,status,due_on,created_at,updated_at";
const EXPENSE_SELECT = "id,organization_id,vehicle_id,category,other_label,occurred_on,amount_ttc,supplier,payment_method,km,receipt_document_id,status,rejection_reason,created_by,reviewed_by,reviewed_at,created_at";
const DOCUMENT_SELECT = "id,organization_id,vehicle_id,assignment_id,incident_id,expense_id,kind,title,doc_date,expires_on,mime_type,file_size,storage_path,created_by,created_at";
const DEADLINE_SELECT = "id,organization_id,vehicle_id,kind,title,due_on,due_km,lead_days,status,notes,created_at,updated_at";
const ALERT_SELECT = "id,organization_id,vehicle_id,kind,title,due_on,status,owner_id,treated_at,treated_by,source_type,source_id,dedupe_key,created_at";
const COMMENT_SELECT = "id,organization_id,vehicle_id,author_id,body,created_at";

function orgFilter(organizationId) {
  return `organization_id=eq.${encodeURIComponent(organizationId)}`;
}

export function vehicleToUi(row, extras = {}) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    internalCode: row.internal_code,
    plate: displayPlate(row.plate),
    brand: row.brand || "",
    model: row.model || "",
    category: row.category,
    year: row.year,
    energy: row.energy,
    entryDate: row.entry_date,
    holdingMode: row.holding_mode,
    currentKm: Number(row.current_km || 0),
    lastValidatedReadingAt: row.last_validated_reading_at,
    status: row.status,
    notes: row.notes || "",
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    driverId: extras.driverId || null,
    driverName: extras.driverName || "",
    assignedSince: extras.assignedSince || null,
  };
}

export function assignmentToUi(row, extras = {}) {
  if (!row) return null;
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    driverId: row.driver_id,
    holderLabel: row.holder_label || "",
    driverName: extras.driverName || row.holder_label || "",
    startedOn: row.started_on,
    endedOn: row.ended_on,
    startKm: row.start_km,
    endKm: row.end_km,
    status: row.status,
    preparedBy: row.prepared_by,
    validatedBy: row.validated_by,
    rejectedReason: row.rejected_reason,
    createdAt: row.created_at,
    handovers: extras.handovers || [],
  };
}

export function mileageToUi(row) {
  if (!row) return null;
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    driverId: row.driver_id,
    readingDate: row.reading_date,
    km: Number(row.km || 0),
    photoDocumentId: row.photo_document_id,
    status: row.status,
    rejectionReason: row.rejection_reason,
    flagLow: Boolean(row.flag_low),
    flagIncoherent: Boolean(row.flag_incoherent),
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
  };
}

export function incidentToUi(row, extras = {}) {
  if (!row) return null;
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    reporterId: row.reporter_id,
    reporterName: extras.reporterName || "",
    occurredOn: row.occurred_on,
    kind: row.kind,
    description: row.description,
    urgency: row.urgency,
    ownerId: row.owner_id,
    ownerName: extras.ownerName || "",
    status: row.status,
    dueOn: row.due_on,
    createdAt: row.created_at,
    events: extras.events || [],
  };
}

export function expenseToUi(row, extras = {}) {
  if (!row) return null;
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    category: row.category,
    otherLabel: row.other_label || "",
    occurredOn: row.occurred_on,
    amountTtc: Number(row.amount_ttc || 0),
    supplier: row.supplier || "",
    paymentMethod: row.payment_method || "",
    km: row.km,
    receiptDocumentId: row.receipt_document_id,
    status: row.status,
    rejectionReason: row.rejection_reason,
    createdBy: row.created_by,
    authorName: extras.authorName || "",
    createdAt: row.created_at,
  };
}

export function documentToUi(row) {
  if (!row) return null;
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    assignmentId: row.assignment_id,
    incidentId: row.incident_id,
    expenseId: row.expense_id,
    kind: row.kind,
    title: row.title,
    docDate: row.doc_date,
    expiresOn: row.expires_on,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size || 0),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function deadlineToUi(row) {
  if (!row) return null;
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    kind: row.kind,
    title: row.title || "",
    dueOn: row.due_on,
    dueKm: row.due_km,
    leadDays: row.lead_days,
    status: row.status,
    notes: row.notes || "",
  };
}

export function alertToUi(row) {
  if (!row) return null;
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    kind: row.kind,
    title: row.title,
    dueOn: row.due_on,
    status: row.status,
    ownerId: row.owner_id,
    treatedAt: row.treated_at,
    treatedBy: row.treated_by,
    sourceType: row.source_type,
    sourceId: row.source_id,
    dedupeKey: row.dedupe_key,
    createdAt: row.created_at,
  };
}

export function settingsToUi(row) {
  return {
    deadlineLeadDays: Number(row?.deadline_lead_days ?? DEFAULT_FLEET_SETTINGS.deadlineLeadDays),
    documentLeadDays: Number(row?.document_lead_days ?? DEFAULT_FLEET_SETTINGS.documentLeadDays),
    mileageRequestDay: Number(row?.mileage_request_day ?? DEFAULT_FLEET_SETTINGS.mileageRequestDay),
    kmJumpThreshold: Number(row?.km_jump_threshold ?? DEFAULT_FLEET_SETTINGS.kmJumpThreshold),
  };
}

export async function loadProfilesMap(organizationId, ids = []) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return {};
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,full_name,email,role&organization_id=eq.${encodeURIComponent(organizationId)}&id=in.(${unique.map(id => encodeURIComponent(id)).join(",")})`
  );
  return Object.fromEntries((rows || []).map(row => [row.id, row]));
}

export async function listOrgProfiles(organizationId) {
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,full_name,email,role,active&organization_id=eq.${encodeURIComponent(organizationId)}&order=full_name.asc`
  );
  return rows || [];
}

export async function listAdminVipIds(organizationId) {
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id&organization_id=eq.${encodeURIComponent(organizationId)}&role=eq.${encodeURIComponent("Admin VIP")}&active=eq.true`
  );
  return (rows || []).map(row => row.id);
}

export async function loadFleetSettings(organizationId) {
  const rows = await serviceRequest(
    `/rest/v1/fleet_settings?select=*&${orgFilter(organizationId)}&limit=1`
  );
  return settingsToUi(rows?.[0]);
}

export async function saveFleetSettings(organizationId, settings, userId) {
  await serviceRequest("/rest/v1/fleet_settings?on_conflict=organization_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: {
      organization_id: organizationId,
      deadline_lead_days: Number(settings.deadlineLeadDays ?? DEFAULT_FLEET_SETTINGS.deadlineLeadDays),
      document_lead_days: Number(settings.documentLeadDays ?? DEFAULT_FLEET_SETTINGS.documentLeadDays),
      mileage_request_day: Number(settings.mileageRequestDay ?? DEFAULT_FLEET_SETTINGS.mileageRequestDay),
      km_jump_threshold: Number(settings.kmJumpThreshold ?? DEFAULT_FLEET_SETTINGS.kmJumpThreshold),
      updated_by: userId || null,
      updated_at: new Date().toISOString(),
    },
  });
  return loadFleetSettings(organizationId);
}

export async function listVehicles(organizationId) {
  return serviceRequest(
    `/rest/v1/fleet_vehicles?select=${VEHICLE_SELECT}&${orgFilter(organizationId)}&order=internal_code.asc`
  );
}

export async function getVehicleRow(organizationId, id) {
  const rows = await serviceRequest(
    `/rest/v1/fleet_vehicles?select=${VEHICLE_SELECT}&${orgFilter(organizationId)}&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function listAssignments(organizationId, { vehicleId, driverId, status } = {}) {
  const filters = [`${orgFilter(organizationId)}`];
  if (vehicleId) filters.push(`vehicle_id=eq.${encodeURIComponent(vehicleId)}`);
  if (driverId) filters.push(`driver_id=eq.${encodeURIComponent(driverId)}`);
  if (status) filters.push(`status=eq.${encodeURIComponent(status)}`);
  const select = assignmentSelectIncludesHolder ? `${ASSIGNMENT_COLUMNS},holder_label` : ASSIGNMENT_COLUMNS;
  try {
    return await serviceRequest(
      `/rest/v1/fleet_assignments?select=${select}&${filters.join("&")}&order=started_on.desc`
    );
  } catch (error) {
    if (assignmentSelectIncludesHolder && /holder_label/i.test(String(error.message || ""))) {
      assignmentSelectIncludesHolder = false;
      return serviceRequest(
        `/rest/v1/fleet_assignments?select=${ASSIGNMENT_COLUMNS}&${filters.join("&")}&order=started_on.desc`
      );
    }
    throw error;
  }
}

export async function listActiveAssignments(organizationId) {
  return listAssignments(organizationId, { status: "active" });
}

export async function assignedVehicleIdsForDriver(organizationId, driverId) {
  const rows = await listAssignments(organizationId, { driverId, status: "active" });
  return (rows || []).map(row => row.vehicle_id);
}

export async function resolveFleetCaps(auth) {
  const assignedVehicleIds = await assignedVehicleIdsForDriver(auth.profile.organization_id, auth.user.id);
  return fleetCapabilities(auth.profile, { assignedVehicleIds });
}

export async function listHandovers(organizationId, assignmentIds = []) {
  if (!assignmentIds.length) return [];
  return serviceRequest(
    `/rest/v1/fleet_handovers?select=${HANDOVER_SELECT}&${orgFilter(organizationId)}&assignment_id=in.(${assignmentIds.map(encodeURIComponent).join(",")})&order=created_at.asc`
  );
}

export async function listMileage(organizationId, { vehicleId, driverId } = {}) {
  const filters = [orgFilter(organizationId)];
  if (vehicleId) filters.push(`vehicle_id=eq.${encodeURIComponent(vehicleId)}`);
  if (driverId) filters.push(`driver_id=eq.${encodeURIComponent(driverId)}`);
  return serviceRequest(
    `/rest/v1/fleet_mileage_readings?select=${MILEAGE_SELECT}&${filters.join("&")}&order=reading_date.desc,submitted_at.desc`
  );
}

export async function listIncidents(organizationId, { vehicleId } = {}) {
  const filters = [orgFilter(organizationId)];
  if (vehicleId) filters.push(`vehicle_id=eq.${encodeURIComponent(vehicleId)}`);
  return serviceRequest(
    `/rest/v1/fleet_incidents?select=${INCIDENT_SELECT}&${filters.join("&")}&order=created_at.desc`
  );
}

export async function listIncidentEvents(organizationId, incidentId) {
  return serviceRequest(
    `/rest/v1/fleet_incident_events?select=id,incident_id,author_id,action,note,old_value,new_value,created_at&${orgFilter(organizationId)}&incident_id=eq.${encodeURIComponent(incidentId)}&order=created_at.asc`
  );
}

export async function listExpenses(organizationId, { vehicleId, createdBy } = {}) {
  const filters = [orgFilter(organizationId)];
  if (vehicleId) filters.push(`vehicle_id=eq.${encodeURIComponent(vehicleId)}`);
  if (createdBy) filters.push(`created_by=eq.${encodeURIComponent(createdBy)}`);
  return serviceRequest(
    `/rest/v1/fleet_expenses?select=${EXPENSE_SELECT}&${filters.join("&")}&order=occurred_on.desc,created_at.desc`
  );
}

export async function listDocuments(organizationId, { vehicleId } = {}) {
  const filters = [orgFilter(organizationId)];
  if (vehicleId) filters.push(`vehicle_id=eq.${encodeURIComponent(vehicleId)}`);
  return serviceRequest(
    `/rest/v1/fleet_documents?select=${DOCUMENT_SELECT}&${filters.join("&")}&order=created_at.desc`
  );
}

export async function getDocumentRow(organizationId, id) {
  const rows = await serviceRequest(
    `/rest/v1/fleet_documents?select=${DOCUMENT_SELECT}&${orgFilter(organizationId)}&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function listDeadlines(organizationId, { vehicleId } = {}) {
  const filters = [orgFilter(organizationId)];
  if (vehicleId) filters.push(`vehicle_id=eq.${encodeURIComponent(vehicleId)}`);
  return serviceRequest(
    `/rest/v1/fleet_deadlines?select=${DEADLINE_SELECT}&${filters.join("&")}&order=due_on.asc`
  );
}

export async function listComments(organizationId, vehicleId) {
  return serviceRequest(
    `/rest/v1/fleet_comments?select=${COMMENT_SELECT}&${orgFilter(organizationId)}&vehicle_id=eq.${encodeURIComponent(vehicleId)}&order=created_at.desc`
  );
}

export async function listAlerts(organizationId) {
  return serviceRequest(
    `/rest/v1/fleet_alerts?select=${ALERT_SELECT}&${orgFilter(organizationId)}&order=due_on.asc,created_at.desc`
  );
}

export async function hydrateVehicles(organizationId, rows) {
  const assignments = await listActiveAssignments(organizationId);
  const names = await loadProfilesMap(organizationId, assignments.map(item => item.driver_id));
  return (rows || []).map(row => {
    const assignment = assignments.find(item => item.vehicle_id === row.id);
    const driver = assignment ? names[assignment.driver_id] : null;
    return vehicleToUi(row, {
      driverId: assignment?.driver_id || null,
      driverName: driver?.full_name || assignment?.holder_label || "",
      assignedSince: assignment?.started_on || null,
    });
  });
}

export async function insertVehicle(organizationId, input, userId) {
  const existing = await hydrateVehicles(organizationId, await listVehicles(organizationId));
  const normalized = normalizeVehicleInput(input, { existing });
  const rows = await serviceRequest("/rest/v1/fleet_vehicles", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      organization_id: organizationId,
      internal_code: normalized.internalCode,
      plate: normalized.plate,
      plate_key: normalized.plateKey,
      brand: normalized.brand,
      model: normalized.model,
      category: normalized.category,
      year: normalized.year,
      energy: normalized.energy,
      entry_date: normalized.entryDate || null,
      holding_mode: normalized.holdingMode,
      current_km: normalized.currentKm,
      last_validated_reading_at: normalized.lastValidatedReadingAt,
      status: normalized.status === "assigned" ? "available" : normalized.status,
      notes: normalized.notes,
      created_by: userId || null,
      updated_by: userId || null,
    },
  });
  return rows?.[0];
}

export async function updateVehicleRow(organizationId, id, patch) {
  const rows = await serviceRequest(
    `/rest/v1/fleet_vehicles?id=eq.${encodeURIComponent(id)}&${orgFilter(organizationId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { ...patch, updated_at: new Date().toISOString() },
    }
  );
  return rows?.[0];
}

export async function insertAssignment(organizationId, payload) {
  const rows = await serviceRequest("/rest/v1/fleet_assignments", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: { organization_id: organizationId, ...payload },
  });
  return rows?.[0];
}

export async function updateAssignmentRow(organizationId, id, patch) {
  const rows = await serviceRequest(
    `/rest/v1/fleet_assignments?id=eq.${encodeURIComponent(id)}&${orgFilter(organizationId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { ...patch, updated_at: new Date().toISOString() },
    }
  );
  return rows?.[0];
}

export async function insertHandover(organizationId, payload) {
  const rows = await serviceRequest("/rest/v1/fleet_handovers", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: { organization_id: organizationId, ...payload },
  });
  return rows?.[0];
}

export async function insertMileage(organizationId, payload) {
  const rows = await serviceRequest("/rest/v1/fleet_mileage_readings", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: { organization_id: organizationId, ...payload },
  });
  return rows?.[0];
}

export async function updateMileageRow(organizationId, id, patch) {
  const rows = await serviceRequest(
    `/rest/v1/fleet_mileage_readings?id=eq.${encodeURIComponent(id)}&${orgFilter(organizationId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: patch,
    }
  );
  return rows?.[0];
}

export async function applyMileageToVehicle(organizationId, vehicle, reading) {
  const next = applyValidatedMileage(vehicleToUi(vehicle), mileageToUi(reading));
  return updateVehicleRow(organizationId, vehicle.id, {
    current_km: next.currentKm,
    last_validated_reading_at: next.lastValidatedReadingAt,
    updated_by: reading.reviewed_by || null,
  });
}

export async function insertIncident(organizationId, payload) {
  const rows = await serviceRequest("/rest/v1/fleet_incidents", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: { organization_id: organizationId, ...payload },
  });
  return rows?.[0];
}

export async function updateIncidentRow(organizationId, id, patch) {
  const rows = await serviceRequest(
    `/rest/v1/fleet_incidents?id=eq.${encodeURIComponent(id)}&${orgFilter(organizationId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { ...patch, updated_at: new Date().toISOString() },
    }
  );
  return rows?.[0];
}

export async function insertIncidentEvent(organizationId, payload) {
  await serviceRequest("/rest/v1/fleet_incident_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: { organization_id: organizationId, ...payload },
  });
}

export async function insertExpense(organizationId, payload) {
  const rows = await serviceRequest("/rest/v1/fleet_expenses", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: { organization_id: organizationId, ...payload },
  });
  return rows?.[0];
}

export async function updateExpenseRow(organizationId, id, patch) {
  const rows = await serviceRequest(
    `/rest/v1/fleet_expenses?id=eq.${encodeURIComponent(id)}&${orgFilter(organizationId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: patch,
    }
  );
  return rows?.[0];
}

export async function insertDocument(organizationId, payload) {
  const rows = await serviceRequest("/rest/v1/fleet_documents", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: { organization_id: organizationId, ...payload },
  });
  return rows?.[0];
}

export async function deleteDocumentRow(organizationId, id) {
  await serviceRequest(
    `/rest/v1/fleet_documents?id=eq.${encodeURIComponent(id)}&${orgFilter(organizationId)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
}

export async function upsertOpenDeadline(organizationId, { vehicleId, kind, title, dueOn, dueKm, notes } = {}) {
  const input = deadlineInput({ kind, title, dueOn, dueKm });
  if (!vehicleId) throw new Error("Véhicule manquant.");
  if (!input.due_on && input.due_km == null) throw new Error("Indiquez une date ou un seuil kilométrique.");
  const note = notes == null ? undefined : String(notes);
  const existing = await listDeadlines(organizationId, { vehicleId });
  const rows = (existing || []).map(deadlineToUi);
  const current = rows.find(item => item.kind === input.kind && (item.status || "open") === "open")
    || openDeadline(rows, input.kind);
  if (current?.id) {
    return updateDeadlineRow(organizationId, current.id, {
      kind: input.kind,
      title: input.title,
      due_on: input.due_on,
      due_km: input.due_km,
      ...(note !== undefined ? { notes: note } : {}),
      status: "open",
    });
  }
  return insertDeadline(organizationId, {
    vehicle_id: vehicleId,
    kind: input.kind,
    title: input.title,
    due_on: input.due_on,
    due_km: input.due_km,
    ...(note !== undefined ? { notes: note } : {}),
  });
}

export async function insertDeadline(organizationId, payload) {
  const rows = await serviceRequest("/rest/v1/fleet_deadlines", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: { organization_id: organizationId, ...payload },
  });
  return rows?.[0];
}

export async function updateDeadlineRow(organizationId, id, patch) {
  const rows = await serviceRequest(
    `/rest/v1/fleet_deadlines?id=eq.${encodeURIComponent(id)}&${orgFilter(organizationId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { ...patch, updated_at: new Date().toISOString() },
    }
  );
  return rows?.[0];
}

export async function insertComment(organizationId, payload) {
  const rows = await serviceRequest("/rest/v1/fleet_comments", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: { organization_id: organizationId, ...payload },
  });
  return rows?.[0];
}

export async function insertAlerts(organizationId, alerts) {
  if (!alerts.length) return [];
  return serviceRequest("/rest/v1/fleet_alerts", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
    body: alerts.map(alert => ({
      organization_id: organizationId,
      vehicle_id: alert.vehicleId || null,
      kind: alert.kind,
      title: alert.title,
      due_on: alert.dueOn || null,
      status: "open",
      source_type: alert.sourceType || null,
      source_id: alert.sourceId || null,
      dedupe_key: alert.dedupeKey,
    })),
  });
}

export async function updateAlertRow(organizationId, id, patch) {
  const rows = await serviceRequest(
    `/rest/v1/fleet_alerts?id=eq.${encodeURIComponent(id)}&${orgFilter(organizationId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: patch,
    }
  );
  return rows?.[0];
}

export async function syncFleetAlerts(organizationId) {
  const [vehicleRows, deadlines, documents, incidents, readings, assignments, settings, existing] = await Promise.all([
    listVehicles(organizationId),
    listDeadlines(organizationId),
    listDocuments(organizationId),
    listIncidents(organizationId),
    listMileage(organizationId),
    listAssignments(organizationId),
    loadFleetSettings(organizationId),
    listAlerts(organizationId),
  ]);
  const vehicles = vehicleRows.map(row => vehicleToUi(row));
  const generated = buildFleetAlerts({
    vehicles,
    deadlines: deadlines.map(deadlineToUi),
    documents: documents.map(documentToUi),
    incidents: incidents.map(incidentToUi),
    readings: readings.map(mileageToUi),
    assignments: assignments.map(row => assignmentToUi(row)),
    settings,
  });
  const { created } = mergeAlerts(existing.map(alertToUi), generated);
  if (created.length) await insertAlerts(organizationId, created);
  return listAlerts(organizationId);
}

export function storagePathForFleetFile({ organizationId, vehicleId, documentId, ext = "bin" }) {
  return `${organizationId}/${vehicleId}/${documentId}.${ext}`;
}

export { FLEET_DOCUMENTS_BUCKET };
