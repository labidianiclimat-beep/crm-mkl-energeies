import { requireApiSession } from "../../../../lib/api-auth";
import { canDispatchProspects, isProspectDispatcher } from "../../../../lib/prospect-dispatch";
import { canAccessScopedRow } from "../../../../lib/scoping";
import { loadTeamMemberIds } from "../../../../lib/team-scope";
import { loadProspectRow } from "../../../../lib/prospect-assign";
import { serviceRequest, serviceRoleConfigured } from "../../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Prospects" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const prospectRow = await loadProspectRow(auth.profile.organization_id, id);
    const forDispatch = isProspectDispatcher(auth.profile);
    const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id, { forDispatch });
    if (!prospectRow || !canAccessScopedRow(auth.profile, auth.user.id, prospectRow, teamIds || [], { forDispatch })) {
      return Response.json({ error: "Prospect introuvable." }, { status: 404 });
    }
    if (!canDispatchProspects(auth.profile) && String(prospectRow.commercial_id) !== String(auth.user.id) && String(prospectRow.created_by) !== String(auth.user.id)) {
      return Response.json({ error: "Historique non autorisé." }, { status: 403 });
    }

    const rows = await serviceRequest(
      `/rest/v1/prospect_assignment_history?select=id,prospect_id,appointment_id,previous_commercial_id,next_commercial_id,actor_id,actor_name,appointment_at,reason,old_value,new_value,created_at&prospect_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}&order=created_at.desc`
    ).catch(() => []);
    return Response.json({ history: rows || [] });
  } catch (error) {
    console.error("Prospect assignment history error", error.message);
    return Response.json({ error: "Impossible de charger l’historique." }, { status: 502 });
  }
}
