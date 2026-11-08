/**
 * Jeton OAuth à usage unique.
 *
 * Le navigateur ne transporte qu’un jeton aléatoire opaque : ni identifiant
 * d’utilisateur, ni organisation, ni finalité. L’identité est relue côté
 * serveur depuis la ligne créée au lancement, puis reconfirmée dans `profiles`.
 *
 * Ordre imposé : le cookie et le paramètre `state` sont contrôlés AVANT la
 * consommation atomique. Sans cela, une requête sans cookie valide pourrait
 * consommer le jeton d’une connexion légitime et la faire échouer.
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const STATE_TTL_MS = 10 * 60 * 1000;

export const OAUTH_PURPOSES = ["calendar", "google_ads", "meta_ads"];

export const OAUTH_STATE_COOKIE = "mkl_oauth_state";

/** Motifs internes. Les réponses publiques restent indifférenciées. */
export const OAUTH_REJECTIONS = {
  MISSING_STATE: "state_absent",
  MALFORMED_STATE: "state_malforme",
  MISSING_COOKIE: "cookie_absent",
  COOKIE_MISMATCH: "cookie_different_du_state",
  UNKNOWN_PURPOSE: "finalite_inconnue",
  NOT_CONSUMABLE: "jeton_inconnu_expire_ou_deja_consomme",
  PURPOSE_MISMATCH: "finalite_incoherente",
  PROFILE_MISSING: "profil_introuvable",
  PROFILE_INACTIVE: "profil_inactif",
  PROFILE_NOT_ONBOARDED: "activation_incomplete",
  USER_MISMATCH: "utilisateur_different",
  ORGANIZATION_MISMATCH: "organisation_differente",
  EXPIRED: "jeton_expire",
  SCOPE_INSUFFICIENT: "portees_insuffisantes",
};

const NONCE_RE = /^[A-Za-z0-9_-]{32,96}$/;

export function hashNonce(nonce) {
  return createHash("sha256").update(String(nonce || ""), "utf8").digest("hex");
}

export function isWellFormedNonce(value) {
  return NONCE_RE.test(String(value || ""));
}

/**
 * Destinations de retour autorisées.
 *
 * Une énumération, et non une expression de forme. Deux expressions
 * successives ont laissé passer ce qu'elles devaient bloquer : `//exemple.test/`,
 * qu'un navigateur lit comme une adresse absolue vers un autre domaine, puis
 * `/../admin` et toute remontée de chemin. Une liste fermée ne peut pas se
 * tromper ainsi.
 *
 * Le CRM est une application à page unique, donc `/` est la seule destination
 * utilisée. Cette liste est reprise à l'identique en contrainte sur la table
 * `google_oauth_states` : ajouter une destination demande les deux, ce qui est
 * voulu pour un champ qui décide d'une redirection.
 */
export const OAUTH_REDIRECT_PATHS = ["/"];

export function safeRedirectPath(value) {
  const path = String(value || "");
  return OAUTH_REDIRECT_PATHS.includes(path) ? path : null;
}

export function createOAuthState({ purpose, userId, organizationId, redirectPath, now = Date.now() } = {}) {
  if (!OAUTH_PURPOSES.includes(String(purpose || ""))) throw new Error(OAUTH_REJECTIONS.UNKNOWN_PURPOSE);
  const nonce = randomBytes(32).toString("base64url");
  return {
    state: nonce,
    cookieValue: nonce,
    record: {
      nonce_hash: hashNonce(nonce),
      user_id: userId,
      organization_id: organizationId,
      purpose,
      // Le nom suit la colonne de la table, qui contraint déjà la forme.
      redirect_path: safeRedirectPath(redirectPath),
      expires_at: new Date(now + STATE_TTL_MS).toISOString(),
    },
  };
}

/** Attributs du cookie porteur du jeton. */
export function stateCookie(value, { secure = true, maxAge = STATE_TTL_MS / 1000 } = {}) {
  // `SameSite=Lax` et non `Strict` : le retour de Google est une navigation
  // venue d'un autre site, et `Strict` empêcherait le cookie d'être renvoyé,
  // donc toute connexion légitime échouerait.
  const parts = [
    `${OAUTH_STATE_COOKIE}=${value}`,
    "Path=/api/google",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearedStateCookie({ secure = true } = {}) {
  return stateCookie("", { secure, maxAge: 0 });
}

export function readStateCookie(header) {
  const found = String(header || "")
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${OAUTH_STATE_COOKIE}=`));
  return found ? found.slice(OAUTH_STATE_COOKIE.length + 1) : "";
}

function constantTimeEqual(left, right) {
  const a = createHash("sha256").update(String(left || ""), "utf8").digest();
  const b = createHash("sha256").update(String(right || ""), "utf8").digest();
  return timingSafeEqual(a, b);
}

/**
 * Contrôles effectués avant toute écriture et avant la consommation du jeton.
 */
export function preConsumeGate({ stateParam, cookieValue, purpose } = {}) {
  const state = String(stateParam || "");
  if (!state) return { ok: false, reason: OAUTH_REJECTIONS.MISSING_STATE };
  if (!isWellFormedNonce(state)) return { ok: false, reason: OAUTH_REJECTIONS.MALFORMED_STATE };
  if (!OAUTH_PURPOSES.includes(String(purpose || ""))) {
    return { ok: false, reason: OAUTH_REJECTIONS.UNKNOWN_PURPOSE };
  }
  const cookie = String(cookieValue || "");
  if (!cookie) return { ok: false, reason: OAUTH_REJECTIONS.MISSING_COOKIE };
  if (!constantTimeEqual(state, cookie)) {
    return { ok: false, reason: OAUTH_REJECTIONS.COOKIE_MISMATCH };
  }
  return { ok: true, nonceHash: hashNonce(state) };
}

/**
 * Filtre PostgREST de consommation. Les deux conditions sont indissociables :
 * une seule instruction, donc deux retours concurrents ne peuvent pas réussir.
 */
export function consumeFilter(nonceHash, now = new Date()) {
  const hash = String(nonceHash || "");
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error(OAUTH_REJECTIONS.MALFORMED_STATE);
  return [
    `nonce_hash=eq.${hash}`,
    "consumed_at=is.null",
    `expires_at=gt.${new Date(now).toISOString()}`,
  ].join("&");
}

/** Contrôles effectués après consommation, avant la moindre écriture de jeton. */
export function validateConsumedState({ record, expectedPurpose, profile, now = Date.now() } = {}) {
  if (!record || !record.user_id) return { ok: false, reason: OAUTH_REJECTIONS.NOT_CONSUMABLE };
  if (String(record.purpose || "") !== String(expectedPurpose || "")) {
    return { ok: false, reason: OAUTH_REJECTIONS.PURPOSE_MISMATCH };
  }
  if (record.expires_at && new Date(record.expires_at).getTime() <= now) {
    return { ok: false, reason: OAUTH_REJECTIONS.EXPIRED };
  }
  if (!profile || !profile.id) return { ok: false, reason: OAUTH_REJECTIONS.PROFILE_MISSING };
  if (String(profile.id) !== String(record.user_id)) {
    return { ok: false, reason: OAUTH_REJECTIONS.USER_MISMATCH };
  }
  if (!profile.active) return { ok: false, reason: OAUTH_REJECTIONS.PROFILE_INACTIVE };
  if (!profile.onboarding_completed_at) {
    return { ok: false, reason: OAUTH_REJECTIONS.PROFILE_NOT_ONBOARDED };
  }
  if (String(profile.organization_id || "") !== String(record.organization_id || "")) {
    return { ok: false, reason: OAUTH_REJECTIONS.ORGANIZATION_MISMATCH };
  }
  return {
    ok: true,
    userId: String(record.user_id),
    organizationId: String(profile.organization_id),
    purpose: String(record.purpose),
  };
}

export function validateGrantedScopes(returnedScope, requiredScopes = []) {
  const granted = String(returnedScope || "").split(/\s+/).filter(Boolean);
  const missing = requiredScopes.filter(scope => !granted.includes(scope));
  if (missing.length) return { ok: false, reason: OAUTH_REJECTIONS.SCOPE_INSUFFICIENT, missing };
  return { ok: true, granted };
}
