import { requireApiSession } from "../../../../lib/api-auth";
import { notifyCommercialAndManager } from "../../../../lib/client-followup-notify";
import { formatFrDate, PREVISIT_SCHEDULED_STATUS } from "../../../../lib/client-followup";
import { clientToUi } from "../../../../lib/clients";
import { canAccessScopedRow } from "../../../../lib/scoping";
import { loadTeamMemberIds } from "../../../../lib/team-scope";
import { serviceRequest, serviceRoleConfigured } from "../../../../lib/supabase-server";

export const runtime = "nodejs";

async function loadClient(id) {
  const rows = await serviceRequest(
    `/rest/v1/clients?select=id,organization_id,type_client,civilite,nom,prenom,raison_sociale,statut,commercial_id,created_by&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function POST(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Clients" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const row = await loadClient(id);
    const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
    if (!row || row.organization_id !== auth.profile.organization_id || !canAccessScopedRow(auth.profile, auth.user.id, row, teamIds || [])) {
      return Response.json({ error: "Client introuvable ou accès refusé." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const date = String(body.date || body.previsitDate || "").slice(0, 10);
    if (!date) {
      return Response.json({ error: "Indiquez la date de prévisite." }, { status: 400 });
    }

    const client = clientToUi(row);
    await notifyCommercialAndManager({
      orgId: auth.profile.organization_id,
      commercialId: row.commercial_id,
      title: `${PREVISIT_SCHEDULED_STATUS} — ${client.name}`,
      body: `${PREVISIT_SCHEDULED_STATUS} le ${formatFrDate(date)}`,
      uniqueKey: `previsit:${id}:${date}`,
    });

    return Response.json({ ok: true, date, status: PREVISIT_SCHEDULED_STATUS });
  } catch (error) {
    console.error("client followup error", error.message);
    return Response.json({ error: "Notification impossible." }, { status: 502 });
  }
}
