import { requireApiSession } from "../../../../lib/api-auth";
import { canOverrideAgendaConflicts, combineDateAndTime } from "../../../../lib/agenda";
import {
  assignProspectToCommercial,
  loadProspectRow,
} from "../../../../lib/prospect-assign";
import { canDispatchProspects, isProspectDispatcher } from "../../../../lib/prospect-dispatch";
import { canAccessScopedRow } from "../../../../lib/scoping";
import { loadTeamMemberIds } from "../../../../lib/team-scope";
import { serviceRoleConfigured } from "../../../../lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Prospects" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canDispatchProspects(auth.profile)) {
      return Response.json({ error: "Attribution non autorisée." }, { status: 403 });
    }
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

    const body = await request.json();
    const start = combineDateAndTime(body.appointmentDate, body.appointmentStart) || body.start || body.appointmentAt || "";
    try {
      const result = await assignProspectToCommercial({
        auth,
        prospectRow,
        commercialId: body.commercialId || body.commercial_id,
        start,
        duration: body.duration,
        kind: body.kind || body.actionKind,
        notes: body.notes || body.appointmentNotes,
        reason: body.reason,
        notifyEmail: body.notifyEmail !== false,
        forceOverlap: body.forceOverlap === true,
        canOverride: canOverrideAgendaConflicts(auth.profile),
      });
      return Response.json(result);
    } catch (error) {
      if (error.status === 409) {
        return Response.json({
          error: error.message,
          overlaps: error.overlaps,
          suggestions: error.suggestions,
        }, { status: 409 });
      }
      return Response.json({ error: error.message || "Attribution impossible." }, { status: error.status || 400 });
    }
  } catch (error) {
    console.error("Prospect assign error", error.message);
    return Response.json({ error: "Attribution impossible." }, { status: 502 });
  }
}
