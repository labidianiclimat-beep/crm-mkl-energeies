import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "crypto";

export const PIN_LENGTH = 6;
export const PIN_TTL_MS = 24 * 60 * 60 * 1000;
/** PIN de connexion réutilisable (durée longue = “définitif” jusqu’à régénération admin). */
export const LOGIN_PIN_TTL_MS = 1000 * 60 * 60 * 24 * 365 * 100;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000;

/**
 * Sel secret ajouté au PIN avant hachage. Il doit venir d'une variable dédiée :
 * une valeur écrite dans le dépôt rendrait les six chiffres d'un PIN
 * déchiffrables hors ligne en quelques secondes si la base fuitait, et
 * réutiliser la clé service ferait sauter tous les PIN à chaque rotation.
 */
function pepper() {
  const configured = String(process.env.ACTIVATION_PIN_PEPPER || "").trim();
  if (!configured) throw new Error("ACTIVATION_PIN_PEPPER_MISSING");
  return configured;
}

/**
 * Sels utilisés avant que la variable dédiée ne soit obligatoire. Ils ne servent
 * qu'à vérifier les PIN déjà en base, jamais à en créer de nouveaux, le temps
 * que les PIN existants soient régénérés depuis l'écran Utilisateurs.
 */
function legacyPeppers() {
  return [
    String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
    "mkl-activation-pepper",
  ].filter(Boolean);
}

export function generateActivationPin() {
  return String(randomInt(10 ** (PIN_LENGTH - 1), 10 ** PIN_LENGTH));
}

export function hashActivationPin(pin) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(`${pepper()}:${String(pin).trim()}`, salt, 64).toString("hex");
  return { pin_hash: hash, pin_salt: salt };
}

function pinMatches(candidatePepper, pin, pinHash, pinSalt) {
  const submitted = scryptSync(`${candidatePepper}:${String(pin).trim()}`, pinSalt, 64);
  const expected = Buffer.from(pinHash, "hex");
  if (submitted.length !== expected.length) return false;
  return timingSafeEqual(submitted, expected);
}

export function verifyActivationPin(pin, pinHash, pinSalt) {
  if (!pin || !pinHash || !pinSalt) return false;

  let configured = "";
  try {
    configured = pepper();
  } catch {
    configured = "";
  }

  const candidates = configured ? [configured, ...legacyPeppers()] : legacyPeppers();
  for (const candidate of candidates) {
    if (pinMatches(candidate, pin, pinHash, pinSalt)) return true;
  }
  return false;
}

export function pinRecordUsable(record, now = Date.now()) {
  if (!record || record.used_at || record.invalidated_at) return { ok: false, reason: "used" };
  if (record.locked_until && new Date(record.locked_until).getTime() > now) {
    return { ok: false, reason: "locked" };
  }
  if (new Date(record.expires_at).getTime() <= now) return { ok: false, reason: "expired" };
  return { ok: true };
}

export function pinRecordUsableForLogin(record, now = Date.now()) {
  if (!record || record.invalidated_at) return { ok: false, reason: "invalid" };
  if (record.locked_until && new Date(record.locked_until).getTime() > now) {
    return { ok: false, reason: "locked" };
  }
  if (new Date(record.expires_at).getTime() <= now) return { ok: false, reason: "expired" };
  return { ok: true };
}

export function nextAttemptState(record, success, now = Date.now()) {
  if (success) {
    return { attempts: 0, locked_until: null, used_at: new Date(now).toISOString() };
  }
  const attempts = Number(record?.attempts || 0) + 1;
  if (attempts >= MAX_PIN_ATTEMPTS) {
    return {
      attempts,
      locked_until: new Date(now + PIN_LOCK_MS).toISOString(),
    };
  }
  return { attempts, locked_until: null };
}

export function validatePersonalPinChoice(temporaryPin, personalPin, confirmPersonalPin) {
  if (!/^\d{6}$/.test(String(personalPin || ""))) {
    return { ok: false, error: "Le PIN personnel doit contenir 6 chiffres." };
  }
  if (String(personalPin) !== String(confirmPersonalPin)) {
    return { ok: false, error: "Les codes PIN personnels ne correspondent pas." };
  }
  if (String(personalPin) === String(temporaryPin)) {
    return { ok: false, error: "Choisissez un PIN personnel différent du code temporaire." };
  }
  return { ok: true };
}
