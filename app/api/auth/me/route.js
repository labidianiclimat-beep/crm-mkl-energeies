import { readBearerToken } from "../../../lib/api-auth";
import { listProfilePermissions, resolveAllowedModules, roleModuleDefaults } from "../../../lib/permissions";
import { normalizeRoleLabel } from "../../../lib/roles";
import { withUserPreview } from "../../../lib/user-preview-server";
import { getProfileForToken } from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const accessToken = readBearerToken(request);
    if (!accessToken) {
      return Response.json({ authenticated: false, error: "Session requise." }, { status: 401 });
    }

    const { user, profile: rawProfile } = await getProfileForToken(accessToken);
    if (!user?.id || !rawProfile) {
      return Response.json({ authenticated: false, error: "Profil utilisateur introuvable." }, { status: 401 });
    }

    const profile = await withUserPreview(rawProfile, request);
    const roleDefaults = roleModuleDefaults();
    return Response.json({
      authenticated: true,
      user: { id: user.id, email: user.email },
      profile: {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        role: normalizeRoleLabel(profile.role),
        modules: profile.modules,
        actions: profile.actions || [],
        active: rawProfile.active,
        onboarding_completed_at: rawProfile.onboarding_completed_at,
        manager: profile.manager,
        organization_id: profile.organization_id,
        previewRole: profile.previewRole || "",
        previewUserId: profile.previewUserId || "",
        previewUserName: profile.previewUserName || "",
        realRole: profile.realRole || normalizeRoleLabel(rawProfile.role),
        realUserId: profile.realUserId || rawProfile.id,
      },
      allowedModules: resolveAllowedModules(profile, roleDefaults),
      permissions: listProfilePermissions(profile),
      activationRequired: !rawProfile.onboarding_completed_at || !rawProfile.active,
    });
  } catch (error) {
    console.error("Auth me error", error.message);
    return Response.json({ authenticated: false, error: "Impossible de charger la session." }, { status: 500 });
  }
}
