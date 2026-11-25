import { requireApiSession } from "../../../lib/api-auth";

export const runtime = "nodejs";

const DISABLED = {
  ok: true,
  accessible: false,
  googleDisabled: true,
  sheetCount: 0,
  error: "Le rapprochement est terminé. Maintenance n’interroge plus Google Sheet.",
};

export async function GET(request) {
  const auth = await requireApiSession(request, { module: "Maintenance" });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  return Response.json(DISABLED);
}

export async function POST(request) {
  const auth = await requireApiSession(request, { module: "Maintenance" });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  return Response.json(DISABLED, { status: 410 });
}
