import { CRON_UNAUTHORIZED, cronAuthorized } from "../../../lib/cron-auth";

export const runtime = "nodejs";

async function run(request) {
  if (!cronAuthorized(request)) {
    return Response.json(CRON_UNAUTHORIZED, { status: 401 });
  }
  return Response.json({
    ok: true,
    skipped: true,
    googleDisabled: true,
    wroteToGoogle: false,
    reason: "Maintenance n’interroge plus Google Agenda.",
  });
}

export async function GET(request) {
  return run(request);
}

export async function POST(request) {
  return run(request);
}
