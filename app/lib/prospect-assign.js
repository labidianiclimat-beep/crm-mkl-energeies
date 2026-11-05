import { ACTIVITY_ACTIONS } from "./activity-logs.js";
import { allowsStackedAgendaSlots } from "./agenda.js";
import {
  applyGoogleSync,
  assertNoConflict,
  deleteGoogleEvent,
  notifyUser,
  writeAppointmentHistory,
} from "./google-calendar.js";
import { actorFromAuth, logActivity } from "./log-activity.js";
import {
  assignmentHistoryRow,
  canDispatchProspects,
  isAssignedProspect,
  isUnassignedProspect,
  validateReassignReason,
} from "./prospect-dispatch.js";
import {
  APPOINTMENT_SELECT,
  extraOf,
  formToAppointmentRecord,
  formToProspectRecord,
  PROSPECT_SELECT,
  prospectToUi,
  isUuid,
  validateAppointmentPayload,
} from "./prospects.js";
import { serviceRequest } from "./supabase-server.js";
import { notifyProspectOfAppointment } from "./prospect-appointment-mail.js";
import { prospectOwnerPatch } from "./prospect-appointment-owner.js";
import { withAppointmentNames, withProspectNames } from "./profile-names.js";

export async function agendaStackAllowed(auth, commercialId) {
  const holder = String(commercialId || "");
  if (!holder) return false;
  let holderRole = "";
  if (holder === String(auth?.user?.id || "")) {
    holderRole = auth?.profile?.role || "";
  } else if (isUuid(holder)) {
    const rows = await serviceRequest(
      `/rest/v1/profiles?select=role&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}&id=eq.${encodeURIComponent(holder)}&limit=1`
    ).catch(() => []);
    holderRole = rows?.[0]?.role || "";
  }
  return allowsStackedAgendaSlots(auth?.profile, auth?.user?.id, holder, holderRole);
}

export async function claimProspectForAppointment({ orgId, prospectId, commercialId, auth }) {
  if (!isUuid(prospectId) || !isUuid(commercialId)) return null;
  const row = await loadProspectRow(orgId, prospectId);
  if (!row || String(row.organization_id) !== String(orgId)) return null;
  const patch = prospectOwnerPatch(row, commercialId);
  if (!patch) return null;
  const rows = await serviceRequest(
    `/rest/v1/commercial_opportunities?id=eq.${encodeURIComponent(row.id)}&organization_id=eq.${encodeURIComponent(orgId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: patch,
    }
  );
  const updated = rows?.[0] || { ...row, ...patch };
  const [prospect] = await withProspectNames([updated]);
  const previousId = row.commercial_id || "";
  await logActivity({
    ...actorFromAuth(auth),
    action: previousId ? ACTIVITY_ACTIONS.PROSPECT_REASSIGN : ACTIVITY_ACTIONS.PROSPECT_ASSIGN,
    module: "Prospects",
    entityType: "prospect",
    entityId: row.id,
    entityLabel: row.name,
    oldValue: { commercial_id: previousId || null },
    newValue: { commercial_id: commercialId },
  });
  return { prospect, changed: true };
}

export async function loadProspectRow(orgId, id) {
  const rows = await serviceRequest(
    `/rest/v1/commercial_opportunities?select=${PROSPECT_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function loadProspectAppointment(orgId, prospectId) {
  const rows = await serviceRequest(
    `/rest/v1/commercial_appointments?select=${APPOINTMENT_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&opportunity_id=eq.${encodeURIComponent(prospectId)}&order=starts_at.desc&limit=5`
  );
  return (rows || []).find(item => extraOf(item).source !== "google") || rows?.[0] || null;
}

export async function writeAssignmentHistory(row) {
  await serviceRequest("/rest/v1/prospect_assignment_history", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: row,
  }).catch(() => null);
}

export async function assignProspectToCommercial({
  auth,
  prospectRow,
  commercialId,
  start,
  duration = 60,
  kind = "rendez-vous",
  notes = "",
  reason = "",
  notifyEmail = true,
  forceOverlap = false,
  canOverride = false,
}) {
  if (!canDispatchProspects(auth.profile)) {
    const error = new Error("Attribution réservée à la responsable de la prospection.");
    error.status = 403;
    throw error;
  }
  const previousId = prospectRow.commercial_id || "";
  const reassign = Boolean(previousId && String(previousId) !== String(commercialId));
  const reasonError = validateReassignReason(reason, { required: reassign });
  if (reasonError) {
    const error = new Error(reasonError);
    error.status = 400;
    throw error;
  }

  const extra = extraOf(prospectRow);
  const ui = prospectToUi(prospectRow);
  const appointmentStart = start || extra.desiredAt || "";
  const appointmentKind = kind || extra.desiredKind || "rendez-vous";
  const appointmentDuration = Number(duration || extra.desiredDuration || 60) || 60;
  const appointmentDraft = formToAppointmentRecord({
    ...ui,
    prospectId: prospectRow.id,
    prospectName: prospectRow.name,
    start: appointmentStart,
    duration: appointmentDuration,
    kind: appointmentKind,
    commercialId,
    notes: notes || extra.notes || prospectRow.notes,
    phone: prospectRow.phone,
    type: prospectRow.project_type,
    city: prospectRow.city,
    address: extra.address,
    priority: extra.priority,
    status: "Planifié",
  }, {
    organizationId: auth.profile.organization_id,
    createdBy: auth.user.id,
  });
  const appointmentErrors = validateAppointmentPayload(appointmentDraft);
  if (appointmentErrors.length) {
    const error = new Error(appointmentErrors[0]);
    error.status = 400;
    error.errors = appointmentErrors;
    throw error;
  }

  try {
    await assertNoConflict({
      orgId: auth.profile.organization_id,
      record: appointmentDraft,
      force: forceOverlap === true,
      canOverride,
      allowStack: await agendaStackAllowed(auth, commercialId),
      commercialId,
    });
  } catch (conflict) {
    if (conflict.status === 409) throw conflict;
  }

  const prospectRecord = formToProspectRecord({
    ...ui,
    commercialId,
    stage: "Rendez-vous planifié",
    desiredAt: appointmentStart,
    desiredKind: appointmentKind,
    desiredDuration: appointmentDuration,
    dispatchOutcome: "Rendez-vous programmé",
  }, {
    organizationId: prospectRow.organization_id,
    createdBy: prospectRow.created_by,
    defaultCommercialId: commercialId,
  });
  delete prospectRecord.created_by;
  delete prospectRecord.created_at;
  prospectRecord.organization_id = prospectRow.organization_id;
  prospectRecord.commercial_id = commercialId;

  const updatedRows = await serviceRequest(
    `/rest/v1/commercial_opportunities?id=eq.${encodeURIComponent(prospectRow.id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: prospectRecord,
    }
  );
  const updatedProspect = updatedRows?.[0] || prospectRecord;
  const existingAppointment = await loadProspectAppointment(auth.profile.organization_id, prospectRow.id);
  let appointment;
  if (existingAppointment) {
    if (reassign) {
      await deleteGoogleEvent({
        commercialId: previousId,
        googleEventId: extraOf(existingAppointment).googleEventId,
        googleCalendarId: extraOf(existingAppointment).googleCalendarId,
      }).catch(() => null);
    }
    const patched = await serviceRequest(
      `/rest/v1/commercial_appointments?id=eq.${encodeURIComponent(existingAppointment.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: {
          ...appointmentDraft,
          id: existingAppointment.id,
          created_by: existingAppointment.created_by,
        },
      }
    );
    [appointment] = await withAppointmentNames(patched || []);
  } else {
    appointmentDraft.created_at = new Date().toISOString();
    const created = await serviceRequest("/rest/v1/commercial_appointments", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: appointmentDraft,
    });
    [appointment] = await withAppointmentNames(created || []);
  }

  const [prospect] = await withProspectNames([updatedProspect]);
  const action = reassign ? ACTIVITY_ACTIONS.PROSPECT_REASSIGN : ACTIVITY_ACTIONS.PROSPECT_ASSIGN;
  await logActivity({
    ...actorFromAuth(auth),
    action,
    module: "Prospects",
    entityType: "prospect",
    entityId: prospectRow.id,
    entityLabel: prospectRow.name,
    oldValue: { commercial_id: previousId || null },
    newValue: { commercial_id: commercialId, start: appointment?.start, reason: reason || null },
  });
  await writeAppointmentHistory({
    orgId: auth.profile.organization_id,
    appointmentId: appointment?.id,
    auth,
    field: reassign ? "reassign" : "assign",
    oldValue: { commercial_id: previousId || null },
    newValue: { commercial_id: commercialId, start: appointment?.start },
  });
  await writeAssignmentHistory(assignmentHistoryRow({
    organizationId: auth.profile.organization_id,
    prospectId: prospectRow.id,
    appointmentId: appointment?.id,
    previousCommercialId: previousId || null,
    nextCommercialId: commercialId,
    actorId: auth.user.id,
    actorName: auth.profile.full_name || auth.profile.email,
    appointmentAt: appointment?.start,
    reason,
    oldValue: { commercial_id: previousId || null },
    newValue: { commercial_id: commercialId, start: appointment?.start },
  }));

  const body = [
    prospectRow.name,
    prospectRow.phone,
    [extra.address, extra.postalCode, prospectRow.city].filter(Boolean).join(" "),
    prospectRow.project_type,
    appointment?.start ? new Date(appointment.start).toLocaleString("fr-FR") : "",
    extra.notes || prospectRow.notes || "",
  ].filter(Boolean).join(" · ");

  if (appointment?.commercialId) {
    await notifyUser({
      orgId: auth.profile.organization_id,
      userId: appointment.commercialId,
      appointmentId: appointment.id,
      title: `${reassign ? "Rendez-vous réattribué" : "Nouveau prospect attribué"} : ${prospectRow.name}`,
      body,
      uniqueKey: `${reassign ? "reassign" : "assign"}:${appointment.id}:${appointment.commercialId}:${Date.now()}`,
      sendEmail: notifyEmail !== false,
    });
  }
  if (reassign && previousId) {
    await notifyUser({
      orgId: auth.profile.organization_id,
      userId: previousId,
      appointmentId: appointment?.id,
      title: `Rendez-vous retiré : ${prospectRow.name}`,
      body: reason ? `Motif : ${reason}` : "Le rendez-vous a été réattribué.",
      uniqueKey: `unassign:${prospectRow.id}:${previousId}:${Date.now()}`,
      sendEmail: notifyEmail !== false,
    });
  }

  const previousStart = existingAppointment?.starts_at || extraOf(existingAppointment || {}).start || "";
  const startChanged = String(previousStart) !== String(appointment?.start || "");
  if (!reassign || startChanged) {
    await notifyProspectOfAppointment({
      orgId: auth.profile.organization_id,
      prospect,
      appointment,
    });
  }

  const sync = await applyGoogleSync(appointment, { crmUrl: process.env.APP_PUBLIC_URL || "" }).catch(() => null);
  if (sync?.status) appointment.syncStatus = sync.status;
  return { prospect, appointment, reassigned: reassign };
}

export { isUnassignedProspect, isAssignedProspect };
