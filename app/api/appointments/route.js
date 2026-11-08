import { requireApiSession } from "../../lib/api-auth";
import {
  canAssignAgendaCommercial,
  agendaKindLabel,
  canOverrideAgendaConflicts,
  combineDateAndTime,
  durationFromRange,
  resolveAssignedCommercialId,
} from "../../lib/agenda";
import {
  applyGoogleSync,
  assertNoConflict,
  logAppointmentActivity,
  notifyUser,
  writeAppointmentHistory,
} from "../../lib/google-calendar";
import { commercialScopeQuery, loadPrivateAgendaOwnerIds, loadTeamMemberIds } from "../../lib/team-scope";
import { isProspectDispatcher } from "../../lib/prospect-dispatch";
import { resolveScopedCommercialIds, visibleAgendaAppointment, visibleAgendaRowForViewer } from "../../lib/scoping";
import { canSignCommercialOrder, normalizeAgendaStatus, ORDER_SIGN_DENIED } from "../../lib/appointment-status";
import { notifyProspectOfAppointment } from "../../lib/prospect-appointment-mail";
import { agendaStackAllowed, claimProspectForAppointment } from "../../lib/prospect-assign";
import {
  APPOINTMENT_SELECT,
  MISSING_TABLE_MESSAGE,
  formToAppointmentRecord,
  isMissingCommercialTable,
  isUuid,
  prospectToUi,
  validateAppointmentPayload,
} from "../../lib/prospects";
import { listAllRows } from "../../lib/supabase-list";
import { serviceRequest, serviceRoleConfigured } from "../../lib/supabase-server";
import { withAppointmentNames } from "../../lib/profile-names";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const auth = await requireApiSession(request, { module: "Agenda commercial" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const orgId = auth.profile.organization_id;
    const url = new URL(request.url);
    const commercialId = url.searchParams.get("commercialId") || "";
    const kind = url.searchParams.get("kind") || "";
    const forDispatch = isProspectDispatcher(auth.profile);
    const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id, { forDispatch });
    const scoped = resolveScopedCommercialIds(auth.profile, auth.user.id, teamIds || [], { forDispatch });
    let path = `/rest/v1/commercial_appointments?select=${APPOINTMENT_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&order=starts_at.asc`;
    path += await commercialScopeQuery(auth.profile, auth.user.id, ["commercial_id", "created_by"], { forDispatch });
    if (commercialId) {
      if (scoped && !scoped.map(String).includes(String(commercialId))) {
        return Response.json({ error: "Ce commercial ne fait pas partie de votre équipe." }, { status: 403 });
      }
      path += `&commercial_id=eq.${encodeURIComponent(commercialId)}`;
    }

    const rows = await listAllRows(path);
    const privateOwners = await loadPrivateAgendaOwnerIds(orgId);
    const visibleRows = (rows || []).filter(row => visibleAgendaRowForViewer(row, scoped, auth.profile, privateOwners));
    let appointments = await withAppointmentNames(visibleRows);
    if (kind) appointments = appointments.filter(item => item.kind === kind);
    return Response.json({ appointments });
  } catch (error) {
    if (isMissingCommercialTable(error)) {
      return Response.json({ error: MISSING_TABLE_MESSAGE }, { status: 503 });
    }
    console.error("Appointments list error", error.message);
    return Response.json({ error: "Impossible de charger l’agenda." }, { status: 502 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireApiSession(request, { module: "Agenda commercial" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const body = await request.json();
    const start = combineDateAndTime(body.appointmentDate, body.appointmentStart) || body.start || body.appointmentAt || "";
    const end = combineDateAndTime(body.appointmentDate, body.appointmentEnd) || body.end || "";
    const commercialId = resolveAssignedCommercialId(auth.profile, auth.user.id, body.commercialId);
    const forDispatch = isProspectDispatcher(auth.profile);
    const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id, { forDispatch });
    const scoped = resolveScopedCommercialIds(auth.profile, auth.user.id, teamIds || [], { forDispatch });
    if (commercialId && !visibleAgendaAppointment({ commercialId }, scoped)) {
      return Response.json({ error: "Ce commercial ne fait pas partie de votre équipe." }, { status: 403 });
    }
    if (!canAssignAgendaCommercial(auth.profile) && body.commercialId && String(body.commercialId) !== auth.user.id) {
      return Response.json({ error: "Vous ne pouvez pas attribuer cet événement à un autre commercial." }, { status: 403 });
    }

    const record = formToAppointmentRecord({
      ...body,
      start,
      duration: body.duration || durationFromRange(start, end, 60),
      commercialId,
    }, {
      organizationId: auth.profile.organization_id,
      createdBy: auth.user.id,
    });

    let linkedProspect = null;
    if (record.opportunity_id) {
      const prospects = await serviceRequest(
        `/rest/v1/commercial_opportunities?select=id,name,city,project_type,phone,email,extra,organization_id&id=eq.${encodeURIComponent(record.opportunity_id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}&limit=1`
      );
      linkedProspect = prospects?.[0] || null;
      if (!linkedProspect) {
        return Response.json({ error: "Prospect introuvable." }, { status: 404 });
      }
      record.prospect_name = record.prospect_name || linkedProspect.name;
      record.city = record.city || linkedProspect.city;
      record.project_type = record.project_type || linkedProspect.project_type;
      if (!record.extra.phone) record.extra.phone = linkedProspect.phone || "";
    }

    const sourceId = String(body.duplicatedFromId || body.duplicateOf || "").trim();
    let sourceAppointment = null;
    if (sourceId) {
      if (!isUuid(sourceId)) {
        return Response.json({ error: "Le rendez-vous d’origine est invalide." }, { status: 400 });
      }
      const sources = await serviceRequest(
        `/rest/v1/commercial_appointments?select=${APPOINTMENT_SELECT}&id=eq.${encodeURIComponent(sourceId)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}&limit=1`
      );
      sourceAppointment = sources?.[0] || null;
      const privateOwners = await loadPrivateAgendaOwnerIds(auth.profile.organization_id);
      if (!sourceAppointment || !visibleAgendaRowForViewer(sourceAppointment, scoped, auth.profile, privateOwners)) {
        return Response.json({ error: "Le rendez-vous d’origine est introuvable." }, { status: 404 });
      }
      record.extra = {
        ...(record.extra || {}),
        googleEventId: "",
        syncStatus: "none",
        syncError: "",
        lastSyncedAt: "",
        notifiedAt: {},
        duplicatedFromId: sourceId,
      };
    }

    const errors = validateAppointmentPayload(record);
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }
    if (normalizeAgendaStatus(record.status) === "Commande signée" && !canSignCommercialOrder(auth.profile)) {
      return Response.json({ error: ORDER_SIGN_DENIED }, { status: 403 });
    }

    try {
      await assertNoConflict({
        orgId: auth.profile.organization_id,
        record,
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

    record.created_at = new Date().toISOString();
    const rows = await serviceRequest("/rest/v1/commercial_appointments", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: record,
    });
    const [appointment] = await withAppointmentNames(rows || []);
    let claimed = null;
    if (appointment?.prospectId && appointment.commercialId) {
      try {
        claimed = await claimProspectForAppointment({
          orgId: auth.profile.organization_id,
          prospectId: appointment.prospectId,
          commercialId: appointment.commercialId,
          auth,
        });
      } catch (error) {
        console.error("Prospect claim failed", error.message);
      }
    }

    await logAppointmentActivity(auth, "APPOINTMENT_CREATE", appointment, {
      newValue: { start: appointment?.start, status: appointment?.status, kind: appointment?.kind },
    });
    await writeAppointmentHistory({
      orgId: auth.profile.organization_id,
      appointmentId: appointment?.id,
      auth,
      field: sourceAppointment ? "duplicate" : "create",
      action: sourceAppointment ? "duplicate" : "create",
      oldValue: null,
      newValue: sourceAppointment
        ? { sourceAppointmentId: sourceAppointment.id }
        : { start: appointment?.start, kind: appointment?.kind },
    });
    if (sourceAppointment) {
      await writeAppointmentHistory({
        orgId: auth.profile.organization_id,
        appointmentId: sourceAppointment.id,
        auth,
        field: "duplicate",
        action: "duplicate",
        oldValue: null,
        newValue: { appointmentId: appointment?.id },
      });
    }
    if (linkedProspect) {
      await notifyProspectOfAppointment({
        orgId: auth.profile.organization_id,
        prospect: prospectToUi(linkedProspect),
        appointment,
      });
    }
    if (appointment?.commercialId && appointment.commercialId !== auth.user.id) {
      await notifyUser({
        orgId: auth.profile.organization_id,
        userId: appointment.commercialId,
        appointmentId: appointment.id,
        title: `Événement attribué : ${appointment.prospectName}`,
        body: `${agendaKindLabel(appointment.kind)} le ${appointment.start}`,
        uniqueKey: `assign:${appointment.id}:${appointment.commercialId}`,
        sendEmail: appointment.notifyEmail,
      });
    }
    const sync = await applyGoogleSync(appointment, { crmUrl: process.env.APP_PUBLIC_URL || "" }).catch(() => null);
    if (sync?.status) appointment.syncStatus = sync.status;

    return Response.json({ appointment, prospect: claimed?.prospect || null }, { status: 201 });
  } catch (error) {
    if (isMissingCommercialTable(error)) {
      return Response.json({ error: MISSING_TABLE_MESSAGE }, { status: 503 });
    }
    console.error("Appointment create error", error.message);
    return Response.json({ error: "Création du rendez-vous impossible." }, { status: 502 });
  }
}
