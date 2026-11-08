import { requireApiSession } from "../../../../lib/api-auth";
import { handoverSheetHtml } from "../../../../lib/fleet-pdf";
import { loadVehicleDetail, patchVehicleRecord, requireFleetSession, requireVehicleAccess } from "../../../../lib/fleet-api";
import { listOrgProfiles } from "../../../../lib/fleet-store";
import { DEFAULT_COMPANY } from "../../../../lib/company";
import { serviceRoleConfigured } from "../../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  try {
    const { id } = await params;
    const access = await requireVehicleAccess(auth, id);
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
    const detail = await loadVehicleDetail(access.orgId, access.vehicle, access.caps);
    const print = new URL(request.url).searchParams.get("handover");
    if (print) {
      const assignment = detail.assignments.find(item => item.id === print);
      const handover = assignment?.handovers?.[0] || {};
      const users = await listOrgProfiles(access.orgId);
      const driver = users.find(item => item.id === assignment?.driverId);
      return Response.json({
        html: handoverSheetHtml({
          company: DEFAULT_COMPANY,
          vehicle: detail.vehicle,
          assignment,
          handover,
          driver: { name: driver?.full_name || assignment?.driverName || assignment?.holderLabel, role: driver?.role },
          actor: { name: auth.profile.full_name },
        }),
      });
    }
    return Response.json(detail);
  } catch (error) {
    return Response.json({ error: error.message || "Fiche indisponible." }, { status: 502 });
  }
}

export async function PATCH(request, { params }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  try {
    const session = await requireFleetSession(auth);
    if (!session.ok) return Response.json({ error: session.error }, { status: session.status });
    const { id } = await params;
    const body = await request.json();
    const vehicle = await patchVehicleRecord(auth, session.caps, id, body);
    return Response.json({ vehicle });
  } catch (error) {
    return Response.json({ error: error.message || "Mise à jour impossible." }, { status: error.status || 400 });
  }
}
