import { requireApiSession } from "../../../lib/api-auth";
import { dashboardPayload, requireFleetSession } from "../../../lib/fleet-api";
import {
  assignmentToUi,
  alertToUi,
  expenseToUi,
  hydrateVehicles,
  incidentToUi,
  listAlerts,
  listAssignments,
  listExpenses,
  listIncidents,
  listMileage,
  listVehicles,
  mileageToUi,
  syncFleetAlerts,
} from "../../../lib/fleet-store";
import { serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  try {
    const session = await requireFleetSession(auth);
    if (!session.ok) return Response.json({ error: session.error }, { status: session.status });
    if (!session.caps.canViewAll) return Response.json({ error: "Tableau de bord réservé à la consultation du parc." }, { status: 403 });
    const url = new URL(request.url);
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    await syncFleetAlerts(session.orgId);
    const [vehicleRows, incidents, expenses, alerts, mileage, assignments] = await Promise.all([
      listVehicles(session.orgId),
      listIncidents(session.orgId),
      listExpenses(session.orgId),
      listAlerts(session.orgId),
      listMileage(session.orgId),
      listAssignments(session.orgId),
    ]);
    const vehicles = await hydrateVehicles(session.orgId, vehicleRows);
    return Response.json(dashboardPayload({
      vehicles,
      incidents: incidents.map(incidentToUi),
      expenses: expenses.map(expenseToUi),
      alerts: alerts.map(alertToUi),
      mileage: mileage.map(mileageToUi),
      assignments: assignments.map(assignmentToUi),
      from,
      to,
    }));
  } catch (error) {
    return Response.json({ error: error.message || "Tableau de bord indisponible." }, { status: 502 });
  }
}
