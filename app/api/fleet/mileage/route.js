import { requireApiSession } from "../../../lib/api-auth";
import { requireFleetSession, reviewMileageRecord, submitMileageRecord } from "../../../lib/fleet-api";
import { serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  try {
    const session = await requireFleetSession(auth);
    if (!session.ok) return Response.json({ error: session.error }, { status: session.status });
    const body = await request.json();
    if (body.action === "review") {
      const reading = await reviewMileageRecord(auth, session.caps, body.id, { action: body.decision, reason: body.reason });
      return Response.json({ reading });
    }
    const result = await submitMileageRecord(auth, session.caps, body);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message || "Relevé impossible." }, { status: error.status || 400 });
  }
}
