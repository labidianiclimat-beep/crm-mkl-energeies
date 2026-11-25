import { pickChangedFields } from "./activity-logs.js";
import {
  DECLARATION_STATUSES,
  FLEET_ACTIVITY_ACTIONS,
  FLEET_MODULE,
  assertIncidentClose,
  assertSingleActiveAssignment,
  assignmentHolderName,
  canViewVehicle,
  costPerKm,
  expenseTotals,
  findExpenseDuplicate,
  fleetCapabilities,
  isGarageHolder,
  mileageFlags,
  officialExpenses,
  pendingExpenses,
  resolveAssignmentHolder,
  sanitizeVehiclePatch,
  todayIsoDate,
  vidangeKmFromDeadline,
  vehiclePatchHasFields,
  vehicleStatusAfterHolder,
  vehicleStatusAfterRelease,
  vehicleTrackedFields,
} from "./fleet.js";
import {
  applyMileageToVehicle,
  assignedVehicleIdsForDriver,
  getVehicleRow,
  hydrateVehicles,
  insertAssignment,
  insertComment,
  insertDeadline,
  insertExpense,
  insertHandover,
  insertIncident,
  insertIncidentEvent,
  insertMileage,
  listActiveAssignments,
  listAdminVipIds,
  listAlerts,
  listAssignments,
  listComments,
  listDeadlines,
  listDocuments,
  listExpenses,
  listHandovers,
  listIncidentEvents,
  listIncidents,
  listMileage,
  listOrgProfiles,
  listVehicles,
  loadFleetSettings,
  loadProfilesMap,
  syncFleetAlerts,
  updateAssignmentRow,
  updateExpenseRow,
  updateIncidentRow,
  updateMileageRow,
  updateVehicleRow,
  assignmentToUi,
  deadlineToUi,
  documentToUi,
  expenseToUi,
  incidentToUi,
  mileageToUi,
  vehicleToUi,
} from "./fleet-store.js";
import { actorFromAuth, logActivity } from "./log-activity.js";
import { serviceRequest } from "./supabase-server.js";

export async function requireFleetSession(auth) {
  const assignedVehicleIds = await assignedVehicleIdsForDriver(auth.profile.organization_id, auth.user.id);
  const caps = fleetCapabilities(auth.profile, { assignedVehicleIds });
  if (!caps.canEnter) {
    return { ok: false, status: 403, error: "Accès refusé au parc automobile." };
  }
  return { ok: true, caps, orgId: auth.profile.organization_id };
}

export async function requireVehicleAccess(auth, vehicleId, { write = false } = {}) {
  const session = await requireFleetSession(auth);
  if (!session.ok) return session;
  const row = await getVehicleRow(session.orgId, vehicleId);
  if (!row) return { ok: false, status: 404, error: "Véhicule introuvable." };
  const vehicle = vehicleToUi(row);
  if (!canViewVehicle(session.caps, vehicle)) {
    return { ok: false, status: 404, error: "Véhicule introuvable." };
  }
  if (write && !session.caps.canOperate && !session.caps.assignedVehicleIds.includes(vehicle.id)) {
    return { ok: false, status: 403, error: "Action non autorisée." };
  }
  return { ...session, vehicle, row };
}

export async function logFleet(auth, action, entity, { oldValue = null, newValue = null } = {}) {
  await logActivity({
    ...actorFromAuth(auth),
    action,
    module: FLEET_MODULE,
    entityType: "fleet_vehicle",
    entityId: entity?.id || entity?.vehicleId || null,
    entityLabel: entity?.plate || entity?.internalCode || entity?.title || "Véhicule",
    oldValue,
    newValue,
  });
}

export async function notifyFleetManagers(organizationId, { title, body, uniqueKey, kind = "fleet" }) {
  const ids = await listAdminVipIds(organizationId);
  if (!ids.length) return;
  await serviceRequest("/rest/v1/crm_notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
    body: ids.map(userId => ({
      organization_id: organizationId,
      user_id: userId,
      title,
      body,
      kind,
      unique_key: uniqueKey || null,
    })),
  }).catch(() => null);
}

function profileName(map, id) {
  return map[id]?.full_name || "";
}

export async function loadFleetOverview(orgId, caps) {
  const [rows, assignments, incidents, expenses, alerts, deadlines] = await Promise.all([
    listVehicles(orgId),
    listActiveAssignments(orgId),
    listIncidents(orgId),
    listExpenses(orgId),
    syncFleetAlerts(orgId),
    listDeadlines(orgId),
  ]);
  let vehicles = await hydrateVehicles(orgId, rows);
  const controleByVehicle = new Map();
  const vidangeByVehicle = new Map();
  for (const row of (deadlines || []).map(deadlineToUi)) {
    if (row.status !== "open") continue;
    if (row.kind === "controle" && row.dueOn) {
      const current = controleByVehicle.get(row.vehicleId);
      if (!current || String(row.dueOn) < String(current)) controleByVehicle.set(row.vehicleId, row.dueOn);
    }
    if (row.kind === "vidange") {
      const km = vidangeKmFromDeadline(row);
      if (km != null) vidangeByVehicle.set(row.vehicleId, km);
    }
  }
  vehicles = vehicles.map(vehicle => ({
    ...vehicle,
    controleOn: controleByVehicle.get(vehicle.id) || "",
    vidangeKm: vidangeByVehicle.has(vehicle.id) ? vidangeByVehicle.get(vehicle.id) : "",
  }));
  if (!caps.canViewAll) {
    vehicles = vehicles.filter(item => caps.assignedVehicleIds.includes(item.id));
  }
  return {
    vehicles,
    assignments: assignments.map(assignmentToUi),
    incidents: incidents.map(incidentToUi),
    expenses: expenses.map(expenseToUi),
    alerts: alerts.map(item => ({
      id: item.id,
      vehicleId: item.vehicle_id,
      kind: item.kind,
      title: item.title,
      dueOn: item.due_on,
      status: item.status,
      ownerId: item.owner_id,
      treatedAt: item.treated_at,
    })),
    caps,
  };
}

export async function loadVehicleDetail(orgId, vehicle, caps) {
  const [
    assignments,
    mileage,
    incidents,
    expenses,
    documents,
    deadlines,
    comments,
    settings,
  ] = await Promise.all([
    listAssignments(orgId, { vehicleId: vehicle.id }),
    listMileage(orgId, { vehicleId: vehicle.id }),
    listIncidents(orgId, { vehicleId: vehicle.id }),
    listExpenses(orgId, { vehicleId: vehicle.id }),
    listDocuments(orgId, { vehicleId: vehicle.id }),
    listDeadlines(orgId, { vehicleId: vehicle.id }),
    caps.canOperate || caps.canReadOnly ? listComments(orgId, vehicle.id) : Promise.resolve([]),
    loadFleetSettings(orgId),
  ]);
  const handovers = await listHandovers(orgId, assignments.map(item => item.id));
  const people = await loadProfilesMap(orgId, [
    ...assignments.map(item => item.driver_id),
    ...incidents.map(item => item.reporter_id),
    ...incidents.map(item => item.owner_id),
    ...expenses.map(item => item.created_by),
    ...comments.map(item => item.author_id),
  ]);
  const eventsByIncident = {};
  for (const incident of incidents) {
    eventsByIncident[incident.id] = await listIncidentEvents(orgId, incident.id);
  }
  const scopedMileage = caps.canViewAll ? mileage : mileage.filter(item => item.driver_id === vehicle.driverId || caps.assignedVehicleIds.includes(item.vehicle_id));
  const scopedExpenses = caps.canViewAll ? expenses : expenses.filter(item => item.created_by && caps.isDriver);
  return {
    vehicle,
    assignments: assignments.map(row => assignmentToUi(row, {
      driverName: assignmentHolderName(row, profileName(people, row.driver_id)),
      handovers: handovers.filter(item => item.assignment_id === row.id).map(item => ({
        id: item.id,
        kind: item.kind,
        date: item.handover_date,
        km: item.km,
        damages: item.damages || [],
        accessories: item.accessories || [],
        observations: item.observations || "",
      })),
    })),
    mileage: scopedMileage.map(mileageToUi),
    incidents: incidents.map(row => incidentToUi(row, {
      reporterName: profileName(people, row.reporter_id),
      ownerName: profileName(people, row.owner_id),
      events: (eventsByIncident[row.id] || []).map(event => ({
        id: event.id,
        action: event.action,
        note: event.note,
        oldValue: event.old_value,
        newValue: event.new_value,
        createdAt: event.created_at,
      })),
    })),
    expenses: (caps.canViewAll ? expenses : expenses.filter(item => item.created_by)).map(row => expenseToUi(row, {
      authorName: profileName(people, row.created_by),
    })),
    documents: documents.map(documentToUi),
    deadlines: deadlines.map(deadlineToUi),
    comments: comments.map(row => ({
      id: row.id,
      authorId: row.author_id,
      authorName: profileName(people, row.author_id),
      body: row.body,
      createdAt: row.created_at,
    })),
    settings,
    users: caps.canViewAll ? (await listOrgProfiles(orgId)).map(row => ({
      id: row.id,
      name: row.full_name,
      email: row.email,
      role: row.role,
      active: row.active,
    })) : [],
  };
}

export async function loadDriverHome(orgId, caps, userId) {
  const vehicleId = caps.assignedVehicleId;
  if (!vehicleId) return { vehicle: null, caps };
  const row = await getVehicleRow(orgId, vehicleId);
  if (!row) return { vehicle: null, caps };
  const detail = await loadVehicleDetail(orgId, vehicleToUi(row, {
    driverId: userId,
  }), caps);
  const upcoming = detail.deadlines
    .filter(item => item.status === "open")
    .slice(0, 6);
  return {
    ...detail,
    upcoming,
    declarations: [
      ...detail.mileage.map(item => ({ ...item, type: "mileage" })),
      ...detail.incidents.map(item => ({ ...item, type: "incident" })),
      ...detail.expenses.map(item => ({ ...item, type: "expense" })),
    ].sort((a, b) => String(b.createdAt || b.submittedAt || b.occurredOn || "").localeCompare(String(a.createdAt || a.submittedAt || a.occurredOn || ""))),
    caps,
  };
}

export async function createAssignmentRecord(auth, caps, body) {
  const orgId = auth.profile.organization_id;
  const vehicle = await getVehicleRow(orgId, body.vehicleId);
  if (!vehicle) throw Object.assign(new Error("Véhicule introuvable."), { status: 404 });
  if (vehicle.status === "archived") throw new Error("Ce véhicule est archivé.");
  const assignments = (await listAssignments(orgId, { vehicleId: vehicle.id })).map(assignmentToUi);
  const active = assignments.find(item => item.status === "active");
  const pending = assignments.find(item => item.status === "pending");
  if (pending) throw new Error("Une affectation est déjà en attente de validation.");
  const holder = resolveAssignmentHolder(body);
  if (!body.startedOn) throw new Error("Indiquez la date de remise.");
  const status = caps.canAssign ? "active" : "pending";
  if (status === "active" && active) {
    throw new Error("Clôturez d’abord l’affectation en cours avec un état des lieux de restitution.");
  }
  if (status === "pending") {
    const row = await insertHolderAssignment(orgId, {
      vehicle_id: vehicle.id,
      ...holderColumns(holder),
      started_on: body.startedOn,
      start_km: body.startKm == null ? vehicle.current_km : Number(body.startKm),
      status: "pending",
      prepared_by: auth.user.id,
    });
    await saveHandover(orgId, row, body, auth.user.id, "handover");
    await logFleet(auth, FLEET_ACTIVITY_ACTIONS.ASSIGNMENT_PREPARE, vehicleToUi(vehicle), { newValue: { driver_id: holder.driverId, holder_label: holder.holderLabel, status: "pending" } });
    await notifyFleetManagers(orgId, {
      title: "Affectation à valider",
      body: `${vehicle.plate} — préparation d’affectation`,
      uniqueKey: `fleet-assign-${row.id}`,
    });
    return row;
  }
  if (active) assertSingleActiveAssignment(assignments, vehicle.id);
  const row = await insertHolderAssignment(orgId, {
    vehicle_id: vehicle.id,
    ...holderColumns(holder),
    started_on: body.startedOn,
    start_km: body.startKm == null ? vehicle.current_km : Number(body.startKm),
    status: "active",
    prepared_by: auth.user.id,
    validated_by: auth.user.id,
  });
  await saveHandover(orgId, row, body, auth.user.id, "handover");
  await updateVehicleRow(orgId, vehicle.id, {
    status: vehicleStatusAfterHolder(vehicle.status, holder.garage),
    updated_by: auth.user.id,
  });
  await logFleet(auth, FLEET_ACTIVITY_ACTIONS.ASSIGNMENT_VALIDATE, vehicleToUi(vehicle), { newValue: { driver_id: holder.driverId, holder_label: holder.holderLabel } });
  return row;
}

function holderColumns(holder) {
  if (holder.garage) return { driver_id: null, holder_label: holder.holderLabel };
  return { driver_id: holder.driverId };
}

async function insertHolderAssignment(orgId, payload) {
  try {
    return await insertAssignment(orgId, payload);
  } catch (error) {
    if (payload.holder_label && /holder_label|driver_id|not-null|null value|column/i.test(String(error.message || ""))) {
      throw new Error("Garage automobile n’est pas encore enregistrable : le script SQL du parc n’est pas dans Supabase.");
    }
    throw error;
  }
}

export async function changeDriverRecord(auth, caps, body) {
  if (!caps.canAssign) throw Object.assign(new Error("Vous ne pouvez pas changer le conducteur."), { status: 403 });
  const orgId = auth.profile.organization_id;
  const vehicle = await getVehicleRow(orgId, body.vehicleId);
  if (!vehicle) throw Object.assign(new Error("Véhicule introuvable."), { status: 404 });
  const assignments = await listAssignments(orgId, { vehicleId: vehicle.id });
  const active = assignments.find(item => item.status === "active");
  if (!active) throw new Error("Aucune affectation active.");
  if (!body.returnDate || body.returnKm == null || body.returnKm === "") {
    throw new Error("L’état des lieux de restitution est obligatoire.");
  }
  const holder = resolveAssignmentHolder(body);
  await updateAssignmentRow(orgId, active.id, {
    status: "closed",
    ended_on: body.returnDate,
    end_km: Number(body.returnKm),
  });
  await saveHandover(orgId, active, {
    startedOn: body.returnDate,
    startKm: body.returnKm,
    damages: body.returnDamages,
    accessories: body.returnAccessories,
    observations: body.returnObservations,
  }, auth.user.id, "return");
  const next = await insertHolderAssignment(orgId, {
    vehicle_id: vehicle.id,
    ...holderColumns(holder),
    started_on: body.startedOn || body.returnDate,
    start_km: body.startKm == null ? Number(body.returnKm) : Number(body.startKm),
    status: "active",
    prepared_by: auth.user.id,
    validated_by: auth.user.id,
  });
  await saveHandover(orgId, next, body, auth.user.id, "handover");
  await updateVehicleRow(orgId, vehicle.id, {
    status: vehicleStatusAfterHolder(vehicle.status, holder.garage),
    current_km: Number(body.returnKm),
    updated_by: auth.user.id,
  });
  await logFleet(auth, FLEET_ACTIVITY_ACTIONS.ASSIGNMENT_CHANGE, vehicleToUi(vehicle), {
    oldValue: { driver_id: active.driver_id, holder_label: active.holder_label || "", assignment_id: active.id },
    newValue: { driver_id: holder.driverId, holder_label: holder.holderLabel, assignment_id: next.id },
  });
  return { closedId: active.id, openedId: next.id };
}

export async function releaseAssignmentRecord(auth, caps, body) {
  if (!caps.canAssign) throw Object.assign(new Error("Vous ne pouvez pas rendre ce véhicule disponible."), { status: 403 });
  const orgId = auth.profile.organization_id;
  const vehicle = await getVehicleRow(orgId, body.vehicleId);
  if (!vehicle) throw Object.assign(new Error("Véhicule introuvable."), { status: 404 });
  const assignments = await listAssignments(orgId, { vehicleId: vehicle.id });
  const active = assignments.find(item => item.status === "active");
  if (!active) throw new Error("Aucune affectation active.");
  if (!body.returnDate || body.returnKm == null || body.returnKm === "") {
    throw new Error("Indiquez la date et le kilométrage pour rendre le véhicule disponible.");
  }
  await updateAssignmentRow(orgId, active.id, {
    status: "closed",
    ended_on: body.returnDate,
    end_km: Number(body.returnKm),
  });
  await saveHandover(orgId, active, {
    startedOn: body.returnDate,
    startKm: body.returnKm,
    damages: body.returnDamages,
    observations: body.returnObservations,
  }, auth.user.id, "return");
  for (const pending of assignments.filter(item => item.status === "pending")) {
    await updateAssignmentRow(orgId, pending.id, {
      status: "rejected",
      rejected_reason: "Véhicule rendu disponible",
    });
  }
  const status = vehicleStatusAfterRelease(vehicle.status);
  await updateVehicleRow(orgId, vehicle.id, {
    status,
    current_km: Number(body.returnKm),
    updated_by: auth.user.id,
  });
  await logFleet(auth, FLEET_ACTIVITY_ACTIONS.ASSIGNMENT_RELEASE, vehicleToUi(vehicle), {
    oldValue: { driver_id: active.driver_id, holder_label: active.holder_label || "", status: vehicle.status },
    newValue: { status, assignment_id: active.id },
  });
  return { closedId: active.id, status };
}

async function saveHandover(orgId, assignment, body, userId, kind) {
  const date = kind === "return" ? body.startedOn || body.returnDate : body.startedOn || todayIsoDate();
  const km = kind === "return" ? body.startKm ?? body.returnKm : body.startKm;
  await insertHandover(orgId, {
    assignment_id: assignment.id,
    vehicle_id: assignment.vehicle_id,
    kind,
    handover_date: date,
    km: km == null ? null : Number(km),
    damages: Array.isArray(body.damages) ? body.damages : (Array.isArray(body.returnDamages) ? body.returnDamages : []),
    accessories: Array.isArray(body.accessories) ? body.accessories : (Array.isArray(body.returnAccessories) ? body.returnAccessories : []),
    observations: body.observations || body.returnObservations || "",
    created_by: userId,
  });
}

export async function reviewAssignment(auth, caps, assignmentId, { action, reason }) {
  if (!caps.canAssign) throw Object.assign(new Error("Seul l’Admin VIP peut valider une affectation."), { status: 403 });
  const orgId = auth.profile.organization_id;
  const rows = await listAssignments(orgId);
  const assignment = rows.find(item => item.id === assignmentId);
  if (!assignment) throw Object.assign(new Error("Affectation introuvable."), { status: 404 });
  const vehicle = await getVehicleRow(orgId, assignment.vehicle_id);
  if (action === "reject") {
    await updateAssignmentRow(orgId, assignmentId, {
      status: "rejected",
      rejected_reason: String(reason || "").trim() || "Rejetée",
    });
    await logFleet(auth, FLEET_ACTIVITY_ACTIONS.ASSIGNMENT_REJECT, vehicleToUi(vehicle), { oldValue: { status: "pending" }, newValue: { status: "rejected", reason } });
    return { ok: true };
  }
  const actives = rows.filter(item => item.vehicle_id === assignment.vehicle_id && item.status === "active");
  if (actives.length) throw new Error("Une affectation active existe déjà. Effectuez d’abord le changement de conducteur.");
  await updateAssignmentRow(orgId, assignmentId, {
    status: "active",
    validated_by: auth.user.id,
  });
  await updateVehicleRow(orgId, assignment.vehicle_id, {
    status: vehicleStatusAfterHolder(vehicle.status, isGarageHolder(assignment.holder_label)),
    updated_by: auth.user.id,
  });
  await logFleet(auth, FLEET_ACTIVITY_ACTIONS.ASSIGNMENT_VALIDATE, vehicleToUi(vehicle), { oldValue: { status: "pending" }, newValue: { status: "active" } });
  return { ok: true };
}

export async function submitMileageRecord(auth, caps, body) {
  const access = await requireVehicleAccess(auth, body.vehicleId, { write: true });
  if (!access.ok) throw Object.assign(new Error(access.error), { status: access.status });
  if (!caps.canOperate && !caps.assignedVehicleIds.includes(access.vehicle.id)) {
    throw Object.assign(new Error("Vous ne pouvez déclarer que votre véhicule affecté."), { status: 403 });
  }
  const settings = await loadFleetSettings(access.orgId);
  const flags = mileageFlags(body.km, access.vehicle.currentKm, { jumpThreshold: settings.kmJumpThreshold });
  const status = caps.canValidate && body.autoValidate ? "validated" : "pending";
  const row = await insertMileage(access.orgId, {
    vehicle_id: access.vehicle.id,
    driver_id: auth.user.id,
    reading_date: body.readingDate || todayIsoDate(),
    km: Number(body.km),
    photo_document_id: body.photoDocumentId || null,
    status,
    flag_low: flags.low,
    flag_incoherent: flags.incoherent,
    reviewed_at: status === "validated" ? new Date().toISOString() : null,
    reviewed_by: status === "validated" ? auth.user.id : null,
  });
  if (status === "validated") {
    await applyMileageToVehicle(access.orgId, access.row, row);
  } else {
    await notifyFleetManagers(access.orgId, {
      title: "Relevé kilométrique à valider",
      body: `${access.vehicle.plate} — ${Number(body.km).toLocaleString("fr-FR")} km`,
      uniqueKey: `fleet-km-${row.id}`,
    });
  }
  await logFleet(auth, FLEET_ACTIVITY_ACTIONS.MILEAGE_SUBMIT, access.vehicle, { newValue: { km: body.km, status } });
  return { reading: mileageToUi(row), flags };
}

export async function reviewMileageRecord(auth, caps, id, { action, reason }) {
  if (!caps.canValidate) throw Object.assign(new Error("Seul l’Admin VIP peut valider un relevé."), { status: 403 });
  const orgId = auth.profile.organization_id;
  const readings = await listMileage(orgId);
  const row = readings.find(item => item.id === id);
  if (!row) throw Object.assign(new Error("Relevé introuvable."), { status: 404 });
  const vehicle = await getVehicleRow(orgId, row.vehicle_id);
  if (action === "reject") {
    const updated = await updateMileageRow(orgId, id, {
      status: "rejected",
      rejection_reason: String(reason || "").trim() || "Rejeté",
      reviewed_at: new Date().toISOString(),
      reviewed_by: auth.user.id,
    });
    await logFleet(auth, FLEET_ACTIVITY_ACTIONS.MILEAGE_REJECT, vehicleToUi(vehicle), {
      oldValue: { km: row.km, status: row.status },
      newValue: { status: "rejected", reason },
    });
    return mileageToUi(updated);
  }
  const updated = await updateMileageRow(orgId, id, {
    status: "validated",
    reviewed_at: new Date().toISOString(),
    reviewed_by: auth.user.id,
    rejection_reason: null,
  });
  await applyMileageToVehicle(orgId, vehicle, updated);
  await logFleet(auth, FLEET_ACTIVITY_ACTIONS.MILEAGE_VALIDATE, vehicleToUi(vehicle), {
    oldValue: { current_km: vehicle.current_km, status: row.status },
    newValue: { current_km: updated.km, status: "validated" },
  });
  return mileageToUi(updated);
}

export async function submitExpenseRecord(auth, caps, body) {
  const access = await requireVehicleAccess(auth, body.vehicleId, { write: true });
  if (!access.ok) throw Object.assign(new Error(access.error), { status: access.status });
  if (!body.category) throw new Error("Choisissez une catégorie de dépense.");
  const amount = Number(body.amountTtc);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Indiquez un montant TTC valide.");
  const existing = await listExpenses(access.orgId, { vehicleId: access.vehicle.id });
  const duplicate = findExpenseDuplicate(existing.map(expenseToUi), {
    vehicleId: access.vehicle.id,
    amountTtc: amount,
    occurredOn: body.occurredOn,
    supplier: body.supplier,
  });
  const officialStatus = caps.canOperate && !body.asDriver ? "validated" : "pending";
  const row = await insertExpense(access.orgId, {
    vehicle_id: access.vehicle.id,
    category: body.category,
    other_label: body.otherLabel || "",
    occurred_on: body.occurredOn || todayIsoDate(),
    amount_ttc: amount,
    supplier: body.supplier || "",
    payment_method: body.paymentMethod || "",
    km: body.km == null || body.km === "" ? null : Number(body.km),
    receipt_document_id: body.receiptDocumentId || null,
    status: officialStatus,
    created_by: auth.user.id,
    reviewed_by: officialStatus === "validated" && !caps.isDriver ? auth.user.id : null,
    reviewed_at: officialStatus === "validated" && !caps.isDriver ? new Date().toISOString() : null,
  });
  if (row.status === "pending") {
    await notifyFleetManagers(access.orgId, {
      title: "Dépense à valider",
      body: `${access.vehicle.plate} — ${amount.toLocaleString("fr-FR")} €`,
      uniqueKey: `fleet-expense-${row.id}`,
    });
  }
  await logFleet(auth, FLEET_ACTIVITY_ACTIONS.EXPENSE_CREATE, access.vehicle, { newValue: { amount, status: row.status } });
  return { expense: expenseToUi(row), duplicate: duplicate ? expenseToUi(duplicate) : null };
}

export async function reviewExpenseRecord(auth, caps, id, { action, reason }) {
  if (!caps.canValidate) throw Object.assign(new Error("Seul l’Admin VIP peut valider une dépense."), { status: 403 });
  const orgId = auth.profile.organization_id;
  const expenses = await listExpenses(orgId);
  const row = expenses.find(item => item.id === id);
  if (!row) throw Object.assign(new Error("Dépense introuvable."), { status: 404 });
  const vehicle = await getVehicleRow(orgId, row.vehicle_id);
  const updated = await updateExpenseRow(orgId, id, {
    status: action === "reject" ? "rejected" : "validated",
    rejection_reason: action === "reject" ? (String(reason || "").trim() || "Rejetée") : null,
    reviewed_by: auth.user.id,
    reviewed_at: new Date().toISOString(),
  });
  await logFleet(auth, action === "reject" ? FLEET_ACTIVITY_ACTIONS.EXPENSE_REJECT : FLEET_ACTIVITY_ACTIONS.EXPENSE_VALIDATE, vehicleToUi(vehicle), {
    oldValue: { status: row.status, amount_ttc: row.amount_ttc },
    newValue: { status: updated.status, reason: reason || null },
  });
  return expenseToUi(updated);
}

export async function submitIncidentRecord(auth, caps, body) {
  const access = await requireVehicleAccess(auth, body.vehicleId, { write: true });
  if (!access.ok) throw Object.assign(new Error(access.error), { status: access.status });
  if (!String(body.description || "").trim()) throw new Error("Décrivez l’incident.");
  const row = await insertIncident(access.orgId, {
    vehicle_id: access.vehicle.id,
    reporter_id: auth.user.id,
    occurred_on: body.occurredOn || todayIsoDate(),
    kind: body.kind || "panne",
    description: String(body.description).trim(),
    urgency: body.urgency || "normale",
    owner_id: body.ownerId || null,
    status: "nouveau",
    due_on: body.dueOn || null,
  });
  await insertIncidentEvent(access.orgId, {
    incident_id: row.id,
    author_id: auth.user.id,
    action: "create",
    note: body.description,
    new_value: { kind: row.kind, urgency: row.urgency },
  });
  if (["haute", "critique"].includes(row.urgency) || body.immobilize) {
    await updateVehicleRow(access.orgId, access.vehicle.id, {
      status: "immobilized",
      updated_by: auth.user.id,
    });
  }
  await notifyFleetManagers(access.orgId, {
    title: "Nouvel incident véhicule",
    body: `${access.vehicle.plate} — ${row.kind}`,
    uniqueKey: `fleet-incident-${row.id}`,
  });
  await logFleet(auth, FLEET_ACTIVITY_ACTIONS.INCIDENT_CREATE, access.vehicle, { newValue: { incident_id: row.id, kind: row.kind } });
  return incidentToUi(row);
}

export async function updateIncidentRecord(auth, caps, id, body) {
  if (!caps.canOperate) throw Object.assign(new Error("Action non autorisée."), { status: 403 });
  const orgId = auth.profile.organization_id;
  const incidents = await listIncidents(orgId);
  const row = incidents.find(item => item.id === id);
  if (!row) throw Object.assign(new Error("Incident introuvable."), { status: 404 });
  if (body.status === "cloture") {
    assertIncidentClose({ previousStatus: row.status, nextStatus: body.status, explicit: Boolean(body.explicitClose) });
  }
  const patch = {};
  for (const key of ["kind", "description", "urgency", "owner_id", "status", "due_on"]) {
    const camel = key === "owner_id" ? "ownerId" : key === "due_on" ? "dueOn" : key;
    if (body[camel] !== undefined) patch[key] = body[camel];
    if (body[key] !== undefined) patch[key] = body[key];
  }
  const updated = await updateIncidentRow(orgId, id, patch);
  await insertIncidentEvent(orgId, {
    incident_id: id,
    author_id: auth.user.id,
    action: body.status === "cloture" ? "close" : "update",
    note: body.note || "",
    old_value: { status: row.status, owner_id: row.owner_id, urgency: row.urgency },
    new_value: { status: updated.status, owner_id: updated.owner_id, urgency: updated.urgency },
  });
  const vehicle = await getVehicleRow(orgId, row.vehicle_id);
  await logFleet(auth, body.status === "cloture" ? FLEET_ACTIVITY_ACTIONS.INCIDENT_CLOSE : FLEET_ACTIVITY_ACTIONS.INCIDENT_UPDATE, vehicleToUi(vehicle), {
    oldValue: { status: row.status },
    newValue: { status: updated.status },
  });
  return incidentToUi(updated);
}

export async function patchVehicleRecord(auth, caps, id, body) {
  const access = await requireVehicleAccess(auth, id);
  if (!access.ok) throw Object.assign(new Error(access.error), { status: access.status });
  if (body.status === "archived" && !vehiclePatchHasFields(body)) {
    if (!caps.canArchive) throw Object.assign(new Error("Seul l’Admin VIP peut archiver un véhicule."), { status: 403 });
    const updated = await updateVehicleRow(access.orgId, id, {
      status: "archived",
      archived_at: new Date().toISOString(),
      updated_by: auth.user.id,
    });
    await logFleet(auth, FLEET_ACTIVITY_ACTIONS.VEHICLE_ARCHIVE, access.vehicle, {
      oldValue: { status: access.vehicle.status },
      newValue: { status: "archived" },
    });
    return vehicleToUi(updated);
  }
  if (!caps.canOperate) throw Object.assign(new Error("Action non autorisée."), { status: 403 });
  const patch = sanitizeVehiclePatch(body);
  if (body.plate) {
    const { normalizeVehicleInput } = await import("./fleet.js");
    const existing = await hydrateVehicles(access.orgId, await listVehicles(access.orgId));
    const normalized = normalizeVehicleInput({ ...access.vehicle, ...body, id }, { existing });
    patch.plate = normalized.plate;
    patch.plate_key = normalized.plateKey;
  }
  if (patch.status === "archived") delete patch.status;
  const updated = await updateVehicleRow(access.orgId, id, { ...patch, updated_by: auth.user.id });
  const diff = pickChangedFields(
    { ...access.row },
    updated,
    vehicleTrackedFields()
  );
  await logFleet(auth, patch.status && patch.status !== access.vehicle.status ? FLEET_ACTIVITY_ACTIONS.VEHICLE_STATUS : FLEET_ACTIVITY_ACTIONS.VEHICLE_UPDATE, access.vehicle, {
    oldValue: diff.oldValue,
    newValue: diff.newValue,
  });
  return vehicleToUi(updated);
}

export function dashboardPayload({ vehicles, incidents, expenses, alerts, mileage, assignments, from, to }) {
  const immobilized = vehicles.filter(item => item.status === "immobilized");
  const pendingDeclarations = [
    ...mileage.filter(item => item.status === "pending"),
    ...expenses.filter(item => item.status === "pending"),
    ...assignments.filter(item => item.status === "pending"),
  ];
  const overdue = alerts.filter(item => item.status === "open" && item.dueOn && item.dueOn < todayIsoDate());
  const openIncidents = incidents.filter(item => item.status !== "cloture");
  const totals = expenseTotals(expenses, { from, to, validatedOnly: true });
  const pending = pendingExpenses(expenses);
  const byVehicle = vehicles.map(vehicle => {
    const rows = officialExpenses(expenses).filter(item => item.vehicleId === vehicle.id && (!from && !to || true) && (!from && !to || item.occurredOn >= (from || "0000") && item.occurredOn <= (to || "9999")));
    const vehicleTotals = expenseTotals(rows, { from, to });
    const km = costPerKm({
      total: vehicleTotals.total,
      startKm: mileage.filter(item => item.vehicleId === vehicle.id && item.status === "validated" && (!from || item.readingDate >= from)).at(-1)?.km ?? null,
      endKm: vehicle.currentKm,
      from,
      to,
    });
    return {
      vehicleId: vehicle.id,
      plate: vehicle.plate,
      total: vehicleTotals.total,
      byCategory: vehicleTotals.byCategory,
      immobilized: vehicle.status === "immobilized",
      costPerKm: km,
    };
  });
  return {
    daily: {
      immobilized,
      urgentIncidents: openIncidents.filter(item => ["haute", "critique"].includes(item.urgency) || !item.ownerId),
      pendingDeclarations,
      overdue,
    },
    weekly: {
      maintenance: alerts.filter(item => item.status === "open" && ["deadline_soon", "deadline_overdue", "deadline_km"].includes(item.kind)),
      openIncidents,
      missingMileage: alerts.filter(item => item.kind === "mileage_missing" && item.status === "open"),
      incomplete: alerts.filter(item => ["document_soon", "document_expired"].includes(item.kind) && item.status === "open"),
    },
    monthly: {
      fleetTotal: totals.total,
      pendingTotal: pending.reduce((sum, item) => sum + Number(item.amountTtc || 0), 0),
      byCategory: totals.byCategory,
      byVehicle,
    },
    yearly: {
      fleetTotal: totals.total,
      byVehicle,
      breakdowns: openIncidents.filter(item => item.kind === "panne").length + incidents.filter(item => item.kind === "panne").length,
    },
    totals,
    statuses: DECLARATION_STATUSES,
  };
}

export { vehicleTrackedFields };
