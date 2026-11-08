/**
 * Normalisation des identités pour le rapprochement de demandes.
 *
 * Aucune règle propre à un fournisseur de messagerie n’est appliquée : retirer
 * les points ou les suffixes « + » n’est valide que chez Gmail et fusionnerait
 * des adresses distinctes ailleurs.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
  const raw = String(value || "").trim().toLowerCase();
  return EMAIL_RE.test(raw) ? raw : "";
}

/**
 * Téléphone français ramené à dix chiffres commençant par zéro. Renvoie une
 * chaîne vide si le numéro n’est pas exploitable, afin qu’un numéro douteux ne
 * serve jamais de clé de rapprochement.
 */
export function normalizePhoneFr(value) {
  const digits = String(value || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  let national = "";
  if (digits.length === 10 && digits.startsWith("0")) national = digits;
  else if (digits.length === 9) national = `0${digits}`;
  else if (digits.length > 10) national = `0${digits.slice(-9)}`;
  else return "";
  if (!/^0[1-9][0-9]{8}$/.test(national)) return "";
  if (/^(\d)\1{9}$/.test(national)) return "";
  return national;
}

export function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

export function identityKeys(input = {}) {
  return {
    phone: normalizePhoneFr(input.phone || input.telephone),
    email: normalizeEmail(input.email),
    name: normalizeName(input.name || [input.firstName, input.lastName].filter(Boolean).join(" ")),
  };
}

export function hasUsableIdentity(input = {}) {
  const keys = identityKeys(input);
  return Boolean(keys.phone || keys.email);
}
