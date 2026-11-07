import { requireApiSession } from "../../../lib/api-auth";
import { ACTIVITY_ACTIONS } from "../../../lib/activity-logs";
import { actorFromAuth, logActivity } from "../../../lib/log-activity";
import { canApplyRdvStatus, canSignCommercialOrder, isAppointmentOutcomeOnlyPatch, normalizeAgendaStatus, ORDER_SIGN_DENIED, rdvStatusDeniedMessage } from "../../../lib/appointment-status";
import { canEditExistingAppointment, canPerformAction } from "../../../lib/permissions";
import { isProspectDispatcher } from "../../../lib/prospect-dispatch";
import {
  APPOINTMENT_MOVE_ERROR,
  agendaInstant,
  agendaScheduleIsChanging,
  appointmentPhoneError,
  canCorrectAppointmentPhone,
  canOverrideAgendaConflicts,
  canReassignAgendaAppointment,
  canWriteAgendaComment,
  combineDateAndTime,
  durationFromRange,
  isAgendaAssignOrCommentPatch,
  isAgendaPhonePatch,
} from "../../../lib/agenda";
import {
  applyGoogleSync,
  assertNoConflict,
  pullGoogleEvent,
  writeAppointmentHistory,
} from "../../../lib/google-calendar";
import {
  APPOINTMENT_SELECT,
  MISSING_TABLE_MESSAGE,
  appointmentToUi,
  formToAppointmentRecord,
  isMissingCommercialTable,
  isUuid,
  validateAppointmentPayload,
} from "../../../lib/prospects";
import { resolveScopedCommercialIds, visibleAgendaAppointment, visibleAgendaRowForViewer } from "../../../lib/scoping";
import { loadPrivateAgendaOwnerIds, loadTeamMemberIds } from "../../../lib/team-scope";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";
import { withAppointmentNames } from "../../../lib/profile-names";
import { agendaStackAllowed, claimProspectForAppointment } from "../../../lib/prospect-assign";

export const runtime = "nodejs";

async function loadOne(orgId, id) {
  const rows = await serviceRequest(
    `/rest/v1/commercial_appointments?select=${APPOINTMENT_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return rows?.[0] || null;
}

async function canAccess(profile, userId, row) {
  if (row?.organization_id && profile?.organization_id && String(row.organization_id) !== String(profile.organization_id)) {
    return false;
  }
  const forDispatch = isProspectDispatcher(profile);
  const teamIds = await loadTeamMemberIds(profile, userId, { forDispatch });
  const scoped = resolveScopedCommercialIds(profile, userId, teamIds || [], { forDispatch });
  const privateOwners = await loadPrivateAgendaOwnerIds(profile?.organization_id);
  return visibleAgendaRowForViewer(row, scoped, profile, privateOwners);
}

function extraPhone(row) {
  const extra = row?.extra && typeof row.extra === "object" ? row.extra : {};
  return String(extra.phone || extra.telephone || "");
}

function trackedDiff(before, after) {
  const keys = ["status", "starts_at", "duration_minutes", "commercial_id", "notes"];
  const changes = keys
    .filter(key => String(before?.[key] ?? "") !== String(after?.[key] ?? ""))
    .map(key => ({ field: key, oldValue: before?.[key] ?? null, newValue: after?.[key] ?? null }));
  if (extraPhone(before) !== extraPhone(after)) {
    changes.push({ field: "phone", oldValue: extraPhone(before) || null, newValue: extraPhone(after) || null });
  }
  return changes;
}

function historyActionFor(field) {
  if (field === "commercial_id") return "reassign";
  if (field === "phone") return "phone";
  if (field === "duplicate") return "duplicate";
  if (field === "create") return "create";
  return "update";
}

export async function GET(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Agenda commercial" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    const { id } = await params;
    const existing = await loadOne(auth.profile.organization_id, id);
    if (!existing || !(await canAccess(auth.profile, auth.user.id, existing))) {
      return Response.json({ error: "Rendez-vous introuvable." }, { status: 404 });
    }
    const [appointment] = await withAppointmentNames([existing]);
    const pulled = await pullGoogleEvent(appointment).catch(() => null);
    return Response.json({ appointment, google: pulled });
  } catch (error) {
    if (isMissingCommercialTable(error)) {
      return Response.json({ error: MISSING_TABLE_MESSAGE }, { status: 503 });
    }
    return Response.json({ error: "Impossible de charger le rendez-vous." }, { status: 502 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Agenda commercial" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    if (!isUuid(id)) return Response.json({ error: "Identifiant invalide." }, { status: 400 });
    const existing = await loadOne(auth.profile.organization_id, id);
    if (!existing || !(await canAccess(auth.profile, auth.user.id, existing))) {
      return Response.json({ error: "Rendez-vous introuvable." }, { status: 404 });
    }
    const body = await request.json();
    if (agendaScheduleIsChanging(existing, body)) {
      return Response.json({ error: APPOINTMENT_MOVE_ERROR }, { status: 403 });
    }
    const outcomeOnly = isAppointmentOutcomeOnlyPatch(body);
    const current = appointmentToUi(existing);
    if (isAgendaPhonePatch(body)) {
      if (!canCorrectAppointmentPhone(auth.profile, auth.user.id, current) && !canEditExistingAppointment(auth.profile)) {
        return Response.json({ error: "Seul le commercial assigné à ce rendez-vous peut corriger le numéro." }, { status: 403 });
      }
      const phone = String(body.phone ?? body.appointmentPhone ?? "").trim();
      const phoneError = appointmentPhoneError(phone);
      if (phoneError) return Response.json({ error: phoneError }, { status: 400 });
      const extra = {
        ...(existing.extra && typeof existing.extra === "object" ? existing.extra : {}),
        phone,
      };
      const rows = await serviceRequest(
        `/rest/v1/commercial_appointments?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: { extra, updated_at: new Date().toISOString() },
        }
      );
      const [appointment] = await withAppointmentNames(rows || []);
      await writeAppointmentHistory({
        orgId: auth.profile.organization_id,
        appointmentId: id,
        auth,
        field: "phone",
        action: "phone",
        oldValue: extraPhone(existing) || null,
        newValue: phone,
      });
      await logActivity({
        ...actorFromAuth(auth),
        action: ACTIVITY_ACTIONS.APPOINTMENT_UPDATE,
        module: "Agenda commercial",
        entityType: "appointment",
        entityId: id,
        entityLabel: appointment?.prospectName,
        oldValue: { phone: extraPhone(existing) || null },
        newValue: { phone },
      });
      return Response.json({ appointment });
    }
    if (outcomeOnly && !canApplyRdvStatus(auth.profile, auth.user.id, current, body.status)) {
      return Response.json({
        error: rdvStatusDeniedMessage(auth.profile, auth.user.id, current, body.status),
      }, { status: 403 });
    }
    const limited = isAgendaAssignOrCommentPatch(body);
    if (!canEditExistingAppointment(auth.profile) && !outcomeOnly && !limited) {
      return Response.json({
        error: "Un rendez-vous existant ne peut pas être modifié. Dupliquez-le pour en créer un nouveau.",
      }, { status: 403 });
    }
    if (limited && !canEditExistingAppointment(auth.profile)) {
      const nextCommercial = body.commercialId ?? body.commercial_id;
      const changingOwner = nextCommercial != null && String(nextCommercial) !== String(existing.commercial_id || "");
      if (changingOwner && !canReassignAgendaAppointment(auth.profile, existing)) {
        return Response.json({ error: "Vous ne pouvez pas réattribuer ce rendez-vous." }, { status: 403 });
      }
      const touchesNotes = Object.prototype.hasOwnProperty.call(body, "notes");
      if (touchesNotes && !canWriteAgendaComment(auth.profile, auth.user.id, current)) {
        return Response.json({ error: "Vous ne pouvez pas commenter ce rendez-vous." }, { status: 403 });
      }
    }
    if (body.commercialId && String(body.commercialId) !== String(existing.commercial_id)) {
      const forDispatch = isProspectDispatcher(auth.profile);
      const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id, { forDispatch });
      const scoped = resolveScopedCommercialIds(auth.profile, auth.user.id, teamIds || [], { forDispatch });
      if (!canReassignAgendaAppointment(auth.profile, existing) || !visibleAgendaAppointment({ commercialId: body.commercialId }, scoped)) {
        return Response.json({ error: "Ce commercial ne fait pas partie de votre équipe." }, { status: 403 });
      }
    }
    const start = combineDateAndTime(body.appointmentDate, body.appointmentStart) || body.start || body.appointmentAt;
    const end = combineDateAndTime(body.appointmentDate, body.appointmentEnd) || body.end;
    const record = formToAppointmentRecord(
      {
        ...current,
        ...body,
        start: start || current.start,
        duration: body.duration || (end ? durationFromRange(start || current.start, end) : current.duration),
      },
      {
        organizationId: existing.organization_id,
        createdBy: existing.created_by,
      }
    );
    delete record.created_by;
    delete record.created_at;
    record.organization_id = existing.organization_id;
    record.opportunity_id = existing.opportunity_id;

    const sameStart = agendaInstant(record.starts_at) === agendaInstant(existing.starts_at);
    const previousDuration = Number(existing.duration_minutes ?? existing.duration) || 60;
    const nextDuration = Number(record.duration_minutes ?? record.duration) || 60;
    if (!sameStart || previousDuration !== nextDuration) {
      return Response.json({ error: APPOINTMENT_MOVE_ERROR }, { status: 403 });
    }

    const errors = validateAppointmentPayload(record);
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }
    if (
      normalizeAgendaStatus(record.status) === "Commande signée"
      && normalizeAgendaStatus(existing.status) !== "Commande signée"
      && !canSignCommercialOrder(auth.profile)
    ) {
      return Response.json({ error: ORDER_SIGN_DENIED }, { status: 403 });
    }

    try {
      await assertNoConflict({
        orgId: auth.profile.organization_id,
        record,
        excludeId: id,
        force: body.forceOverlap === true,
        canOverride: canOverrideAgendaConflicts(auth.profile),
        allowStack: await agendaStackAllowed(auth, record.commercial_id),
        commercialId: record.commercial_id,
      });
    } catch (conflict) {
      if (conflict.status === 409) {
        return Response.json({
          error: conflict.message,
          overlaps: conflict.overlaps,
          suggestions: conflict.suggestions,
        }, { status: 409 });
      }
    }

    const rows = await serviceRequest(
      `/rest/v1/commercial_appointments?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: record,
      }
    );
    const [appointment] = await withAppointmentNames(rows || [record]);

    for (const change of trackedDiff(existing, record)) {
      await writeAppointmentHistory({
        orgId: auth.profile.organization_id,
        appointmentId: id,
        auth,
        field: change.field,
        action: historyActionFor(change.field),
        oldValue: change.oldValue,
        newValue: change.newValue,
      });
    }

    await logActivity({
      ...actorFromAuth(auth),
      action: ACTIVITY_ACTIONS.APPOINTMENT_UPDATE,
      module: "Agenda commercial",
      entityType: "appointment",
      entityId: id,
      entityLabel: appointment?.prospectName,
      oldValue: { status: existing.status, commercial_id: existing.commercial_id, starts_at: existing.starts_at },
      newValue: { status: appointment?.status, commercial_id: appointment?.commercialId, start: appointment?.start },
    });

    const sync = await applyGoogleSync(appointment, { crmUrl: process.env.APP_PUBLIC_URL || "" }).catch(() => null);
    if (sync?.status) appointment.syncStatus = sync.status;

    const previousCommercial = String(existing.commercial_id || "");
    const nextCommercial = String(appointment?.commercialId || record.commercial_id || "");
    let claimed = null;
    if (nextCommercial && nextCommercial !== previousCommercial && (existing.opportunity_id || appointment?.prospectId)) {
      try {
        claimed = await claimProspectForAppointment({
          orgId: auth.profile.organization_id,
          prospectId: existing.opportunity_id || appointment.prospectId,
          commercialId: nextCommercial,
          auth,
        });
      } catch (error) {
        console.error("Prospect claim failed", error.message);
      }
    }

    return Response.json({ appointment, prospect: claimed?.prospect || null });
  } catch (error) {
    if (isMissingCommercialTable(error)) {
      return Response.json({ error: MISSING_TABLE_MESSAGE }, { status: 503 });
    }
    console.error("Appointment update error", error.message);
    return Response.json({ error: "Mise à jour du rendez-vous impossible." }, { status: 502 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Agenda commercial" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canPerformAction(auth.profile, "delete_appointment")) {
      return Response.json({ error: "Suppression réservée à l’Admin VIP." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const existing = await loadOne(auth.profile.organization_id, id);
    if (!existing) return Response.json({ error: "Rendez-vous introuvable." }, { status: 404 });

    await serviceRequest(
      `/rest/v1/commercial_appointments?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } }
    );

    await logActivity({
      ...actorFromAuth(auth),
      action: ACTIVITY_ACTIONS.APPOINTMENT_DELETE,
      module: "Agenda commercial",
      entityType: "appointment",
      entityId: id,
      entityLabel: existing.prospect_name,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (isMissingCommercialTable(error)) {
      return Response.json({ error: MISSING_TABLE_MESSAGE }, { status: 503 });
    }
    console.error("Appointment delete error", error.message);
    return Response.json({ error: "Suppression du rendez-vous impossible." }, { status: 502 });
  }
}
