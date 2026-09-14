import { requireApiSession } from "../../../../lib/api-auth";
import { canManageDevis, historyToUi } from "../../../../lib/devis";
import { loadTeamMemberIds } from "../../../../lib/team-scope";
import { canAccessScopedRow } from "../../../../lib/scoping";
import { serviceRequest, serviceRoleConfigured } from "../../../../lib/supabase-server";

export const runtime = "nodejs";

const DEVIS_SELECT = "id,organization_id,commercial_id,created_by";

async function canAccessRow(profile, userId, row) {
  if (!row) return false;
  const teamIds = await loadTeamMemberIds(profile, userId);
  return canAccessScopedRow(profile, userId, row, teamIds || []);
}

export async function GET(request, { params }) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageDevis(auth.profile)) {
      return Response.json({ error: "Accès refusé." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const rows = await serviceRequest(
      `/rest/v1/devis?select=${DEVIS_SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`
    );
    const devis = rows?.[0];
    if (!devis || !(await canAccessRow(auth.profile, auth.user.id, devis))) {
      return Response.json({ error: "Document introuvable." }, { status: 404 });
    }

    const history = await serviceRequest(
      `/rest/v1/devis_historique?select=id,devis_id,ancien_statut,nouveau_statut,utilisateur_id,date,commentaire&devis_id=eq.${encodeURIComponent(id)}&order=date.desc`
    );

    return Response.json({
      history: (history || []).map(historyToUi).filter(Boolean),
    });
  } catch (error) {
    console.error("Devis history error", error.message);
    return Response.json({ error: "Impossible de charger l’historique." }, { status: 502 });
  }
}
