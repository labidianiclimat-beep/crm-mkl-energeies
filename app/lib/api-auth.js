import { getProfileForToken } from "./supabase-server";
import { canAccessApiModule, canPerformAction, isAdminRole } from "./permissions";
import { withUserPreview } from "./user-preview-server";

export function readBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export function profileIsActivated(profile) {
  return Boolean(profile?.active && profile?.onboarding_completed_at);
}

export async function requireApiSession(request, { module = null, action = null, allowPendingActivation = false } = {}) {
  const accessToken = readBearerToken(request);
  if (!accessToken) {
    return { ok: false, status: 401, error: "Session expirée. Reconnectez-vous avec votre email et votre PIN." };
  }

  const { user, profile: rawProfile } = await getProfileForToken(accessToken);
  if (!user?.id || !rawProfile) {
    return { ok: false, status: 401, error: "Profil utilisateur introuvable." };
  }

  const profile = await withUserPreview(rawProfile, request);
  const scopedUser = profile.previewUserId ? { ...user, id: profile.previewUserId } : user;

  if (!allowPendingActivation && !rawProfile.onboarding_completed_at) {
    return { ok: false, status: 403, error: "Activation du compte requise." };
  }

  if (!allowPendingActivation && !rawProfile.active) {
    return { ok: false, status: 403, error: "Compte inactif." };
  }

  if (module && !canAccessApiModule(profile, module)) {
    return { ok: false, status: 403, error: "Accès refusé à ce module." };
  }

  if (action && !canPerformAction(profile, action)) {
    return { ok: false, status: 403, error: "Action non autorisée." };
  }

  return { ok: true, user: scopedUser, profile, accessToken, realUserId: user.id };
}

export function canInviteUsers(profile) {
  return canPerformAction(profile, "invite_users");
}

export function canSendMail(profile) {
  return canPerformAction(profile, "send_mail");
}

export { isAdminRole };
