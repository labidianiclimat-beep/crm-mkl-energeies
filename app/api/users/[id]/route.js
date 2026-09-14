import { requireApiSession, canInviteUsers } from "../../../lib/api-auth";
import { ACTIVITY_ACTIONS, modulesEqual } from "../../../lib/activity-logs";
import { actorFromAuth, logActivity } from "../../../lib/log-activity";
import { isKnownRole, normalizeRoleLabel } from "../../../lib/roles";
import { serviceRequest, serviceRoleConfigured, upsertProfile } from "../../../lib/supabase-server";

export const runtime = "nodejs";

async function loadProfile(id) {
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,organization_id,full_name,email,role,modules,manager,active&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function PATCH(request, { params }) {
  try {
    const auth = await requireApiSession(request, { action: "invite_users" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canInviteUsers(auth.profile)) {
      return Response.json({ error: "Modification réservée aux administrateurs." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const existing = await loadProfile(id);
    if (!existing || existing.organization_id !== auth.profile.organization_id) {
      return Response.json({ error: "Utilisateur introuvable." }, { status: 404 });
    }

    const body = await request.json();
    const nextRole = body.role != null ? normalizeRoleLabel(body.role) : existing.role;
    if (!isKnownRole(nextRole)) {
      return Response.json({ error: "Rôle utilisateur inconnu." }, { status: 400 });
    }
    const nextModules = Array.isArray(body.modules) ? body.modules : existing.modules || [];
    const nextName = body.name != null ? String(body.name).trim() : existing.full_name;
    const nextManager = body.manager != null ? String(body.manager) : existing.manager || "";

    await upsertProfile({
      id: existing.id,
      organization_id: existing.organization_id,
      full_name: nextName,
      email: existing.email,
      role: nextRole,
      modules: nextModules,
      manager: nextManager,
      active: existing.active,
      updated_at: new Date().toISOString(),
    });

    const actor = actorFromAuth(auth);
    if (existing.role !== nextRole) {
      await logActivity({
        ...actor,
        action: ACTIVITY_ACTIONS.USER_ROLE_CHANGE,
        module: "Utilisateurs",
        entityType: "user",
        entityId: existing.id,
        entityLabel: nextName || existing.email,
        oldValue: { role: existing.role },
        newValue: { role: nextRole },
      });
    }
    if (!modulesEqual(existing.modules, nextModules)) {
      await logActivity({
        ...actor,
        action: ACTIVITY_ACTIONS.USER_PERMISSIONS_CHANGE,
        module: "Utilisateurs",
        entityType: "user",
        entityId: existing.id,
        entityLabel: nextName || existing.email,
        oldValue: { modules: existing.modules || [] },
        newValue: { modules: nextModules },
      });
    }

    return Response.json({
      user: {
        id: existing.id,
        name: nextName,
        email: existing.email,
        role: nextRole,
        modules: nextModules,
        manager: nextManager,
      },
    });
  } catch (error) {
    console.error("User update error", error.message);
    return Response.json({ error: "Mise à jour utilisateur impossible." }, { status: 502 });
  }
}
