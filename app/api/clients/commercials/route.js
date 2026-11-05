import { requireApiSession } from "../../../lib/api-auth";
import { canAccessModule } from "../../../lib/permissions";
import { canAssignClientCommercial, canViewAllClients } from "../../../lib/clients";
import { canManageDevis, canViewAllDevis } from "../../../lib/devis";
import { isDispatchCommercialRole, isProspectDispatcher } from "../../../lib/prospect-dispatch";
import { normalizeRoleLabel } from "../../../lib/roles";
import { loadTeamMemberIds } from "../../../lib/team-scope";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (
      !canAccessModule(auth.profile, "Clients") &&
      !canAccessModule(auth.profile, "Prospects") &&
      !canAccessModule(auth.profile, "Agenda commercial") &&
      !canManageDevis(auth.profile)
    ) {
      return Response.json({ error: auth.error || "Accès refusé à ce module." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const orgId = auth.profile.organization_id;

    if (canViewAllClients(auth.profile) || canViewAllDevis(auth.profile) || isProspectDispatcher(auth.profile)) {
      const rows = await serviceRequest(
        `/rest/v1/profiles?select=id,full_name,email,role,active,zone,specialties,postal_code,city,dispatch_available&organization_id=eq.${encodeURIComponent(orgId)}&or=(active.eq.true,active.is.null)&order=full_name.asc`
      );
      return Response.json({
        commercials: (rows || []).filter(row => isDispatchCommercialRole(row.role)).map(row => ({
          id: row.id,
          name: row.full_name || row.email,
          role: normalizeRoleLabel(row.role),
          zone: row.zone || "",
          specialties: row.specialties || [],
          postalCode: row.postal_code || "",
          city: row.city || "",
          dispatchAvailable: row.dispatch_available !== false,
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
            role: normalizeRoleLabel(auth.profile.role),
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
          role: normalizeRoleLabel(row.role),
        })),
      });
    }

    return Response.json({
      commercials: [{
        id: auth.user.id,
        name: auth.profile.full_name || auth.profile.email,
        role: normalizeRoleLabel(auth.profile.role),
      }],
    });
  } catch (error) {
    console.error("Commercials list error", error.message);
    return Response.json({ error: "Impossible de charger les commerciaux." }, { status: 502 });
  }
}
