import { requireApiSession } from "../../../lib/api-auth";
import { loadDriverHome, requireFleetSession } from "../../../lib/fleet-api";
import { serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  try {
    const session = await requireFleetSession(auth);
    if (!session.ok) return Response.json({ error: session.error }, { status: session.status });
    const data = await loadDriverHome(session.orgId, session.caps, auth.user.id);
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error.message || "Espace conducteur indisponible." }, { status: 502 });
  }
}
