import { requireApiSession, canInviteUsers } from "../../../lib/api-auth";
import { issueAndSendLoginPin, mailErrorMessage } from "../../../lib/user-login-pin";
import {
  ensureAuthUser,
  getProfileByEmailService,
  getProfileByUserIdService,
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
    "Équipes d'installation", "Maintenance", "Photovoltaïque administratif", "Études thermiques", "Visites techniques",
    "Gestion des articles", "Grilles tarifaires PDF", "Utilisateurs",
  ],
  Superadmin: [
    "Tableau de bord", "Prospects", "Agenda commercial", "Clients", "Devis", "Factures",
    "Demandes de chiffrage", "Fournisseurs", "Planning", "Chantiers", "Équipes d'installation",
    "Maintenance", "Photovoltaïque administratif", "Études thermiques", "Gestion des articles", "Grilles tarifaires PDF", "Utilisateurs",
  ],
  "Responsable technique": [
    "Tableau de bord", "Clients", "Demandes de chiffrage", "Fournisseurs", "Planning",
    "Chantiers", "Équipes d'installation", "Visites techniques", "Maintenance",
    "Photovoltaïque administratif", "Gestion des articles", "Grilles tarifaires PDF",
  ],
  Technicien: ["Planning", "Chantiers", "Visites techniques", "Maintenance"],
  "Responsable commercial": [
    "Tableau de bord", "Prospects", "Agenda commercial", "Clients", "Devis", "Études thermiques", "Planning", "Gestion des articles", "Grilles tarifaires PDF",
  ],
  Commercial: ["Tableau de bord", "Prospects", "Agenda commercial", "Clients", "Devis", "Études thermiques", "Photovoltaïque administratif", "Planning", "Grilles tarifaires PDF"],
};

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

    const loginEmail = String(profile.email || normalizedEmail).trim().toLowerCase();
    await issueAndSendLoginPin({
      userId: profile.id,
      email: loginEmail,
      name: name || profile.full_name || "",
      createdBy: auth.profile.id,
      publicUrl: publicAppUrl(new URL(request.url).origin),
    });

    return Response.json({ sent: true, userId: profile.id, email: loginEmail, created: true });
  } catch (error) {
    console.error("Resend PIN error", error.message);
    return Response.json({ error: mailErrorMessage(error) }, { status: 502 });
  }
}
