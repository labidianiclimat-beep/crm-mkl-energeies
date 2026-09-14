import { requireApiSession } from "../../../lib/api-auth";
import { canAssignClientCommercial, canViewAllClients } from "../../../lib/clients";
import { loadTeamMemberIds } from "../../../lib/team-scope";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const auth = await requireApiSession(request, { module: "Clients" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const orgId = auth.profile.organization_id;

    if (canViewAllClients(auth.profile)) {
      const rows = await serviceRequest(
        `/rest/v1/profiles?select=id,full_name,email,role,active&organization_id=eq.${encodeURIComponent(orgId)}&active=eq.true&role=in.("Commercial","Responsable commercial","Admin VIP","Admin second","Direction")&order=full_name.asc`
      );
      return Response.json({
        commercials: (rows || []).map(row => ({
          id: row.id,
          name: row.full_name || row.email,
          role: row.role,
        })),
      });
    }

    if (canAssignClientCommercial(auth.profile)) {
      const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
      const ids = (teamIds || [auth.user.id]).filter(Boolean);
      if (!ids.length) {
        return Response.json({
          commercials: [{
            id: auth.user.id,
            name: auth.profile.full_name || auth.profile.email,
            role: auth.profile.role,
          }],
        });
      }
      const rows = await serviceRequest(
        `/rest/v1/profiles?select=id,full_name,email,role,active&id=in.(${ids.map(id => `"${id}"`).join(",")})&active=eq.true&order=full_name.asc`
      );
      return Response.json({
        commercials: (rows || []).map(row => ({
          id: row.id,
          name: row.full_name || row.email,
          role: row.role,
        })),
      });
    }

    return Response.json({
      commercials: [{
        id: auth.user.id,
        name: auth.profile.full_name || auth.profile.email,
        role: auth.profile.role,
      }],
    });
  } catch (error) {
    console.error("Commercials list error", error.message);
    return Response.json({ error: "Impossible de charger les commerciaux." }, { status: 502 });
  }
}
