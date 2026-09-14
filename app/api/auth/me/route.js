import { readBearerToken } from "../../../lib/api-auth";
import { listProfilePermissions, resolveAllowedModules, roleModuleDefaults } from "../../../lib/permissions";
import { getProfileForToken } from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const accessToken = readBearerToken(request);
    if (!accessToken) {
      return Response.json({ authenticated: false, error: "Session requise." }, { status: 401 });
    }

    const { user, profile } = await getProfileForToken(accessToken);
    if (!user?.id || !profile) {
      return Response.json({ authenticated: false, error: "Profil utilisateur introuvable." }, { status: 401 });
    }

    const roleDefaults = roleModuleDefaults();
    return Response.json({
      authenticated: true,
      user: { id: user.id, email: user.email },
      profile: {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        role: profile.role,
        modules: profile.modules,
        active: profile.active,
        onboarding_completed_at: profile.onboarding_completed_at,
        manager: profile.manager,
        organization_id: profile.organization_id,
      },
      allowedModules: resolveAllowedModules(profile, roleDefaults),
      permissions: listProfilePermissions(profile),
      activationRequired: !profile.onboarding_completed_at || !profile.active,
    });
  } catch (error) {
    console.error("Auth me error", error.message);
    return Response.json({ authenticated: false, error: "Impossible de charger la session." }, { status: 500 });
  }
}
