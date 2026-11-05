import { CRON_UNAUTHORIZED, cronAuthorized } from "../../../lib/cron-auth";
import { WEB_LEAD_RETENTION } from "../../../lib/web-lead-retention";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";

/**
 * Conservation limitée des contenus techniques des demandes du site.
 *
 * Deux temps, et jamais l'un sans l'autre. Le signalement marque les demandes
 * dont la conservation arrive à son terme, pour qu'un responsable puisse les
 * traiter. L'effacement ne concerne ensuite que les contenus signalés depuis
 * plus longtemps que le délai de grâce.
 *
 * Ce passage n'efface jamais une fiche commerciale, ni une ligne de demande :
 * seul le contenu brut reçu du site disparaît, et la demande garde sa trace,
 * son historique et sa date d'effacement.
 */

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function rpc(nom, body) {
  const resultat = await serviceRequest(`/rest/v1/rpc/${nom}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return Number(resultat) || 0;
}

async function run(request) {
  if (!cronAuthorized(request)) {
    return Response.json(CRON_UNAUTHORIZED, { status: 401 });
  }
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  try {
    // Le signalement passe d'abord : une demande repérée aujourd'hui ne peut
    // pas être effacée aujourd'hui, puisque son délai de grâce démarre ici.
    const signalees = await rpc("web_lead_retention_scan", {});
    const effacees = await rpc("purge_web_lead_payloads", {
      p_grace_days: WEB_LEAD_RETENTION.graceDays,
    });
    return Response.json({
      ok: true,
      signalees,
      effacees,
      conservation: WEB_LEAD_RETENTION.payloadDays,
      grace: WEB_LEAD_RETENTION.graceDays,
    });
  } catch (error) {
    console.error(`conservation des demandes indisponible : ${error.message}`);
    return Response.json({ error: "Conservation indisponible." }, { status: 502 });
  }
}

export async function GET(request) {
  return run(request);
}

export async function POST(request) {
  return run(request);
}
