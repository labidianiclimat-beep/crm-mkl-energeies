import {
  nextAttemptState,
  pinRecordUsableForLogin,
  verifyActivationPin,
} from "../../../lib/activation-pin";
import {
  completeProfileActivation,
  createSessionForEmail,
  ensureAuthUser,
  ensureProfileForUser,
  findUserByEmail,
  getLatestLoginPin,
  getProfileByUserIdService,
  patchActivationPin,
  serviceRoleConfigured,
} from "../../../lib/supabase-server";
import { ACTIVITY_ACTIONS } from "../../../lib/activity-logs";
import { logActivity } from "../../../lib/log-activity";

export const runtime = "nodejs";

const UNKNOWN_CREDENTIALS =
  "Identifiants incorrects ou code PIN inactif. Contactez votre administrateur si le problème persiste.";

export async function POST(request) {
  try {
    if (!serviceRoleConfigured()) {
      return Response.json({
        error: "Configuration serveur incomplète. Ajoutez SUPABASE_SERVICE_ROLE_KEY dans .env.local (local) ou dans Vercel (en ligne), puis redémarrez le serveur.",
      }, { status: 503 });
    }

    const { email, pin } = await request.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPin = String(pin || "").trim();

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return Response.json({ error: "Adresse email invalide." }, { status: 400 });
    }
    if (!/^\d{6}$/.test(normalizedPin)) {
      return Response.json({ error: "Le code PIN doit contenir 6 chiffres." }, { status: 400 });
    }

    // Même réponse qu'un PIN absent ou expiré : distinguer les deux cas
    // permettrait de reconstituer la liste des adresses enregistrées.
    let user = await findUserByEmail(normalizedEmail);
    if (!user?.id) {
      return Response.json({ error: UNKNOWN_CREDENTIALS }, { status: 401 });
    }

    const record = await getLatestLoginPin(user.id);
    const usable = pinRecordUsableForLogin(record);
    if (!usable.ok) {
      if (usable.reason === "locked") {
        return Response.json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429 });
      }
      return Response.json({ error: UNKNOWN_CREDENTIALS }, { status: 401 });
    }

    const pinOk = verifyActivationPin(normalizedPin, record.pin_hash, record.pin_salt);
    const attempt = nextAttemptState(record, pinOk);
    await patchActivationPin(record.id, pinOk ? { attempts: 0, locked_until: null } : attempt);

    if (!pinOk) {
      if (attempt.locked_until) {
        return Response.json({ error: "Trop de tentatives incorrectes. Connexion bloquée temporairement." }, { status: 429 });
      }
      return Response.json({ error: UNKNOWN_CREDENTIALS }, { status: 401 });
    }

    user = await ensureAuthUser({
      email: normalizedEmail,
      metadata: user.user_metadata || {},
    });

    let profile = await getProfileByUserIdService(user.id);
    if (!profile) {
      profile = await ensureProfileForUser(user);
    }
    if (!profile) {
      return Response.json({ error: "Profil utilisateur introuvable." }, { status: 502 });
    }

    if (!profile.onboarding_completed_at) {
      await completeProfileActivation(user.id);
    } else if (!profile.active) {
      return Response.json({ error: UNKNOWN_CREDENTIALS }, { status: 401 });
    }

    const session = await createSessionForEmail(normalizedEmail);
    await logActivity({
      organizationId: profile.organization_id,
      userId: user.id,
      userName: profile.full_name || normalizedEmail,
      action: ACTIVITY_ACTIONS.SESSION_LOGIN,
      module: "Connexion",
      entityType: "session",
      entityId: user.id,
      entityLabel: profile.full_name || normalizedEmail,
    });

    return Response.json({
      ok: true,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600),
      user: { id: user.id, email: normalizedEmail },
    });
  } catch (error) {
    console.error("PIN login error", error.message);
    if (/invalid api key|invalid jwt/i.test(error.message)) {
      return Response.json({
        error: "Clé Supabase invalide sur le serveur. Vérifiez SUPABASE_SERVICE_ROLE_KEY dans Vercel.",
      }, { status: 503 });
    }
    return Response.json({ error: "Connexion impossible pour le moment." }, { status: 502 });
  }
}
