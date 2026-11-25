import { requireApiSession } from "../../lib/api-auth";
import { buildProjexioRequest } from "../../lib/projexio";
import { projexioGet } from "../../lib/projexio-server";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const built = buildProjexioRequest(body);
    if (built.error) return Response.json({ error: built.error }, { status: 400 });

    const result = await projexioGet(built.path, built.params);
    return Response.json({ result });
  } catch (error) {
    const status = Number(error.status) || 502;
    return Response.json({ error: error.message || "Simulation Projexio impossible." }, { status });
  }
}
