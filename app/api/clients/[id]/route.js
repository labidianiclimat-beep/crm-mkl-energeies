import { requireApiSession } from "../../../lib/api-auth";
import { ACTIVITY_ACTIONS, clientDiff, clientLabel } from "../../../lib/activity-logs";
import {
  canAssignClientCommercial,
  canViewAllClients,
  clientToUi,
  findClientDuplicates,
  formToClientRecord,
  validateClientPayload,
} from "../../../lib/clients";
import { actorFromAuth, logActivity } from "../../../lib/log-activity";
import { loadTeamMemberIds } from "../../../lib/team-scope";
import { canAccessScopedRow } from "../../../lib/scoping";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

const SELECT =
  "id,organization_id,type_client,civilite,nom,prenom,raison_sociale,adresse,complement_adresse,code_postal,ville,telephone,telephone_secondaire,email,origine_lead,statut,commercial_id,notes,project_type,install,consent,created_at,updated_at,created_by";

async function canAccessRow(profile, userId, row) {
  if (!row) return false;
  const teamIds = await loadTeamMemberIds(profile, userId);
  return canAccessScopedRow(profile, userId, row, teamIds || []);
}

async function loadOne(id) {
  const rows = await serviceRequest(
    `/rest/v1/clients?select=${SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return rows?.[0] || null;
}

async function withCommercialName(row) {
  if (!row?.commercial_id) return row;
  const profiles = await serviceRequest(
    `/rest/v1/profiles?select=id,full_name,email&id=eq.${encodeURIComponent(row.commercial_id)}&limit=1`
  );
  return {
    ...row,
    commercial_name: profiles?.[0]?.full_name || profiles?.[0]?.email || "",
  };
}

export async function GET(_request, { params }) {
  try {
    const auth = await requireApiSession(_request, { module: "Clients" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const row = await loadOne(id);
    if (!row || !(await canAccessRow(auth.profile, auth.user.id, row))) {
      return Response.json({ error: "Client introuvable ou accès refusé." }, { status: 404 });
    }
    return Response.json({ client: clientToUi(await withCommercialName(row)) });
  } catch (error) {
    console.error("Client get error", error.message);
    return Response.json({ error: "Impossible de charger le client." }, { status: 502 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Clients" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const existing = await loadOne(id);
    if (!existing || !(await canAccessRow(auth.profile, auth.user.id, existing))) {
      return Response.json({ error: "Client introuvable ou accès refusé." }, { status: 404 });
    }

    const body = await request.json();
    const forceDuplicate = Boolean(body.forceDuplicate);
    const record = formToClientRecord(
      { ...clientToUi(existing), ...body },
      {
        organizationId: auth.profile.organization_id,
        createdBy: existing.created_by,
        defaultCommercialId: existing.commercial_id,
      }
    );
    delete record.created_by;
    delete record.created_at;
    record.organization_id = existing.organization_id;

    if (canViewAllClients(auth.profile)) {
      // attribution libre
    } else if (canAssignClientCommercial(auth.profile)) {
      const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
      const allowed = new Set((teamIds || [auth.user.id]).map(String));
      if (!allowed.has(String(record.commercial_id || ""))) {
        record.commercial_id = existing.commercial_id || auth.user.id;
      }
    } else {
      record.commercial_id = existing.commercial_id || auth.user.id;
    }

    const errors = validateClientPayload(record);
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    const orgClients = await serviceRequest(
      `/rest/v1/clients?select=${SELECT}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`
    );
    const duplicates = findClientDuplicates(orgClients || [], record, { excludeId: id });
    if (duplicates.length && !forceDuplicate) {
      return Response.json({
        error: "Doublon potentiel détecté.",
        duplicates: duplicates.map(row => ({
          id: row.id,
          name: `${row.prenom || ""} ${row.nom || ""}`.trim() || row.raison_sociale || row.email,
          reasons: row._duplicateReasons,
        })),
      }, { status: 409 });
    }

    const rows = await serviceRequest(`/rest/v1/clients?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: record,
    });
    const updated = rows?.[0];
    const diff = clientDiff(existing, updated || record);
    if (diff.changed) {
      await logActivity({
        ...actorFromAuth(auth),
        action: ACTIVITY_ACTIONS.CLIENT_UPDATE,
        module: "Clients",
        entityType: "client",
        entityId: id,
        entityLabel: clientLabel(updated || existing),
        oldValue: diff.oldValue,
        newValue: diff.newValue,
      });
    }
    return Response.json({ client: clientToUi(await withCommercialName(updated)) });
  } catch (error) {
    console.error("Client update error", error.message);
    return Response.json({ error: error.message || "Mise à jour impossible." }, { status: 502 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Clients" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }
    if (!canViewAllClients(auth.profile) || !["Admin VIP", "Admin second"].includes(auth.profile.role)) {
      return Response.json({ error: "Suppression réservée aux administrateurs." }, { status: 403 });
    }

    const { id } = await params;
    const existing = await loadOne(id);
    if (!existing || existing.organization_id !== auth.profile.organization_id) {
      return Response.json({ error: "Client introuvable." }, { status: 404 });
    }

    await serviceRequest(`/rest/v1/clients?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    await logActivity({
      ...actorFromAuth(auth),
      action: ACTIVITY_ACTIONS.CLIENT_DELETE,
      module: "Clients",
      entityType: "client",
      entityId: id,
      entityLabel: clientLabel(existing),
      oldValue: {
        email: existing.email,
        statut: existing.statut,
        commercial_id: existing.commercial_id,
      },
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Client delete error", error.message);
    return Response.json({ error: "Suppression impossible." }, { status: 502 });
  }
}
