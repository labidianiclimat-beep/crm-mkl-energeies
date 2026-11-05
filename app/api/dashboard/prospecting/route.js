import { requireApiSession } from "../../../lib/api-auth";
import { isConvertedProspect } from "../../../lib/prospect-to-client";
import {
  canDispatchProspects,
  dispatchOutcome,
  isAssignedProspect,
  isProspectDispatcher,
  isUnassignedProspect,
} from "../../../lib/prospect-dispatch";
import { extraOf, PROSPECT_SCOPE_COLUMNS } from "../../../lib/prospects";
import { commercialScopeQuery } from "../../../lib/team-scope";
import { APPOINTMENT_SELECT } from "../../../lib/prospects";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";
import { withAppointmentNames, withProspectNames } from "../../../lib/profile-names";

export const runtime = "nodejs";

function cityOf(item) {
  return String(item.city || extraOf(item).city || "").trim();
}

export async function GET(request) {
  try {
    const auth = await requireApiSession(request, { module: "Tableau de bord" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canDispatchProspects(auth.profile) && !isProspectDispatcher(auth.profile)) {
      return Response.json({ error: "Tableau de suivi réservé à la prospection." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const orgId = auth.profile.organization_id;
    const forDispatch = true;
    const scope = await commercialScopeQuery(auth.profile, auth.user.id, PROSPECT_SCOPE_COLUMNS, { forDispatch });
    const [opportunityRows, appointmentRows] = await Promise.all([
      serviceRequest(
        `/rest/v1/commercial_opportunities?select=id,name,city,stage,source,project_type,commercial_id,extra,created_at,created_by&organization_id=eq.${encodeURIComponent(orgId)}&order=updated_at.desc` + scope
      ).catch(() => []),
      serviceRequest(
        `/rest/v1/commercial_appointments?select=${APPOINTMENT_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&order=starts_at.asc` +
          await commercialScopeQuery(auth.profile, auth.user.id, ["commercial_id", "created_by", "manager_id"], { forDispatch })
      ).catch(() => []),
    ]);
    const prospects = await withProspectNames(opportunityRows || []);
    const appointments = await withAppointmentNames(appointmentRows || []);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const startOfDay = today.getTime();
    const endOfDay = tomorrow.getTime();

    const appointmentByProspect = Object.fromEntries(
      appointments.filter(item => item.prospectId).map(item => [item.prospectId, item])
    );
    const outcomes = {};
    for (const prospect of prospects) {
      const outcome = dispatchOutcome(prospect, appointmentByProspect[prospect.id]);
      outcomes[outcome] = (outcomes[outcome] || 0) + 1;
    }

    const byCommercial = {};
    const byProspector = {};
    const bySource = {};
    const byCity = {};
    const byType = {};
    for (const prospect of prospects) {
      if (isAssignedProspect(prospect)) {
        const owner = prospect.owner || "Non affecté";
        byCommercial[owner] = (byCommercial[owner] || 0) + 1;
      }
      const prospector = prospect.prospector || "Sans prospecteur";
      byProspector[prospector] = (byProspector[prospector] || 0) + 1;
      const source = prospect.source || "Non renseignée";
      bySource[source] = (bySource[source] || 0) + 1;
      const city = cityOf(prospect) || "Non renseignée";
      byCity[city] = (byCity[city] || 0) + 1;
      const type = prospect.type || "Autre";
      byType[type] = (byType[type] || 0) + 1;
    }

    const createdToday = prospects.filter(item => {
      const time = new Date(item.created).getTime();
      return time >= startOfDay && time < endOfDay;
    }).length;
    const assignedToday = appointments.filter(item => {
      const time = new Date(item.created || item.start).getTime();
      return item.commercialId && time >= startOfDay && time < endOfDay && item.source !== "google" && item.kind !== "busy";
    }).length;

    return Response.json({
      metrics: {
        nouveaux: createdToday,
        aDispatcher: prospects.filter(isUnassignedProspect).length,
        attribuesAujourdhui: assignedToday,
        rendezVousProgrammes: outcomes["Rendez-vous programmé"] || 0,
        confirmes: outcomes["Rendez-vous confirmé"] || 0,
        reportes: outcomes["Rendez-vous reporté"] || 0,
        annules: outcomes["Rendez-vous annulé"] || 0,
        aRappeler: outcomes["À rappeler"] || 0,
        realises: outcomes["Rendez-vous réalisé"] || 0,
        transformes: prospects.filter(isConvertedProspect).length,
      },
      byCommercial,
      byProspector,
      bySource,
      byCity,
      byType,
    });
  } catch (error) {
    console.error("Prospecting dashboard error", error.message);
    return Response.json({ error: "Impossible de charger le suivi de prospection." }, { status: 502 });
  }
}
