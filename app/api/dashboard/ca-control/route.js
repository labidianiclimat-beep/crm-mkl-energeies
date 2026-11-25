import { requireApiSession } from "../../../lib/api-auth";
import { buildCaControl, canAccessCaControl, canDepositSignedOrder, isSignedOrderStatus } from "../../../lib/ca-control";
import { extraOf, isUuid } from "../../../lib/prospects";
import { resolveScopedCommercialIds } from "../../../lib/scoping";
import { listAllRows, listAllRowsByIds } from "../../../lib/supabase-list";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";
import { loadTeamMemberIds } from "../../../lib/team-scope";

export const runtime = "nodejs";

const APPOINTMENT_SELECT = "id,organization_id,opportunity_id,prospect_name,city,starts_at,commercial_id,status,extra,updated_at";
const PROSPECT_SELECT = "id,name,city,extra";
const QUOTE_SELECT = "id,kind,numero_devis,client_id,client_name,commercial_id,statut,date_creation,total_ht,total_ttc,extra,created_at";
const HISTORY_SELECT = "id,appointment_id,field,new_value,created_at";

function dayParam(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
}

export async function GET(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canAccessCaControl(auth.profile)) {
      return Response.json({ error: "Contrôle du chiffre d’affaires réservé au Superadmin, à l’Admin VIP et au responsable commercial." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const url = new URL(request.url);
    const from = dayParam(url.searchParams.get("from"));
    const to = dayParam(url.searchParams.get("to"));
    const requestedCommercial = String(url.searchParams.get("commercialId") || "");
    if (requestedCommercial && !isUuid(requestedCommercial)) {
      return Response.json({ error: "Commercial invalide." }, { status: 400 });
    }
    const manager = String(url.searchParams.get("manager") || "").trim();
    const deposit = ["depose", "non"].includes(url.searchParams.get("deposit") || "") ? url.searchParams.get("deposit") : "";
    const query = String(url.searchParams.get("q") || "").trim();
    const orgId = auth.profile.organization_id;
    const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
    const scoped = resolveScopedCommercialIds(auth.profile, auth.user.id, teamIds || []);
    if (requestedCommercial && scoped && !scoped.map(String).includes(requestedCommercial)) {
      return Response.json({ error: "Ce commercial est hors de votre équipe." }, { status: 403 });
    }

    const appointments = await listAllRows(
      `/rest/v1/commercial_appointments?select=${APPOINTMENT_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&status=eq.${encodeURIComponent("Commande signée")}&order=starts_at.desc`
    );
    const visible = (appointments || []).filter(row => {
      if (!isSignedOrderStatus(row.status)) return false;
      if (!scoped) return true;
      return scoped.map(String).includes(String(row.commercial_id || ""));
    });

    const prospectIds = [...new Set(visible.map(row => row.opportunity_id).filter(isUuid))];
    const appointmentIds = visible.map(row => row.id).filter(isUuid);
    const ownerIds = [...new Set(visible.map(row => row.commercial_id).filter(isUuid))];
    const [prospects, history, profiles] = await Promise.all([
      prospectIds.length
        ? listAllRowsByIds(
          `/rest/v1/commercial_opportunities?select=${PROSPECT_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}`,
          prospectIds
        )
        : [],
      appointmentIds.length
        ? listAllRowsByIds(
          `/rest/v1/appointment_history?select=${HISTORY_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&field=eq.status`,
          appointmentIds,
          { column: "appointment_id", idKey: "id" }
        )
        : [],
      ownerIds.length
        ? listAllRowsByIds(
          `/rest/v1/profiles?select=id,full_name,email,role,manager&organization_id=eq.${encodeURIComponent(orgId)}`,
          ownerIds
        )
        : [],
    ]);

    const clientIds = [...new Set(prospects.flatMap(row => {
      const extra = extraOf(row);
      return [extra.clientId, extra.client_id].filter(isUuid);
    }))];
    const quotePath = `/rest/v1/devis?select=${QUOTE_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&kind=eq.Devis`;
    const byClient = clientIds.length ? await listAllRowsByIds(quotePath, clientIds, { column: "client_id", idKey: "id" }) : [];
    const byOwner = ownerIds.length ? await listAllRowsByIds(quotePath, ownerIds, { column: "commercial_id", idKey: "id" }) : [];
    const quotes = [...new Map([...byClient, ...byOwner].map(row => [row.id, row])).values()];

    const built = buildCaControl({
      appointments: visible.map(row => ({
        id: row.id,
        prospectId: row.opportunity_id,
        prospectName: row.prospect_name,
        city: row.city,
        start: row.starts_at,
        commercialId: row.commercial_id,
        status: row.status,
        extra: row.extra,
      })),
      prospects: prospects.map(row => {
        const extra = extraOf(row);
        return { id: row.id, name: row.name, city: row.city, clientId: extra.clientId || extra.client_id || "", extra };
      }),
      quotes,
      history,
      profiles: (profiles || []).map(row => ({
        id: row.id,
        name: row.full_name || row.email || "Commercial",
        role: row.role,
        manager: row.manager || "",
      })),
      from,
      to,
      commercialId: requestedCommercial,
      manager,
      deposit,
      query,
    });

    const commercials = [...peopleFrom(profiles)].sort((left, right) => left.name.localeCompare(right.name, "fr"));
    const managers = [...new Set(commercials.map(user => String(user.manager || "").trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "fr"));

    return Response.json({
      ...built,
      commercials,
      managers,
      canDeposit: canDepositSignedOrder(auth.profile),
      scope: scoped ? "team" : "organization",
    });
  } catch (error) {
    console.error("CA control error", error.message);
    return Response.json({ error: "Impossible de charger le contrôle du chiffre d’affaires." }, { status: 502 });
  }
}

function peopleFrom(profiles) {
  const map = new Map();
  for (const row of profiles || []) {
    if (!row?.id) continue;
    map.set(String(row.id), {
      id: row.id,
      name: row.full_name || row.email || "Commercial",
      manager: row.manager || "",
    });
  }
  return map.values();
}
