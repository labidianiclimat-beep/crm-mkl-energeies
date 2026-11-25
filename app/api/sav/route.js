import { requireApiSession } from "../../lib/api-auth";
import { SAV_MODULE } from "../../lib/sav";
import {
  MISSING_SAV_MESSAGE,
  createSavCase,
  isMissingSavTable,
  listSavCases,
  searchSavClients,
} from "../../lib/sav-server";
import { serviceRoleConfigured } from "../../lib/supabase-server";

export const runtime = "nodejs";

function failure(error) {
  if (isMissingSavTable(error)) {
    return Response.json({ error: MISSING_SAV_MESSAGE, missing: true }, { status: 503 });
  }
  console.error("SAV", error?.message || error);
  return Response.json({ error: "Impossible de charger les dossiers SAV." }, { status: 502 });
}

export async function GET(request) {
  const auth = await requireApiSession(request, { module: SAV_MODULE });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  try {
    const clientQuery = new URL(request.url).searchParams.get("clientQuery");
    if (clientQuery != null) return Response.json({ clients: await searchSavClients(auth, clientQuery) });
    return Response.json(await listSavCases(auth));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request) {
  const auth = await requireApiSession(request, { module: SAV_MODULE });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const result = await createSavCase(auth, body);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 400 });
    return Response.json({ case: result.case }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
