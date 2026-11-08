import { requireApiSession } from "../../../lib/api-auth";
import { ACTIVITY_ACTIONS } from "../../../lib/activity-logs";
import { actorFromAuth, logActivity } from "../../../lib/log-activity";
import { canPerformAction } from "../../../lib/permissions";
import { canReviseProspect, isFieldProspector, isProspectDispatcher, resolveProspectCommercialId } from "../../../lib/prospect-dispatch";
import { canOverrideAgendaConflicts, combineDateAndTime } from "../../../lib/agenda";
import { agendaStackAllowed } from "../../../lib/prospect-assign";
import { applyGoogleSync, assertNoConflict } from "../../../lib/google-calendar";
import {
  APPOINTMENT_SELECT,
  MISSING_TABLE_MESSAGE,
  PROSPECT_SELECT,
  appointmentToUi,
  extraOf,
  formToAppointmentRecord,
  formToProspectRecord,
  isMissingCommercialTable,
  prospectToUi,
  validateAppointmentPayload,
  validateProspectPayload,
} from "../../../lib/prospects";
import { canAccessScopedRow, canSeeAssignedProspect } from "../../../lib/scoping";
import { loadTeamMemberIds } from "../../../lib/team-scope";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";
import { attachProspectRdvStatuses } from "../../../lib/prospect-rdv-status-server";
import { withAppointmentNames, withProspectNames } from "../../../lib/profile-names";

export const runtime = "nodejs";

async function loadOne(orgId, id) {
  const path = `/rest/v1/commercial_opportunities?select=${PROSPECT_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&id=eq.${encodeURIComponent(id)}&limit=1`;
  try {
    const rows = await serviceRequest(path.replace(`select=${PROSPECT_SELECT}`, `select=${PROSPECT_SELECT},prospect_number`));
    return rows?.[0] || null;
  } catch (error) {
    if (!/prospect_number/i.test(String(error?.message || ""))) throw error;
    const rows = await serviceRequest(path);
    return rows?.[0] || null;
  }
}

async function canAccess(profile, userId, row) {
  const forDispatch = isProspectDispatcher(profile);
  const teamIds = await loadTeamMemberIds(profile, userId, { forDispatch });
  return canSeeAssignedProspect(profile, userId, row, teamIds || [], { forDispatch });
}

export async function GET(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Prospects" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }
    const { id } = await params;
    const row = await loadOne(auth.profile.organization_id, id);
    if (!row || !(await canAccess(auth.profile, auth.user.id, row))) {
      return Response.json({ error: "Prospect introuvable." }, { status: 404 });
    }
    const [named] = await withProspectNames([row]);
    const [prospect] = await attachProspectRdvStatuses(auth.profile.organization_id, [named]);
    return Response.json({ prospect });
  } catch (error) {
    if (isMissingCommercialTable(error)) {
      return Response.json({ error: MISSING_TABLE_MESSAGE }, { status: 503 });
    }
    console.error("Prospect get error", error.message);
    return Response.json({ error: "Impossible de charger le prospect." }, { status: 502 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Prospects" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const existing = await loadOne(auth.profile.organization_id, id);
    if (!existing || !(await canAccess(auth.profile, auth.user.id, existing))) {
      return Response.json({ error: "Prospect introuvable." }, { status: 404 });
    }
    if (!canReviseProspect(auth.profile, { created: existing.created_at })) {
      const message = isFieldProspector(auth.profile)
        ? "Les 30 minutes pour modifier cette fiche sont passées."
        : "Seuls l’Admin VIP, le Superadmin et la responsable prospection peuvent modifier une fiche enregistrée.";
      return Response.json({ error: message }, { status: 403 });
    }

    const body = await request.json();
    const forDispatch = isProspectDispatcher(auth.profile);
    const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id, { forDispatch });
    const nextCommercialId = resolveProspectCommercialId(
      auth.profile,
      auth.user.id,
      body.commercialId || body.commercial_id,
      { teamIds: teamIds || [], existingId: existing.commercial_id }
    );
    const record = formToProspectRecord(
      { ...prospectToUi(existing), ...body, commercialId: nextCommercialId },
      {
        organizationId: existing.organization_id,
        createdBy: existing.created_by,
        defaultCommercialId: nextCommercialId || existing.commercial_id,
      }
    );
    delete record.created_by;
    delete record.created_at;
    record.organization_id = existing.organization_id;
    record.commercial_id = isFieldProspector(auth.profile)
      ? (existing.commercial_id || null)
      : (nextCommercialId || null);
    const nextKind = body.kind || body.actionKind;
    if (nextKind) {
      record.extra = {
        ...record.extra,
        desiredKind: nextKind,
        desiredAt: combineDateAndTime(body.appointmentDate, body.appointmentStart) || body.appointmentAt || record.extra?.desiredAt || "",
        desiredDuration: Number(body.duration || record.extra?.desiredDuration || 60) || 60,
      };
    }

    if (!isFieldProspector(auth.profile) && !canAccessScopedRow(auth.profile, auth.user.id, {
      organization_id: record.organization_id,
      commercial_id: record.commercial_id,
      created_by: existing.created_by,
    }, teamIds || [], { forDispatch })) {
      record.commercial_id = existing.commercial_id || auth.user.id;
    }

    const errors = validateProspectPayload(record);
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    const nextStart = combineDateAndTime(body.appointmentDate, body.appointmentStart) || body.appointmentAt || "";
    let appointmentDraft = null;
    let existingAppointment = null;
    if (nextKind && nextStart) {
      const found = await serviceRequest(
        `/rest/v1/commercial_appointments?select=${APPOINTMENT_SELECT}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}&opportunity_id=eq.${encodeURIComponent(id)}&order=starts_at.desc&limit=1`
      );
      existingAppointment = found?.[0] || null;
      const current = existingAppointment ? appointmentToUi(existingAppointment) : {};
      const kept = prospectToUi(existing);
      appointmentDraft = formToAppointmentRecord({
        ...current,
        ...body,
        start: nextStart,
        kind: nextKind,
        actionKind: nextKind,
        prospectId: id,
        prospectName: record.name,
        city: record.city,
        type: record.project_type,
        commercialId: record.commercial_id || current.commercialId || "",
        notes: body.appointmentNotes || current.notes || "",
        phone: body.appointmentPhone || body.phone || current.phone || "",
        status: current.status || "",
        reminderOffsets: [1440, 120, 30].filter(value => body[`reminder_${value}`] === "on" || body[`reminder_${value}`] === true),
      }, {
        organizationId: auth.profile.organization_id,
        createdBy: existingAppointment?.created_by || auth.user.id,
      });
      const previousExtra = existingAppointment ? extraOf(existingAppointment) : {};
      appointmentDraft.extra = {
        ...appointmentDraft.extra,
        googleEventId: appointmentDraft.extra.googleEventId || previousExtra.googleEventId || "",
        googleCalendarId: previousExtra.googleCalendarId || appointmentDraft.extra.googleCalendarId || "primary",
        syncStatus: previousExtra.syncStatus || appointmentDraft.extra.syncStatus || "none",
        lastSyncedAt: previousExtra.lastSyncedAt || "",
        notifiedAt: previousExtra.notifiedAt || appointmentDraft.extra.notifiedAt || {},
        prospectorId: kept.prospectorId || previousExtra.prospectorId || "",
        prospector: kept.prospector || previousExtra.prospector || "",
      };
      const appointmentErrors = validateAppointmentPayload(appointmentDraft);
      if (appointmentErrors.length) {
        return Response.json({ error: appointmentErrors[0], errors: appointmentErrors }, { status: 400 });
      }
      try {
        await assertNoConflict({
          orgId: auth.profile.organization_id,
          record: appointmentDraft,
          excludeId: existingAppointment?.id,
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
    }

    const rows = await serviceRequest(
      `/rest/v1/commercial_opportunities?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: record,
      }
    );
    const updated = rows?.[0] || record;

    if (
      updated.name !== existing.name ||
      updated.city !== existing.city ||
      updated.project_type !== existing.project_type
    ) {
      await serviceRequest(
        `/rest/v1/commercial_appointments?opportunity_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: {
            prospect_name: updated.name,
            city: updated.city,
            project_type: updated.project_type,
            updated_at: new Date().toISOString(),
          },
        }
      ).catch(() => {});
    }

    await logActivity({
      ...actorFromAuth(auth),
      action: ACTIVITY_ACTIONS.PROSPECT_UPDATE,
      module: "Prospects",
      entityType: "prospect",
      entityId: id,
      entityLabel: updated.name,
      oldValue: { stage: existing.stage, city: existing.city },
      newValue: { stage: updated.stage, city: updated.city },
    });

    let appointment = null;
    if (appointmentDraft) {
      appointmentDraft.opportunity_id = id;
      appointmentDraft.prospect_name = updated.name || appointmentDraft.prospect_name;
      appointmentDraft.city = updated.city || appointmentDraft.city;
      appointmentDraft.project_type = updated.project_type || appointmentDraft.project_type;
      const saved = existingAppointment?.id
        ? await serviceRequest(
          `/rest/v1/commercial_appointments?id=eq.${encodeURIComponent(existingAppointment.id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: (() => {
              const patch = { ...appointmentDraft };
              delete patch.created_by;
              delete patch.organization_id;
              return patch;
            })(),
          }
        )
        : await serviceRequest("/rest/v1/commercial_appointments", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: { ...appointmentDraft, created_at: new Date().toISOString() },
        });
      appointment = (await withAppointmentNames(saved || []))[0] || null;
      if (appointment) {
        const crmUrl = process.env.APP_PUBLIC_URL || "";
        const sync = await applyGoogleSync(appointment, { crmUrl }).catch(() => null);
        if (sync?.status) appointment.syncStatus = sync.status;
      }
    }

    const [named] = await withProspectNames([updated]);
    const [prospect] = await attachProspectRdvStatuses(auth.profile.organization_id, [named]);
    return Response.json({ prospect, appointment });
  } catch (error) {
    if (isMissingCommercialTable(error)) {
      return Response.json({ error: MISSING_TABLE_MESSAGE }, { status: 503 });
    }
    console.error("Prospect update error", error.message);
    return Response.json({ error: "Mise à jour du prospect impossible." }, { status: 502 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Prospects" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canPerformAction(auth.profile, "delete_prospects")) {
      return Response.json({ error: "Suppression réservée aux administrateurs et à la responsable prospection." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const existing = await loadOne(auth.profile.organization_id, id);
    if (!existing) return Response.json({ error: "Prospect introuvable." }, { status: 404 });

    await serviceRequest(
      `/rest/v1/commercial_appointments?opportunity_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } }
    ).catch(() => {});
    await serviceRequest(
      `/rest/v1/commercial_opportunities?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } }
    );

    await logActivity({
      ...actorFromAuth(auth),
      action: ACTIVITY_ACTIONS.PROSPECT_DELETE,
      module: "Prospects",
      entityType: "prospect",
      entityId: id,
      entityLabel: existing.name,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (isMissingCommercialTable(error)) {
      return Response.json({ error: MISSING_TABLE_MESSAGE }, { status: 503 });
    }
    console.error("Prospect delete error", error.message);
    return Response.json({ error: "Suppression du prospect impossible." }, { status: 502 });
  }
}
