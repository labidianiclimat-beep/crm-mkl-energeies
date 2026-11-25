import { CRON_UNAUTHORIZED, cronAuthorized } from "../../../lib/cron-auth";
import { syncFleetAlerts } from "../../../lib/fleet-store";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

async function run(request) {
  if (!cronAuthorized(request)) {
    return Response.json(CRON_UNAUTHORIZED, { status: 401 });
  }
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  try {
    const orgs = await serviceRequest("/rest/v1/fleet_vehicles?select=organization_id");
    const ids = [...new Set((orgs || []).map(row => row.organization_id).filter(Boolean))];
    const results = [];
    for (const organizationId of ids) {
      const alerts = await syncFleetAlerts(organizationId);
      results.push({ organizationId, alerts: alerts.length });
    }
    return Response.json({ ok: true, organizations: results.length, results });
  } catch (error) {
    return Response.json({ error: error.message || "Alertes parc indisponibles." }, { status: 502 });
  }
}

export async function GET(request) {
  return run(request);
}

export async function POST(request) {
  return run(request);
}
