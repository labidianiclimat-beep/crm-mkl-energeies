import { requireApiSession } from "../../../lib/api-auth";
import { loadBusyGoogleSlots } from "../../../lib/google-calendar";
import { APPOINTMENT_SELECT } from "../../../lib/prospects";
import { loadProspectRow } from "../../../lib/prospect-assign";
import {
  canDispatchProspects,
  isDispatchCommercialRole,
  isProspectDispatcher,
  rankDispatchCommercials,
} from "../../../lib/prospect-dispatch";
import { normalizeRoleLabel } from "../../../lib/roles";
import { canAccessScopedRow } from "../../../lib/scoping";
import { loadTeamMemberIds } from "../../../lib/team-scope";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";
import { withAppointmentNames } from "../../../lib/profile-names";

export const runtime = "nodejs";

function mapCommercial(row) {
  return {
    id: row.id,
    name: row.full_name || row.email,
    role: normalizeRoleLabel(row.role),
    zone: row.zone || "",
    specialties: row.specialties || [],
    postalCode: row.postal_code || "",
    city: row.city || "",
    dispatchAvailable: row.dispatch_available !== false,
  };
}

export async function GET(request) {
  try {
    const auth = await requireApiSession(request, { module: "Prospects" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canDispatchProspects(auth.profile)) {
      return Response.json({ error: "Consultation non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const orgId = auth.profile.organization_id;
    const url = new URL(request.url);
    const prospectId = url.searchParams.get("prospectId") || "";
    const desiredAt = url.searchParams.get("desiredAt") || "";
    const duration = Number(url.searchParams.get("duration") || 60) || 60;
    const rows = await serviceRequest(
      `/rest/v1/profiles?select=id,full_name,email,role,zone,specialties,postal_code,city,dispatch_available,active&organization_id=eq.${encodeURIComponent(orgId)}&or=(active.eq.true,active.is.null)&order=full_name.asc`
    );
    const commercials = (rows || []).filter(row => isDispatchCommercialRole(row.role)).map(mapCommercial);
    const appointmentRows = await serviceRequest(
      `/rest/v1/commercial_appointments?select=${APPOINTMENT_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&order=starts_at.asc`
    ).catch(() => []);
    let appointments = await withAppointmentNames(appointmentRows || []);
    const busyLists = await Promise.all(commercials.map(item => (
      loadBusyGoogleSlots(
        item.id,
        new Date(Date.now() - 86400000).toISOString(),
        new Date(Date.now() + 14 * 86400000).toISOString()
      ).catch(() => [])
    )));
    appointments = [...appointments, ...busyLists.flat()];

    let prospect = null;
    if (prospectId) {
      const prospectRow = await loadProspectRow(orgId, prospectId);
      const forDispatch = isProspectDispatcher(auth.profile);
      const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id, { forDispatch });
      if (prospectRow && canAccessScopedRow(auth.profile, auth.user.id, prospectRow, teamIds || [], { forDispatch })) {
        prospect = prospectRow;
      }
    }

    const ranked = rankDispatchCommercials({
      commercials,
      appointments,
      prospect: prospect || {},
      desiredAt: desiredAt || "",
      duration,
    });
    return Response.json({ commercials: ranked });
  } catch (error) {
    console.error("Dispatch commercials error", error.message);
    return Response.json({ error: "Impossible de charger les commerciaux." }, { status: 502 });
  }
}
