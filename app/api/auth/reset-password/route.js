import { readBearerToken } from "../../../lib/api-auth";
import {
  getProfileByUserId,
  getProfileByUserIdService,
  getUserFromAccessToken,
  serviceRoleConfigured,
  updateUserPassword,
} from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const accessToken = readBearerToken(request);
    if (!accessToken) {
      return Response.json({ error: "Session requise." }, { status: 401 });
    }

    const user = await getUserFromAccessToken(accessToken);
    if (!user?.id) {
      return Response.json({ error: "Session invalide." }, { status: 401 });
    }

    // Le profil doit préexister : un changement de mot de passe ne crée pas
    // d'accès et n'active pas un compte, cela reste le rôle de l'invitation
    // puis de /api/activation/complete avec le PIN temporaire.
    let profile = await getProfileByUserId(user.id, accessToken).catch(() => null);
    if (!profile && serviceRoleConfigured()) {
      profile = await getProfileByUserIdService(user.id);
    }
    if (!profile) {
      return Response.json({
        error: "Aucun accès CRM n’est associé à ce compte. Demandez une invitation à votre administrateur.",
      }, { status: 403 });
    }

    const { password, confirmPassword } = await request.json();
    if (!password || !confirmPassword) {
      return Response.json({ error: "Mot de passe requis." }, { status: 400 });
    }
    if (password.length < 10) {
      return Response.json({ error: "Le mot de passe doit contenir au moins 10 caractères." }, { status: 400 });
    }
    if (password !== confirmPassword) {
      return Response.json({ error: "Les mots de passe ne correspondent pas." }, { status: 400 });
    }

    await updateUserPassword(accessToken, password);

    return Response.json({
      ok: true,
      activationRequired: !profile.active || !profile.onboarding_completed_at,
    });
  } catch (error) {
    console.error("Reset password error", error.message);
    return Response.json({ error: "Impossible de mettre à jour le mot de passe." }, { status: 502 });
  }
}
