import { requireApiSession } from "../../../lib/api-auth";
import { SAV_MODULE } from "../../../lib/sav";
import { MISSING_SAV_MESSAGE, actOnSavCase, getSavCase, isMissingSavTable } from "../../../lib/sav-server";
import { serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

function failure(error) {
  if (isMissingSavTable(error)) {
    return Response.json({ error: MISSING_SAV_MESSAGE, missing: true }, { status: 503 });
  }
  console.error("SAV", error?.message || error);
  return Response.json({ error: "Dossier introuvable." }, { status: 502 });
}

export async function GET(request, { params }) {
  const auth = await requireApiSession(request, { module: SAV_MODULE });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  try {
    const { id } = await params;
    const result = await getSavCase(auth, id);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 404 });
    return Response.json({ case: result.case });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request, { params }) {
  const auth = await requireApiSession(request, { module: SAV_MODULE });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await actOnSavCase(auth, id, body);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 400 });
    return Response.json({ case: result.case });
  } catch (error) {
    return failure(error);
  }
}
