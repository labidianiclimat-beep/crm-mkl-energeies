import { requireApiSession } from "../../lib/api-auth";
import { ACTIVITY_ACTIONS, clientLabel } from "../../lib/activity-logs";
import {
  canAssignClientCommercial,
  canViewAllClients,
  clientToUi,
  findClientDuplicates,
  formToClientRecord,
  validateClientPayload,
} from "../../lib/clients";
import { actorFromAuth, logActivity } from "../../lib/log-activity";
import { loadTeamMemberIds } from "../../lib/team-scope";
import { commercialScopeQuery } from "../../lib/team-scope";
import { serviceRequest, serviceRoleConfigured } from "../../lib/supabase-server";

export const runtime = "nodejs";

const SELECT =
  "id,organization_id,type_client,civilite,nom,prenom,raison_sociale,adresse,complement_adresse,code_postal,ville,telephone,telephone_secondaire,email,origine_lead,statut,commercial_id,notes,project_type,install,consent,created_at,updated_at,created_by";

async function loadCommercialNames(rows) {
  const ids = [...new Set(rows.map(row => row.commercial_id).filter(Boolean))];
  if (!ids.length) return rows;
  const profiles = await serviceRequest(
    `/rest/v1/profiles?select=id,full_name,email&id=in.(${ids.map(id => `"${id}"`).join(",")})`
  );
  const map = Object.fromEntries((profiles || []).map(profile => [profile.id, profile.full_name || profile.email]));
  return rows.map(row => ({ ...row, commercial_name: map[row.commercial_id] || "" }));
}

export async function GET(request) {
  try {
    const auth = await requireApiSession(request, { module: "Clients" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const orgId = auth.profile.organization_id;
    let path = `/rest/v1/clients?select=${SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&order=updated_at.desc`;
    path += await commercialScopeQuery(auth.profile, auth.user.id);

    const rows = await serviceRequest(path);
    const withNames = await loadCommercialNames(rows || []);
    return Response.json({ clients: withNames.map(clientToUi) });
  } catch (error) {
    console.error("Clients list error", error.message);
    return Response.json({ error: "Impossible de charger les clients." }, { status: 502 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireApiSession(request, { module: "Clients" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const body = await request.json();
    const forceDuplicate = Boolean(body.forceDuplicate);
    const defaultCommercialId = canAssignClientCommercial(auth.profile) ? null : auth.user.id;
    const record = formToClientRecord(body, {
      organizationId: auth.profile.organization_id,
      createdBy: auth.user.id,
      defaultCommercialId: body.commercialId || body.commercial_id || defaultCommercialId || auth.user.id,
    });

    if (canViewAllClients(auth.profile)) {
      // attribution libre dans l’org
    } else if (canAssignClientCommercial(auth.profile)) {
      const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
      const allowed = new Set((teamIds || [auth.user.id]).map(String));
      if (!allowed.has(String(record.commercial_id || ""))) {
        record.commercial_id = auth.user.id;
      }
    } else {
      record.commercial_id = auth.user.id;
    }

    const errors = validateClientPayload(record);
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    const existing = await serviceRequest(
      `/rest/v1/clients?select=${SELECT}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`
    );
    const duplicates = findClientDuplicates(existing || [], record);
    if (duplicates.length && !forceDuplicate) {
      return Response.json({
        error: "Doublon potentiel détecté.",
        duplicates: duplicates.map(row => ({
          id: row.id,
          name: `${row.prenom || ""} ${row.nom || ""}`.trim() || row.raison_sociale || row.email,
          email: row.email,
          telephone: row.telephone || row.telephone_secondaire,
          reasons: row._duplicateReasons,
        })),
      }, { status: 409 });
    }

    record.created_at = new Date().toISOString();
    const rows = await serviceRequest("/rest/v1/clients", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: record,
    });
    const created = rows?.[0];
    const [ui] = await loadCommercialNames([created]);
    await logActivity({
      ...actorFromAuth(auth),
      action: ACTIVITY_ACTIONS.CLIENT_CREATE,
      module: "Clients",
      entityType: "client",
      entityId: created?.id,
      entityLabel: clientLabel(created),
      newValue: {
        statut: created?.statut,
        commercial_id: created?.commercial_id,
        email: created?.email,
      },
    });
    return Response.json({ client: clientToUi(ui) }, { status: 201 });
  } catch (error) {
    console.error("Client create error", error.message);
    return Response.json({ error: error.message || "Création client impossible." }, { status: 502 });
  }
}
