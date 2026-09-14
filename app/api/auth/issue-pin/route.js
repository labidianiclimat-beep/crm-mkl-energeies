import { createHash, timingSafeEqual } from "crypto";
import {
  generateActivationPin,
  hashActivationPin,
  LOGIN_PIN_TTL_MS,
} from "../../../lib/activation-pin";
import {
  createActivationPinRecord,
  findUserByEmail,
  invalidateActivePins,
  serviceRoleConfigured,
} from "../../../lib/supabase-server";

export const runtime = "nodejs";

const MIN_SECRET_LENGTH = 24;

/**
 * Route d'exploitation, sans interface : elle sert à réémettre un PIN de
 * connexion quand plus aucun administrateur ne peut se connecter. Le parcours
 * normal est l'écran Utilisateurs (POST /api/users/invite ou
 * /api/users/resend-pin), qui exige une session administrateur.
 *
 * Le secret doit être dédié et long : accepter CRM_ACCESS_PIN, un code d'équipe
 * à quatre chiffres, permettait à un inconnu d'obtenir un PIN de connexion
 * administrateur en une requête.
 */
function secretMatches(submitted) {
  const expected = String(process.env.INITIAL_SETUP_SECRET || "").trim();
  if (expected.length < MIN_SECRET_LENGTH) return { ok: false, misconfigured: true };
  const submittedDigest = createHash("sha256").update(String(submitted || "")).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return { ok: timingSafeEqual(submittedDigest, expectedDigest), misconfigured: false };
}

export async function POST(request) {
  try {
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { email, secret } = await request.json();
    const check = secretMatches(secret);
    if (check.misconfigured) {
      return Response.json({
        error: `INITIAL_SETUP_SECRET doit être défini et contenir au moins ${MIN_SECRET_LENGTH} caractères pour utiliser cette route.`,
      }, { status: 503 });
    }
    if (!check.ok) {
      return Response.json({ error: "Accès refusé." }, { status: 403 });
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return Response.json({ error: "Email invalide." }, { status: 400 });
    }

    const user = await findUserByEmail(normalizedEmail);
    if (!user?.id) {
      return Response.json({ error: "Utilisateur introuvable." }, { status: 404 });
    }

    await invalidateActivePins(user.id);
    const pin = generateActivationPin();
    const { pin_hash, pin_salt } = hashActivationPin(pin);
    await createActivationPinRecord({
      user_id: user.id,
      pin_hash,
      pin_salt,
      expires_at: new Date(Date.now() + LOGIN_PIN_TTL_MS).toISOString(),
    });

    return Response.json({
      ok: true,
      email: normalizedEmail,
      pin,
      message: "PIN définitif créé. Conservez-le : il reste valable jusqu’à une nouvelle régénération.",
    });
  } catch (error) {
    if (error.message === "ACTIVATION_PIN_PEPPER_MISSING") {
      return Response.json({ error: "ACTIVATION_PIN_PEPPER manquant sur le serveur." }, { status: 503 });
    }
    console.error("Issue PIN error", error.message);
    return Response.json({ error: "Impossible de générer le PIN." }, { status: 502 });
  }
}
