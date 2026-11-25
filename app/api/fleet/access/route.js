import { requireApiSession } from "../../../lib/api-auth";
import { requireFleetSession } from "../../../lib/fleet-api";
import { loadFleetSettings } from "../../../lib/fleet-store";
import { serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  try {
    const session = await requireFleetSession(auth);
    if (!session.ok) {
      return Response.json({ canEnter: false, isDriver: false, caps: { canEnter: false } });
    }
    const settings = session.caps.canViewAll ? await loadFleetSettings(session.orgId) : null;
    return Response.json({
      canEnter: true,
      isDriver: session.caps.isDriver,
      assignedVehicleId: session.caps.assignedVehicleId,
      caps: session.caps,
      settings,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Parc indisponible." }, { status: 502 });
  }
}
