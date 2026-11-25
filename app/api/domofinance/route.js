import { requireApiSession } from "../../lib/api-auth";
import { buildDomofinanceRequest } from "../../lib/domofinance";
import { domofinanceGet } from "../../lib/domofinance-server";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const built = buildDomofinanceRequest(body);
    if (built.error) return Response.json({ error: built.error }, { status: 400 });

    const result = await domofinanceGet(built.path, built.params);
    return Response.json({ result });
  } catch (error) {
    const status = Number(error.status) || 502;
    return Response.json({ error: error.message || "Simulation Domofinance impossible." }, { status });
  }
}
