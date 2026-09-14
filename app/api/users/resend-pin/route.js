import { requireApiSession, canInviteUsers } from "../../../lib/api-auth";
import {
  generateActivationPin,
  hashActivationPin,
  LOGIN_PIN_TTL_MS,
} from "../../../lib/activation-pin";
import { sendMail } from "../../../lib/send-mail";
import {
  createActivationPinRecord,
  ensureAuthUser,
  getProfileByEmailService,
  getProfileByUserIdService,
  invalidateActivePins,
  isUuid,
  publicAppUrl,
  serviceRoleConfigured,
  upsertProfile,
} from "../../../lib/supabase-server";

export const runtime = "nodejs";

const ROLE_DEFAULT_MODULES = {
  "Admin VIP": [
    "Tableau de bord", "Prospects", "Agenda commercial", "Clients", "Devis", "Factures",
    "Factures pro forma", "Demandes de chiffrage", "Fournisseurs", "Planning", "Chantiers",
    "Équipes d'installation", "Maintenance", "Photovoltaïque administratif", "Visites techniques",
    "Gestion des articles", "Utilisateurs",
  ],
  "Admin second": [
    "Tableau de bord", "Prospects", "Agenda commercial", "Clients", "Devis", "Factures",
    "Demandes de chiffrage", "Fournisseurs", "Planning", "Chantiers", "Équipes d'installation",
    "Maintenance", "Photovoltaïque administratif", "Gestion des articles", "Utilisateurs",
  ],
  "Responsable technique": [
    "Tableau de bord", "Clients", "Demandes de chiffrage", "Fournisseurs", "Planning",
    "Chantiers", "Équipes d'installation", "Maintenance", "Gestion des articles",
  ],
  Technicien: ["Tableau de bord", "Planning", "Chantiers", "Maintenance"],
  "Responsable commercial": [
    "Tableau de bord", "Prospects", "Agenda commercial", "Clients", "Devis", "Planning", "Gestion des articles",
  ],
  Commercial: ["Tableau de bord", "Prospects", "Agenda commercial", "Clients", "Devis", "Planning"],
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[character]));
}

function mailErrorMessage(error) {
  const message = String(error?.message || "");
  if (message === "MAIL_NOT_CONFIGURED") {
    return "Le service d’envoi d’emails n’est pas configuré sur le serveur.";
  }
  if (message === "ACTIVATION_PIN_PEPPER_MISSING") {
    return "ACTIVATION_PIN_PEPPER doit être définie sur le serveur pour générer un PIN.";
  }
  if (/MAIL_PROVIDER_ERROR|MAIL_SMTP_ERROR/i.test(message)) {
    return "L’email n’a pas pu être envoyé. Vérifiez la configuration SMTP OVH sur Vercel.";
  }
  return message || "Le PIN n’a pas pu être renvoyé.";
}

export async function POST(request) {
  try {
    const auth = await requireApiSession(request, { action: "invite_users" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canInviteUsers(auth.profile)) {
      return Response.json({ error: "Seuls les administrateurs peuvent renvoyer un PIN." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant sur le serveur." }, { status: 503 });
    }

    const { userId, email, name, role, modules = [], manager = "" } = await request.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return Response.json({ error: "Adresse email invalide." }, { status: 400 });
    }

    let profile = null;
    if (userId && isUuid(userId)) {
      profile = await getProfileByUserIdService(userId);
    }
    if (!profile) {
      profile = await getProfileByEmailService(normalizedEmail);
    }
    // Un administrateur ne réinitialise que les PIN de sa propre entreprise :
    // sans ce contrôle il pourrait invalider le PIN d'un utilisateur d'une
    // autre organisation et recevoir le nouveau code par email.
    if (profile && profile.organization_id !== auth.profile.organization_id) {
      return Response.json({ error: "Utilisateur introuvable." }, { status: 404 });
    }

    // Compte local / démo : créer automatiquement dans Supabase puis envoyer le PIN
    if (!profile) {
      const resolvedRole = role || "Commercial";
      const resolvedName = name || normalizedEmail.split("@")[0];
      const resolvedModules = Array.isArray(modules) && modules.length
        ? modules
        : ROLE_DEFAULT_MODULES[resolvedRole] || ROLE_DEFAULT_MODULES.Commercial;

      const authUser = await ensureAuthUser({
        email: normalizedEmail,
        metadata: { full_name: resolvedName, role: resolvedRole, modules: resolvedModules },
      });
      if (!authUser?.id) {
        return Response.json({ error: "Impossible de créer le compte dans Supabase." }, { status: 502 });
      }

      const rows = await upsertProfile({
        id: authUser.id,
        organization_id: auth.profile.organization_id,
        full_name: resolvedName,
        email: normalizedEmail,
        role: resolvedRole,
        modules: resolvedModules,
        manager: manager || "Direction",
        active: true,
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      profile = rows?.[0] || {
        id: authUser.id,
        full_name: resolvedName,
        email: normalizedEmail,
        role: resolvedRole,
      };
    }

    const publicUrl = publicAppUrl(new URL(request.url).origin);
    const resolvedUserId = profile.id;

    await invalidateActivePins(resolvedUserId);
    const pin = generateActivationPin();
    const { pin_hash, pin_salt } = hashActivationPin(pin);
    await createActivationPinRecord({
      user_id: resolvedUserId,
      pin_hash,
      pin_salt,
      expires_at: new Date(Date.now() + LOGIN_PIN_TTL_MS).toISOString(),
      created_by: auth.profile.id,
    });

    await sendMail({
      to: normalizedEmail,
      subject: "Réinitialisation PIN — MKL Énergies CRM",
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#26375f">
        <h2>Bonjour ${escapeHtml(name || profile.full_name || "")},</h2>
        <p>Votre administrateur a réinitialisé votre <b>code PIN personnel</b>.</p>
        <p><b>Identifiant :</b> ${escapeHtml(normalizedEmail)}<br>
        <b>Nouveau PIN personnel :</b> <span style="font-size:22px;letter-spacing:6px">${escapeHtml(pin)}</span></p>
        <p style="margin:28px 0"><a href="${escapeHtml(`${publicUrl}/`)}" style="background:#405fae;color:white;text-decoration:none;padding:13px 20px;border-radius:8px">Se connecter au CRM</a></p>
        <p style="font-size:12px;color:#7e8795">L’ancien PIN n’est plus valide. Conservez ce nouveau code en lieu sûr.</p>
      </div>`,
    });

    return Response.json({ sent: true, userId: resolvedUserId, email: normalizedEmail, created: true });
  } catch (error) {
    console.error("Resend PIN error", error.message);
    return Response.json({ error: mailErrorMessage(error) }, { status: 502 });
  }
}
