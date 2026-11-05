import { requireApiSession, canInviteUsers } from "../../../lib/api-auth";
import { ACTIVITY_ACTIONS, modulesEqual } from "../../../lib/activity-logs";
import { actorFromAuth, logActivity } from "../../../lib/log-activity";
import { assertAssignableAccess, isKnownRole, normalizeRoleLabel, persistProfileAccess } from "../../../lib/roles";
import { parseSpecialties } from "../../../lib/prospect-dispatch";
import { issueAndSendLoginPin, mailErrorMessage } from "../../../lib/user-login-pin";
import { notifyCommercialManager } from "../../../lib/commercial-assignment-mail";
import { resolveUserDisplayName, splitUserName } from "../../../lib/users";
import { forgetOrgUsers } from "../../../lib/org-payload-cache";
import {
  findUserByEmail,
  getProfileByEmailService,
  publicAppUrl,
  serviceRequest,
  serviceRoleConfigured,
  updateAuthUserAppMetadata,
  updateAuthUserEmail,
  upsertProfile,
} from "../../../lib/supabase-server";

export const runtime = "nodejs";

async function loadProfile(id) {
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,organization_id,full_name,email,role,modules,manager,active,zone,specialties,postal_code,city,dispatch_available&id=eq.${encodeURIComponent(id)}&limit=1`
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
    const nextRole = normalizeRoleLabel(body.role != null ? body.role : existing.role);
    if (!isKnownRole(nextRole)) {
      return Response.json({ error: "Rôle utilisateur inconnu." }, { status: 400 });
    }
    const requestedActions = body.actions !== undefined ? body.actions : body.modules;
    const assignment = assertAssignableAccess({
      actorRole: auth.profile.role,
      nextRole,
      existingRole: existing.role,
      nextActions: requestedActions,
      existingActions: existing.modules,
    });
    if (!assignment.ok) {
      return Response.json({ error: assignment.error }, { status: 403 });
    }
    const nextModules = persistProfileAccess({
      modules: body.modules !== undefined ? body.modules : existing.modules,
      actions: body.actions,
      role: nextRole,
      existingModules: existing.modules,
      actorRole: auth.profile.role,
    });
    const nextName = resolveUserDisplayName(body, existing.full_name);
    const nextManager = body.manager != null ? String(body.manager) : existing.manager || "";
    const nextZone = body.zone != null ? String(body.zone).trim() : existing.zone || "";
    const nextSpecialties = body.specialties != null ? parseSpecialties(body.specialties) : (existing.specialties || []);
    const nextPostalCode = body.postalCode != null || body.postal_code != null
      ? String(body.postalCode || body.postal_code || "").trim()
      : existing.postal_code || "";
    const nextCity = body.city != null ? String(body.city).trim() : existing.city || "";
    const nextDispatchAvailable = body.dispatchAvailable === undefined && body.dispatch_available === undefined
      ? existing.dispatch_available !== false
      : body.dispatchAvailable !== false && body.dispatch_available !== false;
    const requestedEmail = body.email != null ? String(body.email).trim().toLowerCase() : "";
    const nextEmail = requestedEmail || String(existing.email || "").trim().toLowerCase();
    const emailChanged = Boolean(requestedEmail && requestedEmail !== String(existing.email || "").trim().toLowerCase());
    const nextActive =
      body.active === undefined && body.actif === undefined && body.status === undefined
        ? existing.active
        : body.active === true ||
          body.active === "true" ||
          body.actif === true ||
          body.actif === "true" ||
          body.status === "Actif";

    if (String(existing.id) === String(auth.profile.id) && !nextActive) {
      return Response.json({ error: "Vous ne pouvez pas désactiver votre propre compte." }, { status: 400 });
    }

    if (emailChanged) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
        return Response.json({ error: "Adresse email invalide." }, { status: 400 });
      }
      const profileTaken = await getProfileByEmailService(nextEmail);
      if (profileTaken && String(profileTaken.id) !== String(existing.id)) {
        return Response.json({ error: "Cette adresse email appartient déjà à un utilisateur." }, { status: 409 });
      }
      const authTaken = await findUserByEmail(nextEmail);
      if (authTaken?.id && String(authTaken.id) !== String(existing.id)) {
        return Response.json({ error: "Cette adresse email appartient déjà à un compte de connexion." }, { status: 409 });
      }
      await updateAuthUserEmail(existing.id, nextEmail);
    }

    await updateAuthUserAppMetadata(existing.id, { role: nextRole, modules: nextModules }).catch(() => null);
    await upsertProfile({
      id: existing.id,
      organization_id: existing.organization_id,
      full_name: nextName,
      email: nextEmail,
      role: nextRole,
      modules: nextModules,
      manager: nextManager,
      zone: nextZone,
      specialties: nextSpecialties,
      postal_code: nextPostalCode,
      city: nextCity,
      dispatch_available: nextDispatchAvailable,
      active: nextActive,
      updated_at: new Date().toISOString(),
    });

    const actor = actorFromAuth(auth);
    if (emailChanged) {
      await logActivity({
        ...actor,
        action: ACTIVITY_ACTIONS.USER_EMAIL_CHANGE,
        module: "Utilisateurs",
        entityType: "user",
        entityId: existing.id,
        entityLabel: nextName || nextEmail,
        oldValue: { email: existing.email },
        newValue: { email: nextEmail },
      });
    }
    if (existing.role !== nextRole) {
      await logActivity({
        ...actor,
        action: ACTIVITY_ACTIONS.USER_ROLE_CHANGE,
        module: "Utilisateurs",
        entityType: "user",
        entityId: existing.id,
        entityLabel: nextName || nextEmail,
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
        entityLabel: nextName || nextEmail,
        oldValue: { modules: existing.modules || [] },
        newValue: { modules: nextModules },
      });
    }
    if (Boolean(existing.active) !== Boolean(nextActive)) {
      await logActivity({
        ...actor,
        action: ACTIVITY_ACTIONS.USER_ACTIVE_CHANGE,
        module: "Utilisateurs",
        entityType: "user",
        entityId: existing.id,
        entityLabel: nextName || nextEmail,
        oldValue: { active: Boolean(existing.active) },
        newValue: { active: Boolean(nextActive) },
      });
    }

    let managerNotice = { sent: false, skipped: true };
    try {
      managerNotice = await notifyCommercialManager({
        orgId: existing.organization_id,
        commercial: {
          name: nextName,
          email: nextEmail,
          role: nextRole,
          zone: nextZone,
          city: nextCity,
        },
        managerName: nextManager,
        previousManager: existing.manager || "",
        previousRole: existing.role || "",
      });
    } catch (error) {
      console.error("Commercial assignment mail error", error.message);
      managerNotice = { sent: false, error: "L’email au responsable commercial n’a pas pu être envoyé." };
    }

    let pinSent = false;
    let mailError = "";
    if (emailChanged) {
      try {
        await issueAndSendLoginPin({
          userId: existing.id,
          email: nextEmail,
          name: nextName,
          createdBy: auth.profile.id,
          publicUrl: publicAppUrl(new URL(request.url).origin),
          reason: "email-change",
        });
        pinSent = true;
      } catch (error) {
        console.error("Email change mail error", error.message);
        mailError = mailErrorMessage(error);
      }
    }

    const splitName = splitUserName(nextName);
    forgetOrgUsers(auth.profile.organization_id);
    return Response.json({
      user: {
        id: existing.id,
        name: nextName,
        firstName: splitName.firstName,
        lastName: splitName.lastName,
        email: nextEmail,
        role: nextRole,
        modules: nextModules,
        manager: nextManager,
        active: Boolean(nextActive),
        status: nextActive ? "Actif" : "Inactif",
      },
      emailChanged,
      pinSent,
      mailError: mailError || undefined,
      managerNotified: Boolean(managerNotice.sent),
      managerMailError: managerNotice.error || undefined,
    });
  } catch (error) {
    console.error("User update error", error.message);
    if (/already been registered|email.*exists|duplicate/i.test(error.message || "")) {
      return Response.json({ error: "Cette adresse email appartient déjà à un compte de connexion." }, { status: 409 });
    }
    return Response.json({ error: "Mise à jour utilisateur impossible." }, { status: 502 });
  }
}
