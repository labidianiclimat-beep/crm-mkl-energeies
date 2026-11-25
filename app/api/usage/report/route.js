import { requireApiSession } from "../../../lib/api-auth";
import { isAdminVip } from "../../../lib/permissions";
import { buildUsageReport, clampUsageRange, parisDayEndUtc, parisDayStartUtc } from "../../../lib/usage";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!isAdminVip(auth.profile.role)) {
      return Response.json({ error: "Journal réservé à l’Admin VIP." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const url = new URL(request.url);
    const range = clampUsageRange(url.searchParams.get("from"), url.searchParams.get("to"));
    const orgId = auth.profile.organization_id;
    const fromIso = parisDayStartUtc(range.fromDay).toISOString();
    const toIso = parisDayEndUtc(range.toDay).toISOString();

    const [profiles, sessions, logs] = await Promise.all([
      serviceRequest(
        `/rest/v1/profiles?select=id,full_name,email,role,active` +
          `&organization_id=eq.${encodeURIComponent(orgId)}` +
          `&order=full_name.asc`
      ),
      serviceRequest(
        `/rest/v1/usage_sessions?select=id,user_id,user_name,day,started_at,last_seen_at,last_module,modules` +
          `&organization_id=eq.${encodeURIComponent(orgId)}` +
          `&day=gte.${encodeURIComponent(range.fromDay)}` +
          `&day=lte.${encodeURIComponent(range.toDay)}` +
          `&order=last_seen_at.desc`
      ),
      serviceRequest(
        `/rest/v1/activity_logs?select=id,user_id,user_name,action,module,entity_type,entity_id,entity_label,created_at` +
          `&organization_id=eq.${encodeURIComponent(orgId)}` +
          `&created_at=gte.${encodeURIComponent(fromIso)}` +
          `&created_at=lte.${encodeURIComponent(toIso)}` +
          `&order=created_at.desc&limit=2000`
      ),
    ]);

    return Response.json(buildUsageReport({
      profiles: profiles || [],
      sessions: sessions || [],
      logs: logs || [],
      fromDay: range.fromDay,
      toDay: range.toDay,
    }));
  } catch (error) {
    const missing = /usage_sessions|PGRST205|Could not find the table/i.test(error?.message || "");
    console.error("usage report error", error.message);
    return Response.json(
      {
        error: missing
          ? "Table usage_sessions manquante. Appliquez la migration 20260924_usage_sessions.sql dans Supabase."
          : "Impossible de charger le temps passé.",
      },
      { status: missing ? 501 : 502 }
    );
  }
}
