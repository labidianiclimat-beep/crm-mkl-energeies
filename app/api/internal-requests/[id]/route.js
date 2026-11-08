import { requireApiSession } from "../../../lib/api-auth";
import { REQUEST_MODULE } from "../../../lib/internal-requests";
import {
  MISSING_ASSIGNEES_MESSAGE,
  MISSING_REQUESTS_MESSAGE,
  actOnInternalRequest,
  getInternalRequest,
  isMissingAssigneeColumn,
  isMissingRequestsTable,
} from "../../../lib/internal-requests-server";
import { serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

function failure(error) {
  if (isMissingAssigneeColumn(error)) {
    return Response.json({ error: MISSING_ASSIGNEES_MESSAGE, missing: true }, { status: 503 });
  }
  if (isMissingRequestsTable(error)) {
    return Response.json({ error: MISSING_REQUESTS_MESSAGE, missing: true }, { status: 503 });
  }
  console.error("Ticket interne", error?.message || error);
  return Response.json({ error: "Action impossible pour le moment." }, { status: 502 });
}

export async function GET(request, { params }) {
  const auth = await requireApiSession(request, { module: REQUEST_MODULE });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  try {
    const { id } = await params;
    const result = await getInternalRequest(auth, id);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 404 });
    return Response.json({ request: result.request });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request, { params }) {
  const auth = await requireApiSession(request, { module: REQUEST_MODULE });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await actOnInternalRequest(auth, id, body);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 400 });
    return Response.json({ request: result.request });
  } catch (error) {
    return failure(error);
  }
}
