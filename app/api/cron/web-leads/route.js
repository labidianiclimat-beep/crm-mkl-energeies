import { CRON_UNAUTHORIZED, cronAuthorized } from "../../../lib/cron-auth";
import { serviceRoleConfigured } from "../../../lib/supabase-server";
import { processWebLeadQueue } from "../../../lib/web-lead-queue-server";

/**
 * Filet de sécurité de la file des demandes du site.
 *
 * Le cas normal est traité dès la réception, dans /api/web-leads. Ce passage
 * sert aux réessais : demande arrivée pendant une panne de base, intégration
 * interrompue, verrou laissé par une exécution coupée.
 */

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function run(request) {
  if (!cronAuthorized(request)) {
    return Response.json(CRON_UNAUTHORIZED, { status: 401 });
  }
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  try {
    const counts = await processWebLeadQueue({ worker: "vercel-cron" });
    return Response.json({ ok: true, ...counts });
  } catch (error) {
    console.error(`web-leads cron indisponible : ${error.message}`);
    return Response.json({ error: "File indisponible." }, { status: 502 });
  }
}

export async function GET(request) {
  return run(request);
}

export async function POST(request) {
  return run(request);
}
