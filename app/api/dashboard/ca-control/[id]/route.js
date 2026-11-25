import { requireApiSession } from "../../../../lib/api-auth";
import { canDepositSignedOrder, isSignedOrderStatus } from "../../../../lib/ca-control";
import { extraOf, isUuid } from "../../../../lib/prospects";
import { resolveScopedCommercialIds } from "../../../../lib/scoping";
import { serviceRequest, serviceRoleConfigured } from "../../../../lib/supabase-server";
import { loadTeamMemberIds } from "../../../../lib/team-scope";

export const runtime = "nodejs";

export async function PATCH(request, { params }) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canDepositSignedOrder(auth.profile)) {
      return Response.json({ error: "Seuls le Superadmin et l’Admin VIP peuvent valider le dépôt du dossier." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }
    const { id } = await params;
    if (!isUuid(id)) return Response.json({ error: "Identifiant invalide." }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    if (typeof body.deposited !== "boolean") {
      return Response.json({ error: "Indiquez si le dossier est déposé." }, { status: 400 });
    }

    const orgId = auth.profile.organization_id;
    const rows = await serviceRequest(
      `/rest/v1/commercial_appointments?select=id,organization_id,commercial_id,status,extra&id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(orgId)}&limit=1`
    );
    const existing = rows?.[0];
    if (!existing || !isSignedOrderStatus(existing.status)) {
      return Response.json({ error: "Commande signée introuvable." }, { status: 404 });
    }
    const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
    const scoped = resolveScopedCommercialIds(auth.profile, auth.user.id, teamIds || []);
    if (scoped && !scoped.map(String).includes(String(existing.commercial_id || ""))) {
      return Response.json({ error: "Ce commercial est hors de votre équipe." }, { status: 403 });
    }

    const extra = {
      ...extraOf(existing),
      dossierDepose: body.deposited,
      dossierDeposeAt: body.deposited ? new Date().toISOString() : "",
      dossierDeposeBy: body.deposited ? auth.user.id : "",
    };
    await serviceRequest(
      `/rest/v1/commercial_appointments?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(orgId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: { extra },
      }
    );
    return Response.json({ id, deposited: body.deposited });
  } catch (error) {
    console.error("CA deposit error", error.message);
    return Response.json({ error: "Impossible d’enregistrer le dépôt du dossier." }, { status: 502 });
  }
}
