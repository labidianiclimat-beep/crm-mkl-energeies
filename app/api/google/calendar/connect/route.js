import { requireApiSession } from "../../../../lib/api-auth";
import { googleAuthUrl, googleOAuthConfigured } from "../../../../lib/google-calendar";
import { createOAuthState, stateCookie } from "../../../../lib/oauth-state";
import { serviceRequest } from "../../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!googleOAuthConfigured()) {
    return Response.json({ error: "Google OAuth n’est pas configuré (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)." }, { status: 503 });
  }

  // Le navigateur ne transporte plus qu'un aléa opaque. L'identité est écrite
  // ici, côté serveur, et relue au retour : le paramètre `state` ne peut donc
  // plus désigner un utilisateur ou une organisation choisis par l'appelant.
  const { state, cookieValue, record } = createOAuthState({
    purpose: "calendar",
    userId: auth.user.id,
    organizationId: auth.profile.organization_id,
    redirectPath: "/",
  });

  try {
    await serviceRequest("/rest/v1/google_oauth_states", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: record,
    });
  } catch {
    // Aucune adresse d'autorisation n'est renvoyée si le jeton n'a pas pu être
    // enregistré : un parcours dont le retour serait invérifiable ne doit pas
    // commencer.
    return Response.json({ error: "Connexion Google indisponible." }, { status: 503 });
  }

  const secure = new URL(request.url).protocol === "https:";
  return Response.json(
    { url: googleAuthUrl({ state, request }) },
    { headers: { "Set-Cookie": stateCookie(cookieValue, { secure }) } }
  );
}
