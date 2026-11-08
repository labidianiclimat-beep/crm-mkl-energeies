import { extractGrantedActions, normalizeRoleLabel, sanitizeGrantedModules } from "./roles.js";

export const DEMO_USER_EMAILS = new Set([
  "sebastien@mkl-energies.fr",
  "karim@mkl-energies.fr",
]);

export function joinUserName(firstName, lastName) {
  return [firstName, lastName].map(value => String(value || "").trim()).filter(Boolean).join(" ");
}

export function splitUserName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function resolveUserDisplayName(body = {}, fallback = "") {
  const firstName = body.firstName ?? body.first_name;
  const lastName = body.lastName ?? body.last_name;
  const hasSplit = firstName != null || lastName != null;
  const joined = hasSplit ? joinUserName(firstName, lastName) : "";
  if (joined) return joined;
  const name = String(body.name || "").trim();
  return name || String(fallback || "").trim();
}

export function profileToUiUser(row = {}) {
  const active = row.active !== false && row.active !== "false";
  const email = String(row.email || "").trim().toLowerCase();
  const name = row.full_name || row.email || "";
  const split = splitUserName(name);
  return {
    id: row.id,
    supabaseId: row.id,
    name,
    firstName: split.firstName,
    lastName: split.lastName,
    email,
    identifier: email,
    // Le rôle est normalisé ici, et pas seulement côté serveur. Les contrôles
    // d'accès des routes comparent `normalizeRoleLabel(profile.role)` à
    // « Superadmin », tandis que l'interface compare le libellé brut : un
    // compte enregistré « Admin second » obtenait donc ses droits du serveur
    // mais les perdait à l'écran. Le contournement écrit à la main dans
    // `commercial-agenda.js`, qui cite « Admin second » à côté de
    // « Superadmin », en était le symptôme.
    // La chaîne vide est préservée telle quelle : `normalizeRoleLabel` renvoie
    // « Commercial » pour une entrée vide, ce qui attribuerait un rôle à un
    // compte qui n'en a pas.
    role: row.role ? normalizeRoleLabel(row.role) : "",
    manager: row.manager || "",
    modules: sanitizeGrantedModules(Array.isArray(row.modules) ? row.modules : [], { role: row.role }),
    actions: extractGrantedActions(row.actions || row.modules),
    status: active ? "Actif" : "Inactif",
    active,
    authStatus: row.onboarding_completed_at ? (active ? "Actif" : "Inactif") : "En attente d’envoi",
    zone: row.zone || "",
    specialties: Array.isArray(row.specialties) ? row.specialties : [],
    postalCode: row.postal_code || row.postalCode || "",
    city: row.city || "",
    dispatchAvailable: row.dispatch_available !== false,
  };
}

export function profileToDirectoryUser(row = {}) {
  const user = profileToUiUser(row);
  return {
    id: user.id,
    supabaseId: user.supabaseId,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    manager: user.manager,
    status: user.status,
    active: user.active,
    zone: user.zone,
    city: user.city,
    postalCode: user.postalCode,
    specialties: user.specialties,
    dispatchAvailable: user.dispatchAvailable,
  };
}

export function isDemoUser(user) {
  if (!user) return false;
  if (user.supabaseId || String(user.id || "").includes("-")) return false;
  const email = String(user.email || user.identifier || "").trim().toLowerCase();
  if (DEMO_USER_EMAILS.has(email)) return true;
  return Number(user.id) === 2 || Number(user.id) === 3;
}
