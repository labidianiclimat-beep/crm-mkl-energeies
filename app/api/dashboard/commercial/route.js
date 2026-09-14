import { requireApiSession } from "../../../lib/api-auth";
import { canViewAllClients, clientToUi } from "../../../lib/clients";
import { devisToUi } from "../../../lib/devis";
import {
  computeCommercialDashboard,
  filterByActivity,
  filterDevisByPeriod,
} from "../../../lib/dashboard-commercial";
import { canViewOrgWideCommercialData, canViewTeamCommercialData } from "../../../lib/scoping";
import { commercialScopeQuery, loadTeamMemberIds } from "../../../lib/team-scope";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

const DEVIS_SELECT =
  "id,organization_id,kind,numero_devis,client_id,client_name,commercial_id,statut,date_creation,date_validite,date_livraison,total_ht,total_tva,total_ttc,label,created_at,updated_at,created_by";

const CLIENT_SELECT =
  "id,organization_id,type_client,civilite,nom,prenom,raison_sociale,adresse,complement_adresse,code_postal,ville,telephone,telephone_secondaire,email,origine_lead,statut,commercial_id,notes,project_type,install,consent,created_at,updated_at,created_by";

function canFilterByCommercial(profile) {
  return canViewOrgWideCommercialData(profile) || canViewTeamCommercialData(profile);
}

export async function GET(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const url = new URL(request.url);
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const activity = url.searchParams.get("activity") || "";
    const agency = url.searchParams.get("agency") || "";
    let commercialId = url.searchParams.get("commercialId") || "";

    if (commercialId && !canFilterByCommercial(auth.profile)) {
      return Response.json({ error: "Filtre commercial non autorisé." }, { status: 403 });
    }
    if (!canFilterByCommercial(auth.profile)) {
      commercialId = auth.user.id;
    }

    const orgId = auth.profile.organization_id;
    let devisPath = `/rest/v1/devis?select=${DEVIS_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&kind=eq.Devis&order=updated_at.desc`;
    let clientsPath = `/rest/v1/clients?select=${CLIENT_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&order=updated_at.desc`;

    if (commercialId) {
      const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
      if (teamIds != null && !teamIds.map(String).includes(String(commercialId)) && !canViewOrgWideCommercialData(auth.profile)) {
        return Response.json({ error: "Commercial hors de votre périmètre." }, { status: 403 });
      }
      devisPath += `&or=(commercial_id.eq.${encodeURIComponent(commercialId)},created_by.eq.${encodeURIComponent(commercialId)})`;
      clientsPath += `&or=(commercial_id.eq.${encodeURIComponent(commercialId)},created_by.eq.${encodeURIComponent(commercialId)})`;
    } else {
      devisPath += await commercialScopeQuery(auth.profile, auth.user.id);
      clientsPath += await commercialScopeQuery(auth.profile, auth.user.id);
    }

    const [devisRows, clientRows, opportunityRows, appointmentRows] = await Promise.all([
      serviceRequest(devisPath).catch(() => []),
      serviceRequest(clientsPath).catch(() => []),
      serviceRequest(
        `/rest/v1/commercial_opportunities?select=id,name,city,stage,commercial_id,project_type,estimated_value,created_at&organization_id=eq.${encodeURIComponent(orgId)}&order=updated_at.desc`
      ).catch(() => []),
      serviceRequest(
        `/rest/v1/commercial_appointments?select=id,prospect_name,city,starts_at,status,commercial_id,organization_id&organization_id=eq.${encodeURIComponent(orgId)}&order=starts_at.asc`
      ).catch(() => []),
    ]);

    let devis = (devisRows || []).map(row => devisToUi(row, []));
    let clients = (clientRows || []).map(clientToUi);
    let opportunities = opportunityRows || [];
    let appointments = (appointmentRows || []).map(row => ({
      id: row.id,
      prospectName: row.prospect_name,
      city: row.city,
      start: row.starts_at,
      status: row.status,
      commercial_id: row.commercial_id,
    }));

    if (commercialId) {
      opportunities = opportunities.filter(
        row => String(row.commercial_id) === String(commercialId) || String(row.created_by) === String(commercialId)
      );
      appointments = appointments.filter(row => String(row.commercial_id) === String(commercialId));
    }

    devis = filterDevisByPeriod(devis, from, to);
    if (activity) {
      devis = filterByActivity(devis, activity, ["label", "client"]);
      clients = filterByActivity(clients, activity, ["projectType", "install", "name"]);
      opportunities = filterByActivity(opportunities, activity, ["project_type", "name", "stage"]);
    }

    // Agence : placeholder org unique MKL pour l’instant
    if (agency && !["mkl", "mkl energies", "toutes"].includes(String(agency).toLowerCase())) {
      devis = [];
      clients = [];
      opportunities = [];
      appointments = [];
    }

    const metrics = computeCommercialDashboard({
      devis,
      clients,
      prospects: opportunities,
      appointments,
    });

    let commercials = [];
    if (canFilterByCommercial(auth.profile)) {
      if (canViewAllClients(auth.profile)) {
        const rows = await serviceRequest(
          `/rest/v1/profiles?select=id,full_name,email,role&organization_id=eq.${encodeURIComponent(orgId)}&active=eq.true&role=in.("Commercial","Responsable commercial","Admin VIP","Admin second","Direction","Secrétariat")&order=full_name.asc`
        );
        commercials = (rows || []).map(row => ({
          id: row.id,
          name: row.full_name || row.email,
          role: row.role,
        }));
      } else {
        const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
        const rows = await serviceRequest(
          `/rest/v1/profiles?select=id,full_name,email,role&id=in.(${(teamIds || []).map(id => `"${id}"`).join(",")})&order=full_name.asc`
        );
        commercials = (rows || []).map(row => ({
          id: row.id,
          name: row.full_name || row.email,
          role: row.role,
        }));
      }
    }

    return Response.json({
      metrics,
      filters: {
        from: from || null,
        to: to || null,
        commercialId: commercialId || null,
        activity: activity || null,
        agency: agency || "MKL Énergies",
        canFilterByCommercial: canFilterByCommercial(auth.profile),
      },
      commercials,
      scope: canViewOrgWideCommercialData(auth.profile)
        ? "organization"
        : canViewTeamCommercialData(auth.profile)
          ? "team"
          : "self",
    });
  } catch (error) {
    console.error("Commercial dashboard error", error.message);
    return Response.json({ error: "Impossible de charger le tableau de bord." }, { status: 502 });
  }
}
