import { CRON_UNAUTHORIZED, cronAuthorized } from "../../../lib/cron-auth";
import { dispatchDueReminders } from "../../../lib/agenda-reminders";
import { serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

async function run(request) {
  if (!cronAuthorized(request)) {
    return Response.json(CRON_UNAUTHORIZED, { status: 401 });
  }
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  try {
    const result = await dispatchDueReminders();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("agenda reminders cron", error.message);
    return Response.json({ error: "Rappels agenda indisponibles." }, { status: 502 });
  }
}

export async function GET(request) {
  return run(request);
}

export async function POST(request) {
  return run(request);
}
