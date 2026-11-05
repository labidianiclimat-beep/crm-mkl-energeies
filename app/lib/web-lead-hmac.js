import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Vérification des demandes signées envoyées par le site.
 *
 * La chaîne canonique doit rester identique à celle de
 * ovh-site/lib/crm-sync.mjs. L’alignement des deux implémentations est
 * vérifié par tests/web-lead-hmac.test.js, qui signe d’un côté et vérifie de
 * l’autre.
 *
 * Le rejeu n’a pas besoin d’un registre d’aléas : la route d’arrivée est
 * idempotente sur `submissionId`, donc rejouer une requête valide renvoie
 * l’accusé d’origine au lieu de créer un second prospect. La fenêtre
 * d’horodatage suffit à borner la validité d’une signature interceptée.
 */

export const SIGNATURE_VERSION = "v1";
export const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export const CRM_HEADERS = {
  keyId: "x-mkl-key-id",
  timestamp: "x-mkl-timestamp",
  nonce: "x-mkl-nonce",
  signature: "x-mkl-signature",
};

/** Motifs de refus. Aucun ne révèle quelle partie du secret est correcte. */
export const HMAC_REJECTIONS = {
  MISSING_HEADER: "en_tete_manquant",
  UNKNOWN_KEY: "cle_inconnue",
  MALFORMED_TIMESTAMP: "horodatage_invalide",
  CLOCK_SKEW: "horodatage_hors_fenetre",
  MALFORMED_NONCE: "alea_invalide",
  MALFORMED_SIGNATURE: "signature_malformee",
  VERSION_MISMATCH: "version_de_signature_inconnue",
  BAD_SIGNATURE: "signature_invalide",
  BODY_TOO_LARGE: "corps_trop_volumineux",
};

export const MAX_BODY_BYTES = 64 * 1024;

export function bodyDigest(rawBody) {
  return createHash("sha256").update(rawBody ?? "", "utf8").digest("hex");
}

export function canonicalString({ method, path, timestamp, nonce, rawBody }) {
  return [
    SIGNATURE_VERSION,
    String(method || "").toUpperCase(),
    String(path || ""),
    String(timestamp || ""),
    String(nonce || ""),
    bodyDigest(rawBody),
  ].join("\n");
}

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return String(headers.get(name) || "");
  const direct = headers[name] ?? headers[name.toLowerCase()];
  return String(direct || "");
}

/** Comparaison à durée constante, sur des empreintes pour égaliser les longueurs. */
export function constantTimeEqual(a, b) {
  const left = createHash("sha256").update(String(a), "utf8").digest();
  const right = createHash("sha256").update(String(b), "utf8").digest();
  return timingSafeEqual(left, right);
}

/**
 * Trousseau de clés, pour pouvoir changer de secret sans interruption.
 * Format attendu : `identifiant:secret`, séparés par des virgules.
 */
export function parseKeyring(raw) {
  const keyring = new Map();
  for (const entry of String(raw || "").split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(":");
    if (separator < 1) continue;
    const keyId = trimmed.slice(0, separator).trim();
    const secret = trimmed.slice(separator + 1).trim();
    if (!keyId || secret.length < 32) continue;
    keyring.set(keyId, secret);
  }
  return keyring;
}

export function verifyWebLeadSignature({
  method = "POST",
  path,
  headers,
  rawBody,
  keyring,
  now = Date.now(),
  maxSkewMs = MAX_CLOCK_SKEW_MS,
} = {}) {
  if (typeof rawBody === "string" && Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return { ok: false, reason: HMAC_REJECTIONS.BODY_TOO_LARGE };
  }

  const keyId = headerValue(headers, CRM_HEADERS.keyId);
  const timestamp = headerValue(headers, CRM_HEADERS.timestamp);
  const nonce = headerValue(headers, CRM_HEADERS.nonce);
  const provided = headerValue(headers, CRM_HEADERS.signature);
  if (!keyId || !timestamp || !nonce || !provided) {
    return { ok: false, reason: HMAC_REJECTIONS.MISSING_HEADER };
  }

  const secret = keyring instanceof Map ? keyring.get(keyId) : null;
  if (!secret) return { ok: false, reason: HMAC_REJECTIONS.UNKNOWN_KEY };

  if (!/^\d{13,}$/.test(timestamp)) {
    return { ok: false, reason: HMAC_REJECTIONS.MALFORMED_TIMESTAMP };
  }
  const sentAt = Number(timestamp);
  if (Math.abs(now - sentAt) > maxSkewMs) {
    return { ok: false, reason: HMAC_REJECTIONS.CLOCK_SKEW };
  }

  if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) {
    return { ok: false, reason: HMAC_REJECTIONS.MALFORMED_NONCE };
  }

  const separator = provided.indexOf("=");
  if (separator < 1) return { ok: false, reason: HMAC_REJECTIONS.MALFORMED_SIGNATURE };
  const version = provided.slice(0, separator);
  const digest = provided.slice(separator + 1);
  if (version !== SIGNATURE_VERSION) {
    return { ok: false, reason: HMAC_REJECTIONS.VERSION_MISMATCH };
  }
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    return { ok: false, reason: HMAC_REJECTIONS.MALFORMED_SIGNATURE };
  }

  const expected = createHmac("sha256", secret)
    .update(canonicalString({ method, path, timestamp, nonce, rawBody }), "utf8")
    .digest("hex");

  if (!constantTimeEqual(expected, digest)) {
    return { ok: false, reason: HMAC_REJECTIONS.BAD_SIGNATURE };
  }

  return { ok: true, keyId, sentAt: new Date(sentAt).toISOString() };
}
