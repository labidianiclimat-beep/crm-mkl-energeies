import {
  generateActivationPin,
  hashActivationPin,
  LOGIN_PIN_TTL_MS,
} from "../../../lib/activation-pin";
import {
  completeProfileActivation,
  createActivationPinRecord,
  ensureAuthUser,
  ensureProfileForUser,
  hasAnyProfileService,
  serviceRoleConfigured,
  upsertProfile,
} from "../../../lib/supabase-server";

export const runtime = "nodejs";

const ADMIN_MODULES = [
  "Tableau de bord", "Prospects", "Agenda commercial", "Clients", "Devis", "Factures",
  "Factures pro forma", "Demandes de chiffrage", "Fournisseurs", "Planning", "Chantiers",
  "Équipes d'installation", "Maintenance", "Photovoltaïque administratif", "Visites techniques",
  "Gestion des articles", "Utilisateurs",
];

export async function POST(request) {
  try {
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { email, name, secret } = await request.json();
    const setupSecret = process.env.INITIAL_SETUP_SECRET || process.env.ACTIVATION_PIN_PEPPER;
    if (!setupSecret || secret !== setupSecret) {
      return Response.json({ error: "Accès refusé." }, { status: 403 });
    }

    if (await hasAnyProfileService()) {
      return Response.json({ error: "Le CRM est déjà configuré." }, { status: 409 });
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    const fullName = String(name || "Administrateur").trim();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return Response.json({ error: "Email invalide." }, { status: 400 });
    }

    const user = await ensureAuthUser({
      email: normalizedEmail,
      metadata: { full_name: fullName, role: "Admin VIP" },
    });

    const profile = await ensureProfileForUser(user);
    await upsertProfile({
      id: user.id,
      organization_id: profile?.organization_id,
      full_name: fullName,
      email: normalizedEmail,
      role: "Admin VIP",
      modules: ADMIN_MODULES,
      manager: "Direction",
      active: true,
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const pin = generateActivationPin();
    const { pin_hash, pin_salt } = hashActivationPin(pin);
    await createActivationPinRecord({
      user_id: user.id,
      pin_hash,
      pin_salt,
      expires_at: new Date(Date.now() + LOGIN_PIN_TTL_MS).toISOString(),
    });

    await completeProfileActivation(user.id);

    return Response.json({
      ok: true,
      email: normalizedEmail,
      pin,
      message: "Compte administrateur créé. Connectez-vous avec cet email et ce PIN.",
    });
  } catch (error) {
    if (error.message === "ACTIVATION_PIN_PEPPER_MISSING") {
      return Response.json({
        error: "ACTIVATION_PIN_PEPPER doit être définie sur le serveur pour générer un PIN.",
      }, { status: 503 });
    }
    console.error("Initial setup error", error.message);
    return Response.json({ error: "Configuration initiale impossible." }, { status: 502 });
  }
}
