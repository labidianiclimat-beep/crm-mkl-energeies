import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "mkl_crm_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function sessionSecret() {
  return process.env.CRM_SESSION_SECRET || process.env.CRM_ACCESS_PIN || "";
}

export function expectedPin() {
  return String(process.env.CRM_ACCESS_PIN || "").trim();
}

export function pinConfigured() {
  return expectedPin().length >= 4;
}

export function verifyPin(pin) {
  const expected = expectedPin();
  if (!expected) return false;
  const submitted = Buffer.from(String(pin || "").trim());
  const target = Buffer.from(expected);
  if (submitted.length !== target.length) return false;
  return timingSafeEqual(submitted, target);
}

export function createSessionToken() {
  const payload = String(Date.now());
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token || !sessionSecret()) return false;
  const [payload, signature] = String(token).split(".");
  if (!payload || !signature || !/^\d+$/.test(payload)) return false;
  const expected = createHmac("sha256", sessionSecret()).update(payload).digest("hex");
  try {
    const submitted = Buffer.from(signature, "hex");
    const target = Buffer.from(expected, "hex");
    if (submitted.length !== target.length || !timingSafeEqual(submitted, target)) return false;
  } catch {
    return false;
  }
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
