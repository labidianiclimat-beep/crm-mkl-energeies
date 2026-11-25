import { CRON_UNAUTHORIZED, cronAuthorized } from "../../../lib/cron-auth";
import { fetchMetaFormLeads, metaFormIds, recordMetaLead } from "../../../lib/meta-leads";

/**
 * Rattrapage horaire des formulaires Meta des dernières 24 heures.
 * Le webhook reste le chemin normal. Ce passage reprend ce qu'il aurait manqué.
 */

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!cronAuthorized(request)) return Response.json(CRON_UNAUTHORIZED, { status: 401 });
  const token = process.env.META_PAGE_TOKEN || "";
  const formIds = metaFormIds();
  if (!token || formIds.length === 0) {
    return Response.json({ ok: true, inerte: "formulaires Meta non configurés" });
  }

  const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
  let recorded = 0;
  for (const formId of formIds) {
    try {
      const leads = await fetchMetaFormLeads(formId, since, token);
      for (const lead of leads) {
        try {
          await recordMetaLead(lead, { formId, leadgenId: lead.id, adId: lead.ad_id });
          recorded += 1;
        } catch (error) {
          console.error(`meta-leads sync ${lead?.id || formId} : ${String(error?.message || error).slice(0, 180)}`);
        }
      }
    } catch (error) {
      console.error(`meta-leads sync formulaire ${formId} : ${String(error?.message || error).slice(0, 180)}`);
    }
  }
  return Response.json({ ok: true, recorded });
}
