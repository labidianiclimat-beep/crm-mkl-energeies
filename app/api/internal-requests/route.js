import { requireApiSession } from "../../lib/api-auth";
import { REQUEST_MODULE } from "../../lib/internal-requests";
import {
  MISSING_ASSIGNEES_MESSAGE,
  MISSING_REQUESTS_MESSAGE,
  createInternalRequest,
  isMissingAssigneeColumn,
  isMissingRequestsTable,
  listInternalRequests,
} from "../../lib/internal-requests-server";
import { serviceRoleConfigured } from "../../lib/supabase-server";

export const runtime = "nodejs";

function failure(error) {
  if (isMissingAssigneeColumn(error)) {
    return Response.json({ error: MISSING_ASSIGNEES_MESSAGE, missing: true }, { status: 503 });
  }
  if (isMissingRequestsTable(error)) {
    return Response.json({ error: MISSING_REQUESTS_MESSAGE, missing: true }, { status: 503 });
  }
  console.error("Tickets internes", error?.message || error);
  return Response.json({ error: "Impossible de charger les tickets internes." }, { status: 502 });
}

export async function GET(request) {
  const auth = await requireApiSession(request, { module: REQUEST_MODULE });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  try {
    return Response.json(await listInternalRequests(auth));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request) {
  const auth = await requireApiSession(request, { module: REQUEST_MODULE });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const result = await createInternalRequest(auth, body);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 400 });
    return Response.json({ request: result.request }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
