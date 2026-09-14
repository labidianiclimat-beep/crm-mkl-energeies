import { readBearerToken } from "../../../lib/api-auth";
import {
  getProfileByUserIdService,
  getUserFromAccessToken,
  serviceRoleConfigured,
} from "../../../lib/supabase-server";

export const runtime = "nodejs";

/**
 * Confirme qu'un compte authentifié dispose bien d'un accès CRM.
 *
 * Cette route ne crée aucun profil et n'active aucun compte : l'accès naît
 * d'une invitation (POST /api/users/invite) et l'activation passe uniquement
 * par /api/activation/complete, qui exige le PIN temporaire. Sans cela, toute
 * personne capable de s'inscrire sur le projet Supabase obtiendrait un accès.
 */
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

    if (!serviceRoleConfigured()) {
      return Response.json({
        error: "Configuration serveur incomplète (SUPABASE_SERVICE_ROLE_KEY). Contactez l’administrateur.",
      }, { status: 503 });
    }

    const profile = await getProfileByUserIdService(user.id);
    if (!profile) {
      return Response.json({
        error: "Aucun accès CRM n’est associé à ce compte. Demandez une invitation à votre administrateur.",
      }, { status: 403 });
    }

    return Response.json({
      ok: true,
      activationRequired: !profile.active || !profile.onboarding_completed_at,
    });
  } catch (error) {
    console.error("Bootstrap profile error", error.message);
    return Response.json({ error: "Vérification du profil impossible." }, { status: 502 });
  }
}
