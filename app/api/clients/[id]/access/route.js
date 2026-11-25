import { requireApiSession } from "../../../../lib/api-auth";
import { normalizeClientPortalAccess } from "../../../../lib/client-portal";
import { isPersistedClientId } from "../../../../lib/client-documents";
import { canAccessScopedRow } from "../../../../lib/scoping";
import { serviceRequest, serviceRoleConfigured } from "../../../../lib/supabase-server";
import { loadTeamMemberIds } from "../../../../lib/team-scope";

export const runtime = "nodejs";

const MISSING_COLUMN = "Colonne portal_access absente. Collez le script 20261019_client_portal_access.sql dans Supabase.";

function missingColumn(error) {
  return /portal_access/i.test(String(error?.message || ""));
}

async function loadClient(id) {
  const rows = await serviceRequest(
    `/rest/v1/clients?select=id,organization_id,commercial_id,created_by&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return rows?.[0] || null;
}

async function assertClientAccess(auth, clientId) {
  if (!isPersistedClientId(clientId)) return { error: "Client introuvable.", status: 404 };
  const row = await loadClient(clientId);
  if (!row) return { error: "Client introuvable.", status: 404 };
  const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
  if (!canAccessScopedRow(auth.profile, auth.user.id, row, teamIds || [])) {
    return { error: "Client introuvable ou accès refusé.", status: 404 };
  }
  return { row };
}

export async function GET(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Clients" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }
    const { id } = await params;
    const access = await assertClientAccess(auth, id);
    if (access.error) return Response.json({ error: access.error }, { status: access.status });
    const rows = await serviceRequest(
      `/rest/v1/clients?select=portal_access&id=eq.${encodeURIComponent(id)}&limit=1`
    );
    return Response.json({ access: normalizeClientPortalAccess(rows?.[0]?.portal_access) });
  } catch (error) {
    if (missingColumn(error)) return Response.json({ error: MISSING_COLUMN, missing: true }, { status: 501 });
    console.error("Client portal access read error", error.message);
    return Response.json({ error: "Impossible de charger les accès." }, { status: 502 });
  }
}

export async function PUT(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Clients" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }
    const { id } = await params;
    const access = await assertClientAccess(auth, id);
    if (access.error) return Response.json({ error: access.error }, { status: access.status });
    const body = await request.json().catch(() => ({}));
    const portal = normalizeClientPortalAccess(body.access || body);
    await serviceRequest(`/rest/v1/clients?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { portal_access: portal, updated_at: new Date().toISOString() },
    });
    return Response.json({ access: portal });
  } catch (error) {
    if (missingColumn(error)) return Response.json({ error: MISSING_COLUMN, missing: true }, { status: 501 });
    console.error("Client portal access write error", error.message);
    return Response.json({ error: "Impossible d’enregistrer les accès." }, { status: 502 });
  }
}
