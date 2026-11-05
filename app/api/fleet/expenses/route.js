import { requireApiSession } from "../../../lib/api-auth";
import { expensesToCsv } from "../../../lib/fleet";
import { requireFleetSession, reviewExpenseRecord, submitExpenseRecord } from "../../../lib/fleet-api";
import { expenseToUi, hydrateVehicles, listExpenses, listVehicles } from "../../../lib/fleet-store";
import { serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  try {
    const session = await requireFleetSession(auth);
    if (!session.ok) return Response.json({ error: session.error }, { status: session.status });
    if (!session.caps.canViewAll) return Response.json({ error: "Export réservé à la consultation du parc." }, { status: 403 });
    const url = new URL(request.url);
    if (url.searchParams.get("export") !== "1") return Response.json({ error: "Précisez export=1." }, { status: 400 });
    const expenses = (await listExpenses(session.orgId)).map(expenseToUi);
    const vehicles = await hydrateVehicles(session.orgId, await listVehicles(session.orgId));
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const filtered = expenses.filter(item => {
      if (from && item.occurredOn < from) return false;
      if (to && item.occurredOn > to) return false;
      return true;
    });
    const csv = expensesToCsv(filtered, vehicles);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"parc-depenses.csv\"",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error.message || "Export impossible." }, { status: 502 });
  }
}

export async function POST(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  try {
    const session = await requireFleetSession(auth);
    if (!session.ok) return Response.json({ error: session.error }, { status: session.status });
    const body = await request.json();
    if (body.action === "review") {
      const expense = await reviewExpenseRecord(auth, session.caps, body.id, { action: body.decision, reason: body.reason });
      return Response.json({ expense });
    }
    const result = await submitExpenseRecord(auth, session.caps, body);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message || "Dépense impossible." }, { status: error.status || 400 });
  }
}
