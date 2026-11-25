import { requireApiSession } from "../../../lib/api-auth";
import { FLEET_ACTIVITY_ACTIONS } from "../../../lib/fleet";
import { loadFleetOverview, logFleet, requireFleetSession } from "../../../lib/fleet-api";
import { hydrateVehicles, insertVehicle } from "../../../lib/fleet-store";
import { serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  try {
    const session = await requireFleetSession(auth);
    if (!session.ok) return Response.json({ error: session.error }, { status: session.status });
    const data = await loadFleetOverview(session.orgId, session.caps);
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error.message || "Parc indisponible." }, { status: 502 });
  }
}

export async function POST(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  try {
    const session = await requireFleetSession(auth);
    if (!session.ok) return Response.json({ error: session.error }, { status: session.status });
    if (!session.caps.canCreateVehicle) {
      return Response.json({ error: "Seul l’Admin VIP peut créer un véhicule." }, { status: 403 });
    }
    const body = await request.json();
    const row = await insertVehicle(session.orgId, body, auth.user.id);
    const [vehicle] = await hydrateVehicles(session.orgId, [row]);
    await logFleet(auth, FLEET_ACTIVITY_ACTIONS.VEHICLE_CREATE, vehicle, { newValue: { plate: vehicle.plate, internal_code: vehicle.internalCode } });
    return Response.json({ vehicle });
  } catch (error) {
    return Response.json({ error: error.message || "Création impossible." }, { status: error.status || 400 });
  }
}
