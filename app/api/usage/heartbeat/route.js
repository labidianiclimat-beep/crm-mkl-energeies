import { requireApiSession } from "../../../lib/api-auth";
import { applyHeartbeat } from "../../../lib/usage";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

const SELECT = "id,day,started_at,last_seen_at,last_module,modules,user_name";

export async function POST(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const orgId = auth.profile.organization_id;
    const userId = auth.user?.id || auth.profile.id;
    const userName = auth.profile.full_name || auth.profile.email || null;

    const existingRows = await serviceRequest(
      `/rest/v1/usage_sessions?select=${SELECT}` +
        `&organization_id=eq.${encodeURIComponent(orgId)}` +
        `&user_id=eq.${encodeURIComponent(userId)}` +
        `&order=last_seen_at.desc&limit=1`
    );
    const next = applyHeartbeat({
      existing: existingRows?.[0] || null,
      module: body.module,
      userId,
      userName,
      organizationId: orgId,
    });

    if (next.type === "update") {
      await serviceRequest(`/rest/v1/usage_sessions?id=eq.${encodeURIComponent(next.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: next.patch,
      });
      return Response.json({ ok: true, continued: true });
    }

    await serviceRequest("/rest/v1/usage_sessions", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: next.row,
    });
    return Response.json({ ok: true, continued: false });
  } catch (error) {
    const missing = /usage_sessions|PGRST205|Could not find the table/i.test(error?.message || "");
    console.error("usage heartbeat error", error.message);
    return Response.json(
      { error: missing ? "Table usage_sessions manquante." : "Présence non enregistrée." },
      { status: missing ? 501 : 502 }
    );
  }
}
