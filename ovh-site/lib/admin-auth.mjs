/**
 * Auth admin serveur — cookies HttpOnly + hash scrypt.
 * Secrets uniquement via variables d'environnement (jamais dans le JS public).
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "mkl_admin_sid";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

/** @type {Map<string, { expiresAt: number }>} */
const sessions = new Map();

function requireSessionSecret() {
  const secret = String(process.env.SESSION_SECRET || "").trim();
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET manquant ou trop court (≥16). Définir dans l’environnement serveur."
    );
  }
  return secret;
}

export function parsePasswordHash(encoded) {
  const parts = String(encoded || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "base64url");
  const hash = Buffer.from(parts[5], "base64url");
  if (!Number.isFinite(N) || !salt.length || !hash.length) return null;
  return { N, r, p, salt, hash };
}

export function hashPassword(password, { N = SCRYPT_N, r = SCRYPT_R, p = SCRYPT_P } = {}) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, SCRYPT_KEYLEN, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password, encodedHash) {
  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) return false;
  let candidate;
  try {
    candidate = scryptSync(String(password), parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
    });
  } catch {
    return false;
  }
  if (candidate.length !== parsed.hash.length) return false;
  return timingSafeEqual(candidate, parsed.hash);
}

export function getAdminPasswordHash() {
  const fromEnv = String(process.env.ADMIN_PASSWORD_HASH || "").trim();
  if (fromEnv) return fromEnv;
  return "";
}

function signToken(token) {
  const secret = requireSessionSecret();
  return createHmac("sha256", secret).update(token).digest("base64url");
}

function makeSessionToken() {
  const raw = randomBytes(32).toString("base64url");
  return `${raw}.${signToken(raw)}`;
}

function verifySessionToken(cookieVal) {
  const parts = String(cookieVal || "").split(".");
  if (parts.length !== 2) return null;
  const [raw, sig] = parts;
  const expected = signToken(raw);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return `${raw}.${sig}`;
}

export function parseCookies(req) {
  const header = req.headers?.cookie || "";
  const out = {};
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function isHttpsRequest(req) {
  if (req.socket?.encrypted) return true;
  const xf = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return xf === "https";
}

export function buildSessionCookie(token, req, { clear = false } = {}) {
  const secure = isHttpsRequest(req);
  const parts = [
    `${COOKIE_NAME}=${clear ? "" : encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  if (clear) {
    parts.push("Max-Age=0");
  } else {
    parts.push(`Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
  }
  return parts.join("; ");
}

export function createSession() {
  const token = makeSessionToken();
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function destroySession(token) {
  if (token) sessions.delete(token);
}

/** Invalide toutes les sessions (changement / reset de mot de passe). */
export function destroyAllSessions() {
  sessions.clear();
}

export function getSessionFromRequest(req) {
  const cookies = parseCookies(req);
  const raw = cookies[COOKIE_NAME];
  const token = verifySessionToken(raw);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  // sliding expiration légère
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { token, role: "admin" };
}

export function requireAdmin(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.writeHead(401, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ ok: false, error: "Authentification requise." }));
    return null;
  }
  // Un seul rôle admin aujourd’hui — 403 réservé aux rôles futurs
  if (session.role !== "admin") {
    res.writeHead(403, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ ok: false, error: "Accès refusé." }));
    return null;
  }
  return session;
}

/** Rate-limit mémoire simple par IP */
const hitBuckets = new Map();

export function rateLimit(req, { key, limit = 12, windowMs = 15 * 60 * 1000 } = {}) {
  const ip =
    String(req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  let bucket = hitBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + windowMs };
    hitBuckets.set(bucketKey, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true };
}

export function assertAuthConfigured() {
  if (!getAdminPasswordHash()) {
    console.warn(
      "[auth] ADMIN_PASSWORD_HASH absent — login admin impossible jusqu’à configuration."
    );
  }
  try {
    requireSessionSecret();
  } catch (err) {
    console.warn(`[auth] ${err.message}`);
  }
}

export { COOKIE_NAME };
