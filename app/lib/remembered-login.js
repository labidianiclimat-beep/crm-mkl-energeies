export const REMEMBERED_EMAIL_KEY = "mkl-remembered-email";

export function normalizeLoginEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isLoginEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeLoginEmail(value));
}

export function readRememberedEmail(storage) {
  try {
    const value = normalizeLoginEmail(storage?.getItem?.(REMEMBERED_EMAIL_KEY));
    return isLoginEmail(value) ? value : "";
  } catch {
    return "";
  }
}

export function persistRememberedEmail(storage, email, remember) {
  if (!storage) return "";
  const value = normalizeLoginEmail(email);
  if (remember && isLoginEmail(value)) {
    storage.setItem(REMEMBERED_EMAIL_KEY, value);
    return value;
  }
  storage.removeItem(REMEMBERED_EMAIL_KEY);
  return "";
}
