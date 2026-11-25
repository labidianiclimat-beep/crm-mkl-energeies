import { requireApiSession } from "../../../../../lib/api-auth";
import { serviceRequest, serviceRoleConfigured } from "../../../../../lib/supabase-server";
import { canReviewWebLeads, webLeadEventRow } from "../../../../../lib/web-lead-admin";

/**
 * Historique des interventions sur une demande du site.
 *
 * La table est en ajout seul : ce qui s'est passé reste lisible, y compris les
 * relances manuelles et leur auteur. C'est ce qui permet de répondre, plus
 * tard, à la question « pourquoi cette demande n'est jamais arrivée ».
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Prospects" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canReviewWebLeads(auth.profile)) {
      return Response.json({ error: "Consultation non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const organizationId = auth.profile.organization_id;

    const rows = await serviceRequest(
      "/rest/v1/web_lead_events?select=id,kind,attempt,error_code,author_id,created_at" +
        `&submission_pk=eq.${encodeURIComponent(String(id || ""))}` +
        `&organization_id=eq.${organizationId}` +
        "&order=created_at.asc&limit=100"
    );

    return Response.json({ events: (rows || []).map(webLeadEventRow) });
  } catch (error) {
    console.error(`web-leads historique illisible : ${String(error.message).slice(0, 120)}`);
    return Response.json({ error: "Historique indisponible." }, { status: 502 });
  }
}
