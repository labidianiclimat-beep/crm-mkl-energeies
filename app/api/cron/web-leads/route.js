import { CRON_UNAUTHORIZED, cronAuthorized } from "../../../lib/cron-auth";
import { serviceRoleConfigured } from "../../../lib/supabase-server";
import { webLeadIngestConfigured } from "../../../lib/web-lead-ingest";
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
  // Sur un environnement où la réception n'est pas configurée, il n'y a rien à
  // reprendre : aucune demande ne peut y entrer, faute de trousseau. Le
  // passage s'arrête donc ici, sans erreur et sans trace.
  //
  // Ce n'est pas une précaution d'esthétique. Mesuré en production le
  // 7 novembre : quatre-vingt-dix passages en quatre-vingt-dix minutes, tous
  // en erreur, tous pour la même cause — la fonction `reserve_web_leads` n'y
  // est pas encore installée. Mille quatre cent quarante lignes d'erreur par
  // jour ne signalent rien et masquent tout : la première vraie panne de la
  // file s'y perdrait sans que personne ne la distingue du bruit.
  //
  // Revers à connaître, et à vérifier à la mise en service : si le trousseau
  // disparaissait d'un environnement où la file tourne, ce passage deviendrait
  // silencieux au lieu d'alerter. Le contrôle est donc que la réponse dise
  // « ok » sans « inerte » une fois la production configurée.
  if (!webLeadIngestConfigured()) {
    return Response.json({ ok: true, inerte: "réception non configurée sur cet environnement" });
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
