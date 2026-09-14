function cleanEnv(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

const projectUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rzkwmwtjnwnmmcexwoov.supabase.co").trim();
const publishableKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) || "sb_publishable_egPsJQ5koBZHRPhT4dPhFw_Ffiz67B3";
const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Rejoue une requête GoTrue avec la clé service en entête `apikey`, le jeton
 * utilisateur restant dans `Authorization`. Supabase continue donc de vérifier
 * la signature du jeton : seule la clé de passerelle change. Sert aux cas où la
 * clé publishable du serveur n'est pas celle du projet qui a émis le jeton.
 */
async function requestAsGateway(path, options = {}) {
  if (!serviceRoleConfigured()) return null;
  return request(path, { ...options, apiKey: serviceRoleKey });
}

export function supabaseConfigured() {
  return Boolean(projectUrl && publishableKey);
}

export function serviceRoleConfigured() {
  return Boolean(projectUrl && serviceRoleKey);
}

async function request(path, { method = "GET", body, token, apiKey, headers = {} } = {}) {
  const response = await fetch(`${projectUrl}${path}`, {
    method,
    headers: {
      apikey: apiKey || publishableKey,
      Authorization: `Bearer ${token || apiKey || publishableKey}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const message = payload?.msg || payload?.message || payload?.error_description || payload?.error || "Supabase request failed";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function getUserFromAccessToken(accessToken) {
  if (!accessToken) return null;
  try {
    return await request("/auth/v1/user", { token: accessToken });
  } catch {
    // Réessai ci-dessous avec la clé service en entête apikey.
  }

  try {
    return await requestAsGateway("/auth/v1/user", { token: accessToken });
  } catch {
    // Jeton refusé par Supabase : aucune identité ne peut être établie.
    return null;
  }
}

export async function getProfileByUserId(userId, token) {
  const rows = await request(
    `/rest/v1/profiles?select=id,organization_id,full_name,email,role,modules,active,onboarding_completed_at,manager&id=eq.${encodeURIComponent(userId)}&limit=1`,
    { token }
  );
  return rows?.[0] || null;
}

export async function getProfileByUserIdService(userId) {
  if (!serviceRoleConfigured()) return null;
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,organization_id,full_name,email,role,modules,active,onboarding_completed_at,manager&id=eq.${encodeURIComponent(userId)}&limit=1`
  );
  return rows?.[0] || null;
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

export async function getProfileByEmailService(email) {
  if (!serviceRoleConfigured()) return null;
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,organization_id,full_name,email,role,modules,active,onboarding_completed_at,manager&email=eq.${encodeURIComponent(normalized)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function getProfileForToken(accessToken) {
  const user = await getUserFromAccessToken(accessToken);
  if (!user?.id) return { user: null, profile: null };
  let profile = await getProfileByUserId(user.id, accessToken).catch(() => null);
  if (!profile && serviceRoleConfigured()) {
    profile = await getProfileByUserIdService(user.id);
  }
  return { user, profile };
}

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

const BOOTSTRAP_ROLE_MODULES = {
  "Admin VIP": [
    "Tableau de bord", "Prospects", "Agenda commercial", "Clients", "Devis", "Factures",
    "Factures pro forma", "Demandes de chiffrage", "Fournisseurs", "Planning", "Chantiers",
    "Équipes d'installation", "Maintenance", "Photovoltaïque administratif", "Visites techniques",
    "Gestion des articles", "Utilisateurs",
  ],
  Commercial: ["Tableau de bord", "Prospects", "Agenda commercial", "Clients", "Devis"],
};

async function hasAnyProfile() {
  const rows = await serviceRequest("/rest/v1/profiles?select=id&limit=1");
  return Boolean(rows?.length);
}

export async function hasAnyProfileService() {
  if (!serviceRoleConfigured()) return false;
  return hasAnyProfile();
}

async function ensureDefaultOrganization() {
  if (!serviceRoleConfigured()) return null;
  try {
    await serviceRequest("/rest/v1/organizations?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: { id: DEFAULT_ORG_ID, name: "MKL Énergies" },
    });
    return DEFAULT_ORG_ID;
  } catch (error) {
    console.warn("ensureDefaultOrganization", error.message);
    return null;
  }
}

async function resolveOrganizationId() {
  if (!serviceRoleConfigured()) return DEFAULT_ORG_ID;
  try {
    const rows = await serviceRequest("/rest/v1/organizations?select=id&order=created_at.asc&limit=1");
    if (rows?.[0]?.id) return rows[0].id;
  } catch (error) {
    console.warn("resolveOrganizationId:list", error.message);
  }
  const created = await ensureDefaultOrganization();
  if (created) return created;
  try {
    const rows = await serviceRequest("/rest/v1/organizations?select=id&limit=1");
    if (rows?.[0]?.id) return rows[0].id;
  } catch (error) {
    console.warn("resolveOrganizationId:retry", error.message);
  }
  return DEFAULT_ORG_ID;
}

/**
 * `user_metadata` est modifiable par l'utilisateur lui-même : s'y fier pour le
 * rôle laisserait n'importe qui se déclarer Admin VIP. Seul `app_metadata`,
 * réservé à la clé service, fait foi.
 */
function resolveBootstrapRole(user, firstUser) {
  const trustedRole = user.app_metadata?.role;
  if (trustedRole && BOOTSTRAP_ROLE_MODULES[trustedRole]) return trustedRole;
  if (firstUser || user.email?.toLowerCase() === "contact@mkl-energies.fr") return "Admin VIP";
  return "Commercial";
}

export async function ensureProfileForUser(user) {
  if (!user?.id || !serviceRoleConfigured()) return null;

  const existing = await serviceRequest(
    `/rest/v1/profiles?select=id,organization_id,full_name,email,role,modules,active,onboarding_completed_at,manager&id=eq.${encodeURIComponent(user.id)}&limit=1`
  );
  if (existing?.[0]) return existing[0];

  const organizationId = await resolveOrganizationId();

  const firstUser = !(await hasAnyProfile());
  const role = resolveBootstrapRole(user, firstUser);
  const trustedModules = user.app_metadata?.modules;
  const modules = Array.isArray(trustedModules) && trustedModules.length
    ? trustedModules
    : BOOTSTRAP_ROLE_MODULES[role] || BOOTSTRAP_ROLE_MODULES.Commercial;

  const rows = await upsertProfile({
    id: user.id,
    organization_id: organizationId,
    full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Utilisateur",
    email: (user.email || "").trim().toLowerCase(),
    role,
    modules,
    manager: user.user_metadata?.manager || "Direction",
    active: false,
    onboarding_completed_at: null,
    updated_at: new Date().toISOString(),
  });

  return rows?.[0] || null;
}

export async function serviceRequest(path, options = {}) {
  if (!serviceRoleConfigured()) throw new Error("SERVICE_ROLE_NOT_CONFIGURED");
  return request(path, { ...options, apiKey: serviceRoleKey, token: serviceRoleKey });
}

export async function generateInviteLink({ email, redirectTo, metadata = {} }) {
  return serviceRequest("/auth/v1/admin/generate_link", {
    method: "POST",
    body: {
      type: "invite",
      email,
      data: metadata,
      options: {
        redirectTo,
        data: metadata,
      },
    },
  });
}

export async function findUserByEmail(email) {
  const normalized = email.trim().toLowerCase();
  const profiles = await serviceRequest(
    `/rest/v1/profiles?select=id,email,full_name,role,active,onboarding_completed_at&email=eq.${encodeURIComponent(normalized)}&limit=1`
  );
  if (profiles?.[0]?.id) {
    try {
      const authUser = await serviceRequest(`/auth/v1/admin/users/${profiles[0].id}`);
      return authUser?.user || authUser;
    } catch {
      return { id: profiles[0].id, email: normalized };
    }
  }

  const listed = await serviceRequest(`/auth/v1/admin/users?per_page=200&page=1`);
  const users = listed?.users || listed || [];
  return users.find(user => user.email?.toLowerCase() === normalized) || null;
}

export async function createAdminUser({ email, metadata = {}, appMetadata = null }) {
  return serviceRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email: email.trim().toLowerCase(),
      email_confirm: true,
      user_metadata: metadata,
      ...(appMetadata ? { app_metadata: appMetadata } : {}),
    },
  });
}

export async function ensureAuthUser({ email, metadata = {}, appMetadata = null }) {
  const normalized = email.trim().toLowerCase();
  const existing = await findUserByEmail(normalized);
  if (existing?.id) return existing;
  const created = await createAdminUser({ email: normalized, metadata, appMetadata });
  return created?.user || created;
}

export async function createSessionForEmail(email) {
  const normalized = email.trim().toLowerCase();
  const linkPayload = await serviceRequest("/auth/v1/admin/generate_link", {
    method: "POST",
    body: { type: "magiclink", email: normalized },
  });

  const otp = linkPayload.email_otp || linkPayload.properties?.email_otp;
  if (!otp) throw new Error("SESSION_LINK_FAILED");

  for (const type of ["email", "magiclink"]) {
    try {
      const session = await request("/auth/v1/verify", {
        method: "POST",
        body: { type, email: normalized, token: otp },
      });
      if (session?.access_token) return session;
    } catch {
      // Try next verify type.
    }
  }

  throw new Error("SESSION_CREATE_FAILED");
}

export async function upsertProfile(record) {
  return serviceRequest("/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: record,
  });
}

export async function invalidateActivePins(userId) {
  return serviceRequest(`/rest/v1/activation_pins?user_id=eq.${encodeURIComponent(userId)}&invalidated_at=is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: { invalidated_at: new Date().toISOString() },
  });
}

export async function createActivationPinRecord(record) {
  const rows = await serviceRequest("/rest/v1/activation_pins", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: record,
  });
  return rows?.[0] || null;
}

export async function getLatestActivationPin(userId) {
  const rows = await serviceRequest(
    `/rest/v1/activation_pins?select=id,user_id,pin_hash,pin_salt,created_at,expires_at,used_at,invalidated_at,attempts,locked_until&user_id=eq.${encodeURIComponent(userId)}&used_at=is.null&invalidated_at=is.null&order=created_at.desc&limit=1`,
    { method: "GET" }
  );
  return rows?.[0] || null;
}

export async function getLatestLoginPin(userId) {
  const rows = await serviceRequest(
    `/rest/v1/activation_pins?select=id,user_id,pin_hash,pin_salt,created_at,expires_at,used_at,invalidated_at,attempts,locked_until&user_id=eq.${encodeURIComponent(userId)}&invalidated_at=is.null&order=created_at.desc&limit=1`,
    { method: "GET" }
  );
  return rows?.[0] || null;
}

export async function patchActivationPin(id, body) {
  return serviceRequest(`/rest/v1/activation_pins?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body,
  });
}

export async function completeProfileActivation(userId) {
  return serviceRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: {
      active: true,
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
}

export async function updateUserPassword(accessToken, password) {
  try {
    return await request("/auth/v1/user", {
      method: "PUT",
      token: accessToken,
      body: { password },
    });
  } catch (error) {
    const retried = await requestAsGateway("/auth/v1/user", {
      method: "PUT",
      token: accessToken,
      body: { password },
    }).catch(() => null);
    if (!retried) throw error;
    return retried;
  }
}

export function publicAppUrl(fallbackOrigin) {
  const configured = process.env.APP_PUBLIC_URL || fallbackOrigin || "";
  return configured.replace(/\/$/, "");
}
