import { requireApiSession } from "../../../lib/api-auth";
import { requireFleetSession, submitIncidentRecord, updateIncidentRecord } from "../../../lib/fleet-api";
import { syncFleetAlerts, upsertOpenDeadline } from "../../../lib/fleet-store";
import { serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  try {
    const session = await requireFleetSession(auth);
    if (!session.ok) return Response.json({ error: session.error }, { status: session.status });
    const body = await request.json();
    if (body.action === "update") {
      const incident = await updateIncidentRecord(auth, session.caps, body.id, body);
      return Response.json({ incident });
    }
    if (body.action === "preventive") {
      if (!session.caps.canOperate) return Response.json({ error: "Action non autorisée." }, { status: 403 });
      const row = await upsertOpenDeadline(session.orgId, {
        vehicleId: body.vehicleId,
        kind: body.kind,
        title: body.title,
        dueOn: body.dueOn,
        dueKm: body.dueKm,
        notes: body.notes,
      });
      await syncFleetAlerts(session.orgId);
      return Response.json({ deadline: row });
    }
    const incident = await submitIncidentRecord(auth, session.caps, body);
    return Response.json({ incident });
  } catch (error) {
    return Response.json({ error: error.message || "Incident impossible." }, { status: error.status || 400 });
  }
}
