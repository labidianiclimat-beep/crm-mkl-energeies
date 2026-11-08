import { requireApiSession, canInviteUsers } from "../../../lib/api-auth";
import { ACTIVITY_ACTIONS, modulesEqual } from "../../../lib/activity-logs";
import { actorFromAuth, logActivity } from "../../../lib/log-activity";
import { assertAssignableAccess, isKnownRole, normalizeRoleLabel, persistProfileAccess, roleModuleDefaults } from "../../../lib/roles";
import { parseSpecialties } from "../../../lib/prospect-dispatch";
import { issueAndSendLoginPin, mailErrorMessage } from "../../../lib/user-login-pin";
import { notifyCommercialManager } from "../../../lib/commercial-assignment-mail";
import { resolveUserDisplayName } from "../../../lib/users";
import { forgetOrgUsers } from "../../../lib/org-payload-cache";
import {
  ensureAuthUser,
  publicAppUrl,
  serviceRequest,
  serviceRoleConfigured,
  upsertProfile,
} from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const auth = await requireApiSession(request, { action: "invite_users" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canInviteUsers(auth.profile)) {
      return Response.json({ error: "Seuls les administrateurs peuvent inviter des utilisateurs." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant sur le serveur." }, { status: 503 });
    }

    const body = await request.json();
    const {
      email,
      role,
      modules = [],
      actions,
      manager = "",
      zone = "",
      specialties = [],
      postalCode = "",
      city = "",
      dispatchAvailable = true,
    } = body;
    const name = resolveUserDisplayName(body);
    if (!name || !email || !role || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Informations utilisateur invalides." }, { status: 400 });
    }

    const normalizedRole = normalizeRoleLabel(role);
    if (!isKnownRole(normalizedRole)) {
      return Response.json({ error: "Rôle utilisateur inconnu." }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    let previousProfile = null;
    try {
      const rows = await serviceRequest(
        `/rest/v1/profiles?select=id,role,modules,full_name,email,manager&email=eq.${encodeURIComponent(normalizedEmail)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}&limit=1`
      );
      previousProfile = rows?.[0] || null;
    } catch {
      previousProfile = null;
    }

    const requestedActions = actions !== undefined ? actions : modules;
    const assignment = assertAssignableAccess({
      actorRole: auth.profile.role,
      nextRole: normalizedRole,
      existingRole: previousProfile?.role,
      nextActions: requestedActions,
      existingActions: previousProfile?.modules,
    });
    if (!assignment.ok) {
      return Response.json({ error: assignment.error }, { status: 403 });
    }

    const resolvedModules = persistProfileAccess({
      modules: Array.isArray(modules) ? modules : roleModuleDefaults()[normalizedRole] || ["Tableau de bord"],
      actions,
      role: normalizedRole,
      existingModules: previousProfile?.modules,
      actorRole: auth.profile.role,
    });

    const authUser = await ensureAuthUser({
      email: normalizedEmail,
      metadata: { full_name: name },
      appMetadata: { role: normalizedRole, modules: resolvedModules },
    });

    const userId = authUser?.id;
    if (!userId) {
      return Response.json({ error: "Impossible de créer le compte utilisateur." }, { status: 502 });
    }

    await upsertProfile({
      id: userId,
      organization_id: auth.profile.organization_id,
      full_name: name,
      email: normalizedEmail,
      role: normalizedRole,
      modules: resolvedModules,
      manager,
      zone: String(zone || "").trim(),
      specialties: parseSpecialties(specialties),
      postal_code: String(postalCode || "").trim(),
      city: String(city || "").trim(),
      dispatch_available: dispatchAvailable !== false && dispatchAvailable !== "off",
      active: false,
      onboarding_completed_at: null,
      updated_at: new Date().toISOString(),
    });

    const actor = actorFromAuth(auth);
    await logActivity({
      ...actor,
      action: ACTIVITY_ACTIONS.USER_INVITE,
      module: "Utilisateurs",
      entityType: "user",
      entityId: userId,
      entityLabel: name || normalizedEmail,
      newValue: { role: normalizedRole, modules: resolvedModules, email: normalizedEmail },
    });
    if (previousProfile && previousProfile.role !== normalizedRole) {
      await logActivity({
        ...actor,
        action: ACTIVITY_ACTIONS.USER_ROLE_CHANGE,
        module: "Utilisateurs",
        entityType: "user",
        entityId: userId,
        entityLabel: name || normalizedEmail,
        oldValue: { role: previousProfile.role },
        newValue: { role: normalizedRole },
      });
    }
    if (previousProfile && !modulesEqual(previousProfile.modules, resolvedModules)) {
      await logActivity({
        ...actor,
        action: ACTIVITY_ACTIONS.USER_PERMISSIONS_CHANGE,
        module: "Utilisateurs",
        entityType: "user",
        entityId: userId,
        entityLabel: name || normalizedEmail,
        oldValue: { modules: previousProfile.modules || [] },
        newValue: { modules: resolvedModules },
      });
    }

    let managerNotice = { sent: false, skipped: true };
    try {
      managerNotice = await notifyCommercialManager({
        orgId: auth.profile.organization_id,
        commercial: {
          name,
          email: normalizedEmail,
          role: normalizedRole,
          zone: String(zone || "").trim(),
          city: String(city || "").trim(),
        },
        managerName: manager,
        previousManager: previousProfile?.manager || "",
        previousRole: previousProfile?.role || "",
      });
    } catch (error) {
      console.error("Commercial assignment mail error", error.message);
      managerNotice = { sent: false, error: "L’email au responsable commercial n’a pas pu être envoyé." };
    }

    let sent = false;
    let mailError = "";
    try {
      await issueAndSendLoginPin({
        userId,
        email: normalizedEmail,
        name,
        createdBy: auth.profile.id,
        publicUrl: publicAppUrl(new URL(request.url).origin),
        reason: "invite",
      });
      sent = true;
    } catch (error) {
      console.error("Invite mail error", error.message);
      mailError = mailErrorMessage(error);
    }

    forgetOrgUsers(auth.profile.organization_id);
    return Response.json({
      created: true,
      sent,
      userId,
      email: normalizedEmail,
      mailError: mailError || undefined,
      managerNotified: Boolean(managerNotice.sent),
      managerMailError: managerNotice.error || undefined,
    });
  } catch (error) {
    console.error("User create error", error.message);
    return Response.json({ error: "L’utilisateur n’a pas pu être créé." }, { status: 502 });
  }
}
