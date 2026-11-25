import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "mkl_crm_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function sessionSecret() {
  return process.env.CRM_SESSION_SECRET || process.env.CRM_ACCESS_PIN || "";
}

// Renouveler un secret coupe net tous ceux qui détiennent l'ancien. Les
// variables « _PRECEDENT » ouvrent une fenêtre pendant laquelle les deux
// valeurs sont acceptées : on publie la nouvelle, on laisse les équipes et les
// sessions en cours basculer, puis on retire l'ancienne. Sans cette fenêtre, un
// renouvellement est forcément une interruption de service.
function sessionSecrets() {
  const precedent = String(process.env.CRM_SESSION_SECRET_PRECEDENT || "").trim();
  return [sessionSecret(), precedent].filter(Boolean);
}

export function expectedPin() {
  return String(process.env.CRM_ACCESS_PIN || "").trim();
}

function acceptedPins() {
  const precedent = String(process.env.CRM_ACCESS_PIN_PRECEDENT || "").trim();
  return [expectedPin(), precedent].filter(valeur => valeur.length >= 4);
}

export function pinConfigured() {
  return expectedPin().length >= 4;
}

export function verifyPin(pin) {
  const submitted = Buffer.from(String(pin || "").trim());
  // La comparaison reste à temps constant pour chaque candidat, et toutes les
  // valeurs sont parcourues : sortir à la première correspondance rendrait la
  // durée de la réponse révélatrice.
  let valide = false;
  for (const candidat of acceptedPins()) {
    const target = Buffer.from(candidat);
    if (submitted.length === target.length && timingSafeEqual(submitted, target)) {
      valide = true;
    }
  }
  return valide;
}

export function createSessionToken() {
  const payload = String(Date.now());
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token) {
  const secrets = sessionSecrets();
  if (!token || secrets.length === 0) return false;
  const [payload, signature] = String(token).split(".");
  if (!payload || !signature || !/^\d+$/.test(payload)) return false;

  let signatureValide = false;
  for (const secret of secrets) {
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    try {
      const submitted = Buffer.from(signature, "hex");
      const target = Buffer.from(expected, "hex");
      if (submitted.length === target.length && timingSafeEqual(submitted, target)) {
        signatureValide = true;
      }
    } catch {
      // Signature illisible : elle ne vaudra pour aucun secret.
      return false;
    }
  }
  if (!signatureValide) return false;

  const age = Date.now() - Number(payload);
  return age >= 0 && age <= SESSION_MAX_AGE * 1000;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}
