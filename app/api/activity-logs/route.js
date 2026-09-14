import { requireApiSession } from "../../lib/api-auth";
import { isAdminRole } from "../../lib/permissions";
import { serviceRequest, serviceRoleConfigured } from "../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const auth = await requireApiSession(request, { module: "Utilisateurs" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!isAdminRole(auth.profile.role) && auth.profile.role !== "Direction") {
      return Response.json({ error: "Journal réservé à la direction / admin." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 80), 200);
    const moduleFilter = url.searchParams.get("module");
    const actionFilter = url.searchParams.get("action");

    let path =
      `/rest/v1/activity_logs?select=id,user_id,user_name,action,module,entity_type,entity_id,entity_label,old_value,new_value,created_at` +
      `&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}` +
      `&order=created_at.desc&limit=${limit}`;
    if (moduleFilter) path += `&module=eq.${encodeURIComponent(moduleFilter)}`;
    if (actionFilter) path += `&action=eq.${encodeURIComponent(actionFilter)}`;

    const rows = await serviceRequest(path);
    return Response.json({
      logs: (rows || []).map(row => ({
        id: row.id,
        userId: row.user_id,
        userName: row.user_name,
        action: row.action,
        module: row.module,
        entityType: row.entity_type,
        entityId: row.entity_id,
        entityLabel: row.entity_label,
        oldValue: row.old_value,
        newValue: row.new_value,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error("activity logs list error", error.message);
    return Response.json({ error: "Impossible de charger le journal." }, { status: 502 });
  }
}
