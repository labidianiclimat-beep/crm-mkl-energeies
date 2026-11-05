import { requireApiSession } from "../../../lib/api-auth";
import { requireFleetSession } from "../../../lib/fleet-api";
import { insertComment, loadFleetSettings, saveFleetSettings, updateAlertRow, updateDeadlineRow } from "../../../lib/fleet-store";
import { serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  try {
    const session = await requireFleetSession(auth);
    if (!session.ok) return Response.json({ error: session.error }, { status: session.status });
    if (!session.caps.canViewAll) return Response.json({ error: "Paramètres réservés à la consultation du parc." }, { status: 403 });
    return Response.json({ settings: await loadFleetSettings(session.orgId) });
  } catch (error) {
    return Response.json({ error: error.message || "Paramètres indisponibles." }, { status: 502 });
  }
}

export async function PATCH(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  try {
    const session = await requireFleetSession(auth);
    if (!session.ok) return Response.json({ error: session.error }, { status: session.status });
    const body = await request.json();
    if (body.alertId) {
      if (!session.caps.canOperate) return Response.json({ error: "Action non autorisée." }, { status: 403 });
      const alert = await updateAlertRow(session.orgId, body.alertId, {
        status: body.status || "done",
        owner_id: body.ownerId || auth.user.id,
        treated_at: body.status === "open" ? null : new Date().toISOString(),
        treated_by: body.status === "open" ? null : auth.user.id,
      });
      return Response.json({ alert });
    }
    if (body.deadlineId) {
      if (!session.caps.canOperate) return Response.json({ error: "Action non autorisée." }, { status: 403 });
      const deadline = await updateDeadlineRow(session.orgId, body.deadlineId, {
        status: body.status || "done",
        title: body.title,
        due_on: body.dueOn,
        due_km: body.dueKm,
        notes: body.notes,
      });
      return Response.json({ deadline });
    }
    if (body.comment && body.vehicleId) {
      if (!session.caps.canOperate) return Response.json({ error: "Action non autorisée." }, { status: 403 });
      const comment = await insertComment(session.orgId, {
        vehicle_id: body.vehicleId,
        author_id: auth.user.id,
        body: String(body.comment).trim(),
      });
      return Response.json({ comment });
    }
    if (!session.caps.canValidate) return Response.json({ error: "Seul l’Admin VIP peut modifier les paramètres." }, { status: 403 });
    const settings = await saveFleetSettings(session.orgId, body, auth.user.id);
    return Response.json({ settings });
  } catch (error) {
    return Response.json({ error: error.message || "Mise à jour impossible." }, { status: 400 });
  }
}
