import { requireApiSession } from "../../../lib/api-auth";
import {
  hashActivationPin,
  LOGIN_PIN_TTL_MS,
  nextAttemptState,
  pinRecordUsable,
  validatePersonalPinChoice,
  verifyActivationPin,
} from "../../../lib/activation-pin";
import {
  completeProfileActivation,
  createActivationPinRecord,
  getLatestActivationPin,
  invalidateActivePins,
  patchActivationPin,
  updateUserPassword,
} from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const auth = await requireApiSession(request, { allowPendingActivation: true });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const {
      pin,
      personalPin,
      confirmPersonalPin,
      password,
      confirmPassword,
    } = await request.json();

    if (!pin || !password || !confirmPassword || !personalPin || !confirmPersonalPin) {
      return Response.json({ error: "PIN temporaire, PIN personnel et mot de passe requis." }, { status: 400 });
    }
    if (password.length < 10) {
      return Response.json({ error: "Le mot de passe doit contenir au moins 10 caractères." }, { status: 400 });
    }
    if (password !== confirmPassword) {
      return Response.json({ error: "Les mots de passe ne correspondent pas." }, { status: 400 });
    }
    const personalCheck = validatePersonalPinChoice(pin, personalPin, confirmPersonalPin);
    if (!personalCheck.ok) {
      return Response.json({ error: personalCheck.error }, { status: 400 });
    }
    if (auth.profile.onboarding_completed_at && auth.profile.active) {
      return Response.json({ error: "Ce compte est déjà activé." }, { status: 400 });
    }

    const record = await getLatestActivationPin(auth.user.id);
    const usable = pinRecordUsable(record);
    if (!usable.ok) {
      const messages = {
        used: "Ce PIN a déjà été utilisé.",
        expired: "Ce PIN a expiré. Demandez un nouveau code à votre administrateur.",
        locked: "Trop de tentatives. Réessayez plus tard.",
      };
      return Response.json({ error: messages[usable.reason] || "PIN invalide." }, { status: 403 });
    }

    const pinOk = verifyActivationPin(pin, record.pin_hash, record.pin_salt);
    const attempt = nextAttemptState(record, pinOk);
    await patchActivationPin(record.id, attempt);

    if (!pinOk) {
      if (attempt.locked_until) {
        return Response.json({ error: "Trop de tentatives incorrectes. Validation bloquée temporairement." }, { status: 429 });
      }
      return Response.json({ error: "Code PIN temporaire incorrect." }, { status: 403 });
    }

    await updateUserPassword(auth.accessToken, password);
    await patchActivationPin(record.id, {
      used_at: new Date().toISOString(),
      attempts: 0,
      locked_until: null,
    });

    await invalidateActivePins(auth.user.id);
    const personal = hashActivationPin(personalPin);
    await createActivationPinRecord({
      user_id: auth.user.id,
      pin_hash: personal.pin_hash,
      pin_salt: personal.pin_salt,
      expires_at: new Date(Date.now() + LOGIN_PIN_TTL_MS).toISOString(),
      created_by: auth.user.id,
    });

    await completeProfileActivation(auth.user.id);

    return Response.json({
      ok: true,
      message: "Compte activé. Connectez-vous avec votre email et votre PIN personnel.",
      role: auth.profile.role,
      modules: auth.profile.modules || [],
    });
  } catch (error) {
    if (error.message === "ACTIVATION_PIN_PEPPER_MISSING") {
      return Response.json({
        error: "ACTIVATION_PIN_PEPPER doit être définie sur le serveur pour enregistrer un PIN.",
      }, { status: 503 });
    }
    console.error("Activation complete error", error.message);
    return Response.json({ error: "Activation impossible pour le moment." }, { status: 502 });
  }
}
