import { exchangeGoogleCode, encryptSecret, googleOAuthConfigured } from "../../../../lib/google-calendar";
import {
  clearedStateCookie,
  consumeFilter,
  preConsumeGate,
  readStateCookie,
  safeRedirectPath,
  validateConsumedState,
  validateGrantedScopes,
} from "../../../../lib/oauth-state";
import { serviceRequest } from "../../../../lib/supabase-server";

export const runtime = "nodejs";

/**
 * Portées sans lesquelles la connexion n'a pas d'intérêt. Google peut en
 * accorder moins que demandé si l'utilisateur décoche une case : accepter la
 * connexion dans ce cas laisserait une synchronisation qui échoue en silence.
 */
const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export async function GET(request) {
  const url = new URL(request.url);
  const origin = process.env.APP_PUBLIC_URL || `${url.protocol}//${url.host}`;
  const secure = url.protocol === "https:";

  /**
   * Toutes les sorties effacent le cookie et restent indifférenciées côté
   * navigateur. Le motif précis est journalisé, jamais renvoyé : le distinguer
   * dans la réponse aiderait à deviner si un jeton existe.
   */
  function refuser(motif, etiquette = "invalid") {
    console.error(`google oauth refusé : ${motif}`);
    return new Response(null, {
      status: 302,
      headers: { Location: `${origin}/?google=${etiquette}`, "Set-Cookie": clearedStateCookie({ secure }) },
    });
  }

  if (url.searchParams.get("error") || !url.searchParams.get("code")) {
    return refuser("retour sans code", "denied");
  }
  if (!googleOAuthConfigured()) {
    return refuser("configuration absente", "missing");
  }

  // Cookie et paramètre `state` d'abord, consommation du jeton ensuite. Dans
  // l'autre ordre, un appel sans cookie valide pourrait consommer le jeton
  // d'une connexion légitime et la faire échouer.
  const porte = preConsumeGate({
    stateParam: url.searchParams.get("state"),
    cookieValue: readStateCookie(request.headers.get("cookie")),
    purpose: "calendar",
  });
  if (!porte.ok) return refuser(porte.reason);

  // Une seule instruction : marquage et condition sont indissociables, donc
  // deux retours simultanés ne peuvent pas réussir tous les deux.
  let consommes;
  try {
    consommes = await serviceRequest(
      `/rest/v1/google_oauth_states?${consumeFilter(porte.nonceHash)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: { consumed_at: new Date().toISOString() },
      }
    );
  } catch {
    return refuser("consommation du jeton impossible", "error");
  }

  const record = Array.isArray(consommes) ? consommes[0] : null;
  if (!record) return refuser("jeton inconnu, expiré ou déjà consommé");

  const profils = await serviceRequest(
    `/rest/v1/profiles?select=id,organization_id,active,onboarding_completed_at&id=eq.${encodeURIComponent(record.user_id)}&limit=1`
  ).catch(() => []);

  const verdict = validateConsumedState({
    record,
    expectedPurpose: "calendar",
    profile: profils?.[0],
  });
  if (!verdict.ok) return refuser(verdict.reason);

  try {
    const tokens = await exchangeGoogleCode(url.searchParams.get("code"), request);

    const portees = validateGrantedScopes(tokens.scope, REQUIRED_SCOPES);
    if (!portees.ok) return refuser(`${portees.reason} : ${portees.missing.length} manquante(s)`, "scope");

    const userInfo = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }).then(res => res.json()).catch(() => ({}));

    // Identité reprise du jeton vérifié, jamais de l'URL.
    const existing = await serviceRequest(
      `/rest/v1/google_calendar_accounts?select=id,refresh_token_enc,calendar_id&user_id=eq.${encodeURIComponent(verdict.userId)}&limit=1`
    ).catch(() => []);
    const previous = existing?.[0];

    await serviceRequest("/rest/v1/google_calendar_accounts?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: {
        organization_id: verdict.organizationId,
        user_id: verdict.userId,
        google_email: userInfo.email || null,
        calendar_id: previous?.calendar_id || "primary",
        access_token_enc: encryptSecret(tokens.access_token),
        // Google ne renvoie un jeton de rafraîchissement qu'au premier accord.
        // Sans ce repli, une reconnexion effacerait celui déjà en place.
        refresh_token_enc: tokens.refresh_token
          ? encryptSecret(tokens.refresh_token)
          : previous?.refresh_token_enc || "",
        token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
        scope: tokens.scope || "",
        status: "connected",
        last_error: null,
        updated_at: new Date().toISOString(),
      },
    });

    const retour = safeRedirectPath(record.redirect_path) || "/";
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${origin}${retour}${retour.includes("?") ? "&" : "?"}google=connected`,
        "Set-Cookie": clearedStateCookie({ secure }),
      },
    });
  } catch (error) {
    // Message court : un message complet peut citer une réponse de Google.
    return refuser(String(error.message || "inconnu").slice(0, 64), "error");
  }
}
