import { requireApiSession } from "../../../lib/api-auth";
import { changeDriverRecord, createAssignmentRecord, releaseAssignmentRecord, requireFleetSession, reviewAssignment } from "../../../lib/fleet-api";
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
    if (body.action === "change") {
      const result = await changeDriverRecord(auth, session.caps, body);
      return Response.json(result);
    }
    if (body.action === "release") {
      const result = await releaseAssignmentRecord(auth, session.caps, body);
      return Response.json(result);
    }
    if (body.action === "review") {
      const result = await reviewAssignment(auth, session.caps, body.id, { action: body.decision, reason: body.reason });
      return Response.json(result);
    }
    if (!session.caps.canPrepareAssign) {
      return Response.json({ error: "Vous ne pouvez pas préparer une affectation." }, { status: 403 });
    }
    const assignment = await createAssignmentRecord(auth, session.caps, body);
    return Response.json({ assignment });
  } catch (error) {
    return Response.json({ error: error.message || "Affectation impossible." }, { status: error.status || 400 });
  }
}
