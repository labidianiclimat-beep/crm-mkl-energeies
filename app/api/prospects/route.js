import { requireApiSession } from "../../lib/api-auth";
import { ACTIVITY_ACTIONS } from "../../lib/activity-logs";
import {
  combineDateAndTime,
  durationFromRange,
  validateNextAction,
  canOverrideAgendaConflicts,
} from "../../lib/agenda";
import {
  applyGoogleSync,
  assertNoConflict,
  logAppointmentActivity,
  notifyUser,
  writeAppointmentHistory,
} from "../../lib/google-calendar";
import { actorFromAuth, logActivity } from "../../lib/log-activity";
import { isFieldProspector, isProspectDispatcher, resolveProspectCommercialId } from "../../lib/prospect-dispatch";
import { agendaStackAllowed } from "../../lib/prospect-assign";
import { visibleProspects } from "../../lib/prospect-to-client";
import {
  MISSING_TABLE_MESSAGE,
  PROSPECT_SELECT,
  formToAppointmentRecord,
  formToProspectRecord,
  isMissingCommercialTable,
  validateAppointmentPayload,
  validateProspectPayload,
} from "../../lib/prospects";
import { resolveProspectorChoice } from "../../lib/prospector-choice";
import { canAccessScopedRow, buildProspectScopeFilter, resolveScopedCommercialIds } from "../../lib/scoping";
import { loadTeamMemberIds } from "../../lib/team-scope";
import { listAllRows } from "../../lib/supabase-list";
import { serviceRequest, serviceRoleConfigured } from "../../lib/supabase-server";
import { notifyProspectOfAppointment } from "../../lib/prospect-appointment-mail";
import { attachProspectRdvStatuses } from "../../lib/prospect-rdv-status-server";
import { attachProspectOrigins } from "../../lib/prospect-origin-server";
import { withAppointmentNames, withProspectNames } from "../../lib/profile-names";

export const runtime = "nodejs";

async function listProspectRows(path) {
  const numbered = path.replace(`select=${PROSPECT_SELECT}`, `select=${PROSPECT_SELECT},prospect_number`);
  try {
    return await listAllRows(numbered);
  } catch (error) {
    if (!/prospect_number/i.test(String(error?.message || ""))) throw error;
    return listAllRows(path);
  }
}

function reminderOffsetsFromBody(body) {
  const selected = [1440, 120, 30].filter(value => body[`reminder_${value}`] === "on" || body[`reminder_${value}`] === true);
  const custom = Number(body.reminderCustom || body.reminder_custom || 0);
  const offsets = selected.length ? selected : (Array.isArray(body.reminderOffsets) ? body.reminderOffsets : [1440, 120, 30]);
  if (custom > 0) offsets.push(custom);
  return [...new Set(offsets.map(Number).filter(n => n >= 0))];
}

export async function GET(request) {
  try {
    const auth = await requireApiSession(request, { module: "Prospects" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const orgId = auth.profile.organization_id;
    const includeConverted = new URL(request.url).searchParams.get("includeConverted") === "1";
    const forDispatch = isProspectDispatcher(auth.profile);
    const fieldCapture = isFieldProspector(auth.profile);
    const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id, { forDispatch });
    const scoped = resolveScopedCommercialIds(auth.profile, auth.user.id, teamIds || [], { forDispatch });
    let path = `/rest/v1/commercial_opportunities?select=${PROSPECT_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&order=updated_at.desc`;
    path += buildProspectScopeFilter(scoped);

    const rows = await listProspectRows(path);
    const named = await withProspectNames(rows || []);
    const visible = visibleProspects(named, { includeConverted: includeConverted || forDispatch || fieldCapture });
    const withStatuses = await attachProspectRdvStatuses(orgId, visible);
    // Après le cloisonnement, jamais avant : les contacts ne sont demandés que
    // pour les fiches que cet utilisateur a le droit de voir.
    const prospects = await attachProspectOrigins(orgId, withStatuses);
    return Response.json({ prospects });
  } catch (error) {
    if (isMissingCommercialTable(error)) {
      return Response.json({ error: MISSING_TABLE_MESSAGE }, { status: 503 });
    }
    console.error("Prospects list error", error.message);
    return Response.json({ error: "Impossible de charger les prospects." }, { status: 502 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireApiSession(request, { module: "Prospects" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const body = await request.json();
    const forDispatch = isProspectDispatcher(auth.profile);
    const fieldCapture = isFieldProspector(auth.profile);
    const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id, { forDispatch });
    const requestedCommercial = resolveProspectCommercialId(
      auth.profile,
      auth.user.id,
      body.commercialId || body.commercial_id,
      { teamIds: teamIds || [] }
    );
    const start = combineDateAndTime(body.appointmentDate, body.appointmentStart) || body.appointmentAt || body.start || "";
    const duration = Number(body.duration) || durationFromRange(start, combineDateAndTime(body.appointmentDate, body.appointmentEnd) || body.end, 60);
    const prospector = resolveProspectorChoice(body);
    const record = formToProspectRecord({
      ...body,
      commercialId: requestedCommercial,
      prospectorId: prospector.prospectorId || (fieldCapture && !prospector.other ? auth.user.id : ""),
      prospector: prospector.prospector,
      desiredAt: start,
      desiredKind: body.kind || body.actionKind,
      desiredDuration: duration,
      stage: fieldCapture ? (body.stage || "Nouveau") : body.stage,
    }, {
      organizationId: auth.profile.organization_id,
      createdBy: auth.user.id,
      defaultCommercialId: requestedCommercial || null,
    });

    if (!canAccessScopedRow(auth.profile, auth.user.id, {
      organization_id: record.organization_id,
      commercial_id: record.commercial_id,
      created_by: auth.user.id,
    }, teamIds || [], { forDispatch })) {
      if (!forDispatch && !fieldCapture) record.commercial_id = auth.user.id;
    }
    if (fieldCapture) record.commercial_id = null;

    const errors = validateProspectPayload(record);
    const actionErrors = validateNextAction({ ...body, start, kind: body.kind || body.actionKind });
    if (errors.length || actionErrors.length) {
      return Response.json({ error: (errors[0] || actionErrors[0]), errors: [...errors, ...actionErrors] }, { status: 400 });
    }

    const appointmentDraft = formToAppointmentRecord({
      ...body,
      start,
      duration,
      commercialId: record.commercial_id,
      commercial: body.commercial,
      prospectName: record.name,
      phone: body.appointmentPhone || body.phone,
      notes: body.appointmentNotes || body.notes,
      reminderOffsets: reminderOffsetsFromBody(body),
    }, {
      organizationId: auth.profile.organization_id,
      createdBy: auth.user.id,
    });
    const appointmentErrors = validateAppointmentPayload(appointmentDraft);
    if (appointmentErrors.length) {
      return Response.json({ error: appointmentErrors[0], errors: appointmentErrors }, { status: 400 });
    }

    try {
      await assertNoConflict({
        orgId: auth.profile.organization_id,
        record: appointmentDraft,
        force: body.forceOverlap === true,
        canOverride: canOverrideAgendaConflicts(auth.profile),
        allowStack: await agendaStackAllowed(auth, appointmentDraft.commercial_id),
        commercialId: appointmentDraft.commercial_id,
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

    record.stage = record.commercial_id ? "Rendez-vous planifié" : "À contacter";
    record.created_at = new Date().toISOString();
    const rows = await serviceRequest("/rest/v1/commercial_opportunities", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: record,
    });
    const created = rows?.[0];
    if (!created?.id) {
      return Response.json({ error: "Création du prospect impossible." }, { status: 502 });
    }

    appointmentDraft.opportunity_id = created.id;
    appointmentDraft.extra = {
      ...appointmentDraft.extra,
      prospectorId: record.extra?.prospectorId || appointmentDraft.extra?.prospectorId || "",
      prospector: record.extra?.prospector || appointmentDraft.extra?.prospector || "",
    };
    appointmentDraft.prospect_name = created.name;
    appointmentDraft.city = created.city;
    appointmentDraft.project_type = created.project_type;
    appointmentDraft.created_at = new Date().toISOString();

    let appointmentRows;
    try {
      appointmentRows = await serviceRequest("/rest/v1/commercial_appointments", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: appointmentDraft,
      });
    } catch (error) {
      await serviceRequest(
        `/rest/v1/commercial_opportunities?id=eq.${encodeURIComponent(created.id)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } }
      ).catch(() => null);
      return Response.json({
        error: "La prochaine action n’a pas pu être enregistrée. Le prospect n’a pas été créé.",
      }, { status: 502 });
    }

    const [appointment] = await withAppointmentNames(appointmentRows || []);
    if (!appointment?.id) {
      await serviceRequest(
        `/rest/v1/commercial_opportunities?id=eq.${encodeURIComponent(created.id)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } }
      ).catch(() => null);
      return Response.json({
        error: "La prochaine action n’a pas pu être enregistrée. Le prospect n’a pas été créé.",
      }, { status: 502 });
    }

    const prospect = (await withProspectNames([created]))[0];
    await logActivity({
      ...actorFromAuth(auth),
      action: ACTIVITY_ACTIONS.PROSPECT_CREATE,
      module: "Prospects",
      entityType: "prospect",
      entityId: created.id,
      entityLabel: created.name,
      newValue: { city: created.city, stage: created.stage, commercial_id: created.commercial_id },
    });
    await logAppointmentActivity(auth, "APPOINTMENT_CREATE", appointment, {
      newValue: { start: appointment.start, status: appointment.status, kind: appointment.kind },
    });
    await writeAppointmentHistory({
      orgId: auth.profile.organization_id,
      appointmentId: appointment.id,
      auth,
      field: "create",
      oldValue: null,
      newValue: { start: appointment.start, kind: appointment.kind, commercialId: appointment.commercialId },
    });

    await notifyProspectOfAppointment({
      orgId: auth.profile.organization_id,
      prospect,
      appointment,
    });
    if (appointment.commercialId && appointment.commercialId !== auth.user.id) {
      await notifyUser({
        orgId: auth.profile.organization_id,
        userId: appointment.commercialId,
        appointmentId: appointment.id,
        title: `Nouveau ${appointment.kind === "rappel" ? "rappel" : "rendez-vous"} : ${appointment.prospectName}`,
        body: `${appointment.prospectName} — ${appointment.start}`,
        uniqueKey: `assign:${appointment.id}:${appointment.commercialId}`,
        email: null,
        sendEmail: appointment.notifyEmail,
      });
    }

    const crmUrl = process.env.APP_PUBLIC_URL || "";
    const sync = await applyGoogleSync(appointment, { crmUrl }).catch(() => ({ status: "En attente" }));
    if (sync?.status) appointment.syncStatus = sync.status;

    return Response.json({ prospect, appointment }, { status: 201 });
  } catch (error) {
    if (isMissingCommercialTable(error)) {
      return Response.json({ error: MISSING_TABLE_MESSAGE }, { status: 503 });
    }
    console.error("Prospect create error", error.message);
    return Response.json({ error: "Création du prospect impossible." }, { status: 502 });
  }
}
