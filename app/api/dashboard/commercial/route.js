import { requireApiSession } from "../../../lib/api-auth";
import { deniesFinancialAccess } from "../../../lib/prospect-dispatch";
import { canViewAllClients, clientToUi } from "../../../lib/clients";
import { devisToUi } from "../../../lib/devis";
import {
  addContractCaToRanking,
  belongsToCommercial,
  computeCommercialDashboard,
  computeCommercialRanking,
  contractsPlacedInPeriod,
  filterByActivity,
  filterDevisByPeriod,
  isMaintenanceActivity,
  isOrganizationAgency,
  sumContractAmounts,
} from "../../../lib/dashboard-commercial";
import { maintenanceTtc } from "../../../lib/entretien-agenda";
import { listEntretienContracts, listEntretienPilotage, listEntretienVisits } from "../../../lib/entretien-store";
import { isDemoOrgRecord } from "../../../lib/org-state";
import { visibleProspects } from "../../../lib/prospect-to-client";
import { canViewOrgWideCommercialData, canViewTeamCommercialData, visibleAgendaRowForViewer } from "../../../lib/scoping";
import { commercialScopeQuery, loadPrivateAgendaOwnerIds, loadTeamMemberIds } from "../../../lib/team-scope";
import { listAllRows } from "../../../lib/supabase-list";
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
    if (deniesFinancialAccess(auth.profile)) {
      return Response.json({ error: "Tableau de bord commercial non autorisé." }, { status: 403 });
    }
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
    const canRank = canFilterByCommercial(auth.profile);
    if (!canRank) {
      commercialId = auth.user.id;
    }

    const orgId = auth.profile.organization_id;
    let devisPath = `/rest/v1/devis?select=${DEVIS_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&kind=eq.Devis&order=updated_at.desc`;
    let clientsPath = `/rest/v1/clients?select=${CLIENT_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&order=updated_at.desc`;

    if (commercialId && canRank) {
      const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
      if (teamIds != null && !teamIds.map(String).includes(String(commercialId)) && !canViewOrgWideCommercialData(auth.profile)) {
        return Response.json({ error: "Commercial hors de votre périmètre." }, { status: 403 });
      }
    }

    if (canRank) {
      devisPath += await commercialScopeQuery(auth.profile, auth.user.id);
      clientsPath += await commercialScopeQuery(auth.profile, auth.user.id);
    } else {
      devisPath += `&or=(commercial_id.eq.${encodeURIComponent(commercialId)},created_by.eq.${encodeURIComponent(commercialId)})`;
      clientsPath += `&or=(commercial_id.eq.${encodeURIComponent(commercialId)},created_by.eq.${encodeURIComponent(commercialId)})`;
    }

    const scopeFilter = canRank
      ? await commercialScopeQuery(auth.profile, auth.user.id)
      : `&or=(commercial_id.eq.${encodeURIComponent(commercialId)},created_by.eq.${encodeURIComponent(commercialId)})`;
    const appointmentScope = canRank
      ? await commercialScopeQuery(auth.profile, auth.user.id, ["commercial_id", "created_by", "manager_id"])
      : `&or=(commercial_id.eq.${encodeURIComponent(commercialId)},created_by.eq.${encodeURIComponent(commercialId)})`;

    const [devisRows, clientRows, opportunityRows, appointmentRows] = await Promise.all([
      listAllRows(devisPath).catch(() => []),
      listAllRows(clientsPath).catch(() => []),
      listAllRows(
        `/rest/v1/commercial_opportunities?select=id,name,city,stage,commercial_id,project_type,estimated_value,extra,created_at,created_by&organization_id=eq.${encodeURIComponent(orgId)}&order=updated_at.desc` +
          scopeFilter
      ).catch(() => []),
      listAllRows(
        `/rest/v1/commercial_appointments?select=id,prospect_name,city,starts_at,status,commercial_id,created_by,organization_id&organization_id=eq.${encodeURIComponent(orgId)}&order=starts_at.asc` +
          appointmentScope
      ).catch(() => []),
    ]);

    let devis = (devisRows || []).map(row => devisToUi(row, []));
    let clients = (clientRows || []).map(clientToUi);
    const maintenanceSelected = isMaintenanceActivity(activity);
    const ownerByClient = new Map((clientRows || []).map(row => [String(row.id), String(row.commercial_id || "")]));
    let maintenanceContracts = [];
    if (maintenanceSelected) {
      const [stored, visits, pilotage, paperRows] = await Promise.all([
        listEntretienContracts(orgId).catch(() => []),
        listEntretienVisits(orgId).catch(() => []),
        listEntretienPilotage(orgId).catch(() => []),
        serviceRequest(
          `/rest/v1/crm_state?select=state_value&organization_id=eq.${encodeURIComponent(orgId)}&state_key=eq.mkl-contracts&limit=1`
        ).catch(() => []),
      ]);
      const dueByClient = new Map((pilotage || []).map(row => [String(row.client_id), row.next_due_on || ""]));
      const paper = (Array.isArray(paperRows?.[0]?.state_value) ? paperRows[0].state_value : [])
        .filter(row => row && !isDemoOrgRecord("mkl-contracts", row))
        .map(row => ({
          id: `paper:${row.id}`,
          client_id: row.clientId || "",
          amount: row.amount,
          start_on: row.startDate || "",
          next: row.next || "",
        }));
      const storedIds = new Set((stored || []).map(row => String(row.client_id || "")).filter(Boolean));
      maintenanceContracts = contractsPlacedInPeriod(
        [
          ...(stored || []).map(row => ({ ...row, next_due_on: dueByClient.get(String(row.client_id)) || "" })),
          ...paper.filter(row => !row.client_id || !storedIds.has(String(row.client_id))),
        ],
        { from, to, visits }
      );
    }
    let opportunities = visibleProspects(opportunityRows || []);
    const privateOwners = await loadPrivateAgendaOwnerIds(orgId);
    let appointments = (appointmentRows || [])
      .filter(row => visibleAgendaRowForViewer(row, null, auth.profile, privateOwners))
      .map(row => ({
        id: row.id,
        prospectName: row.prospect_name,
        city: row.city,
        start: row.starts_at,
        status: row.status,
        commercial_id: row.commercial_id,
        created_by: row.created_by,
      }));

    devis = filterDevisByPeriod(devis, from, to);
    if (activity) {
      devis = filterByActivity(devis, activity, ["label", "client"]);
      clients = filterByActivity(clients, activity, ["projectType", "install", "name"]);
      opportunities = filterByActivity(opportunities, activity, ["project_type", "name", "stage"]);
    }

    // Agence : placeholder org unique MKL pour l’instant
    if (!isOrganizationAgency(agency)) {
      devis = [];
      clients = [];
      opportunities = [];
      appointments = [];
      maintenanceContracts = [];
    }

    let commercials = [];
    if (canRank) {
      if (canViewAllClients(auth.profile)) {
        const rows = await serviceRequest(
          `/rest/v1/profiles?select=id,full_name,email,role&organization_id=eq.${encodeURIComponent(orgId)}&active=eq.true&role=in.("Commercial","Responsable commercial","Admin VIP","Superadmin","Admin second","Direction","Secrétariat")&order=full_name.asc`
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

    const ranking = canRank
      ? computeCommercialRanking({
          commercials,
          devis,
          clients,
          prospects: opportunities,
          appointments,
        })
      : [];

    const scopedContracts = commercialId
      ? maintenanceContracts.filter(row => ownerByClient.get(String(row.client_id)) === String(commercialId))
      : maintenanceContracts;
    const metrics = computeCommercialDashboard({
      devis: commercialId ? devis.filter(row => belongsToCommercial(row, commercialId)) : devis,
      clients: commercialId ? clients.filter(row => belongsToCommercial(row, commercialId)) : clients,
      prospects: commercialId ? opportunities.filter(row => belongsToCommercial(row, commercialId)) : opportunities,
      appointments: commercialId ? appointments.filter(row => belongsToCommercial(row, commercialId)) : appointments,
    });
    if (maintenanceSelected) {
      metrics.caSigne = sumContractAmounts(scopedContracts);
      metrics.caSigneTtc = maintenanceTtc(metrics.caSigne);
      metrics.maintenanceContractCount = scopedContracts.length;
    }
    const ranked = maintenanceSelected ? addContractCaToRanking(ranking, scopedContracts, ownerByClient) : ranking;

    return Response.json({
      metrics,
      ranking: ranked,
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
