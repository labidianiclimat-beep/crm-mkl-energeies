import { requireApiSession, canInviteUsers } from "../../../lib/api-auth";
import {
  generateActivationPin,
  hashActivationPin,
  PIN_TTL_MS,
} from "../../../lib/activation-pin";
import { ACTIVITY_ACTIONS, modulesEqual } from "../../../lib/activity-logs";
import { actorFromAuth, logActivity } from "../../../lib/log-activity";
import { isKnownRole, normalizeRoleLabel, roleModuleDefaults } from "../../../lib/roles";
import { sendMail } from "../../../lib/send-mail";
import {
  createActivationPinRecord,
  ensureAuthUser,
  invalidateActivePins,
  publicAppUrl,
  serviceRequest,
  serviceRoleConfigured,
  upsertProfile,
} from "../../../lib/supabase-server";

export const runtime = "nodejs";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[character]));
}

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

    const { name, email, role, modules = [], manager = "" } = await request.json();
    if (!name || !email || !role || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Informations utilisateur invalides." }, { status: 400 });
    }

    const normalizedRole = normalizeRoleLabel(role);
    if (!isKnownRole(normalizedRole)) {
      return Response.json({ error: "Rôle utilisateur inconnu." }, { status: 400 });
    }
    const resolvedModules = Array.isArray(modules) && modules.length
      ? modules
      : roleModuleDefaults()[normalizedRole] || ["Tableau de bord"];

    const publicUrl = publicAppUrl(new URL(request.url).origin);
    if (!publicUrl || /localhost|127\.0\.0\.1/i.test(publicUrl)) {
      return Response.json({ error: "APP_PUBLIC_URL non configurée pour la production." }, { status: 503 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    let previousProfile = null;
    try {
      const rows = await serviceRequest(
        `/rest/v1/profiles?select=id,role,modules,full_name,email&email=eq.${encodeURIComponent(normalizedEmail)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}&limit=1`
      );
      previousProfile = rows?.[0] || null;
    } catch {
      previousProfile = null;
    }

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
      active: false,
      onboarding_completed_at: null,
      updated_at: new Date().toISOString(),
    });

    await invalidateActivePins(userId);
    const pin = generateActivationPin();
    const { pin_hash, pin_salt } = hashActivationPin(pin);
    await createActivationPinRecord({
      user_id: userId,
      pin_hash,
      pin_salt,
      expires_at: new Date(Date.now() + PIN_TTL_MS).toISOString(),
      created_by: auth.profile.id,
    });

    const activationUrl = `${publicUrl}/activation`;
    await sendMail({
      to: normalizedEmail,
      subject: "Activation MKL Énergies CRM",
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#26375f">
        <div style="border-bottom:5px solid #ffdb62;padding-bottom:18px">
          <h1 style="color:#405fae;margin:0">MKL ÉNERGIES</h1>
          <p style="color:#737b86">Activation du compte CRM</p>
        </div>
        <h2>Bonjour ${escapeHtml(name)},</h2>
        <p>Votre compte a été préparé. Pour l’activer :</p>
        <ol>
          <li>Ouvrez le lien d’activation (confirmation de votre email)</li>
          <li>Saisissez le <b>PIN temporaire</b> ci-dessous</li>
          <li>Choisissez votre mot de passe et votre <b>PIN personnel</b> (connexion quotidienne)</li>
        </ol>
        <table style="width:100%;border-collapse:collapse;margin:18px 0">
          <tr><td style="padding:8px 0"><b>Identifiant :</b></td><td>${escapeHtml(normalizedEmail)}</td></tr>
          <tr><td style="padding:8px 0"><b>PIN temporaire :</b></td><td style="font-size:22px;letter-spacing:6px"><b>${escapeHtml(pin)}</b></td></tr>
          <tr><td style="padding:8px 0"><b>Profil :</b></td><td>${escapeHtml(normalizedRole)}</td></tr>
        </table>
        <p style="margin:28px 0"><a href="${escapeHtml(activationUrl)}" style="background:#405fae;color:white;text-decoration:none;padding:13px 20px;border-radius:8px">Activer mon compte</a></p>
        <p style="font-size:12px;color:#7e8795">Le PIN temporaire expire sous 24 h. Un simple clic sur un lien ne donne jamais accès au CRM : le PIN personnel reste obligatoire. En cas de perte du PIN personnel, un administrateur peut le réinitialiser.</p>
      </div>`,
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

    return Response.json({ sent: true, userId });
  } catch (error) {
    if (error.message === "MAIL_NOT_CONFIGURED") {
      return Response.json({ error: "Le service d’envoi d’emails n’est pas configuré." }, { status: 503 });
    }
    if (error.message === "ACTIVATION_PIN_PEPPER_MISSING") {
      return Response.json({
        error: "ACTIVATION_PIN_PEPPER doit être définie sur le serveur pour générer un PIN.",
      }, { status: 503 });
    }
    console.error("User invite error", error.message);
    return Response.json({ error: "L’invitation n’a pas pu être envoyée." }, { status: 502 });
  }
}
