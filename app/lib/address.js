const POSTAL_RE = /^\d{5}$/;

export function formatFullAddress({ address, addressComplement, postalCode, city } = {}) {
  return [address, addressComplement, postalCode, city]
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

export function missingAddressParts({ address, postalCode, postal, city } = {}) {
  let street = String(address || "").trim();
  let code = String(postalCode ?? postal ?? "").replace(/\s/g, "");
  let town = String(city || "").trim();
  if (!POSTAL_RE.test(code)) {
    const embedded = street.match(/(?:^|\s)(\d{5})(?:\s|$)/);
    if (embedded) code = embedded[1];
  }
  if (!town && POSTAL_RE.test(code) && street.includes(code)) {
    const after = street.slice(street.indexOf(code) + code.length).replace(/^[\s·,.-]+/, "").trim();
    if (after.length >= 2) town = after;
  }
  let voie = street;
  if (POSTAL_RE.test(code) && street.includes(code)) {
    voie = street.slice(0, street.indexOf(code)).replace(/[\s·,.-]+$/, "").trim();
  }
  const missing = [];
  if (!voie || voie.length < 3 || (town && voie.toLowerCase() === town.toLowerCase())) missing.push("la voie");
  if (!POSTAL_RE.test(code)) missing.push("le code postal");
  if (!town) missing.push("la commune");
  return missing;
}

export function addressGapSentence(parts = []) {
  if (!parts.length) return "";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} et ${parts.at(-1)}`;
  return `Il manque ${list}. Voulez-vous compléter l’adresse pendant l’appel ?`;
}

export function completeAddressErrors({ address, postalCode, city } = {}) {
  const errors = [];
  const street = String(address || "").trim();
  const postal = String(postalCode || "").trim();
  const town = String(city || "").trim();
  if (!street || street.length < 3) {
    errors.push("L’adresse (numéro et voie) est obligatoire.");
  } else if (town && street.toLowerCase() === town.toLowerCase()) {
    errors.push("Renseignez le numéro et la voie, pas seulement la ville.");
  }
  if (!postal) errors.push("Le code postal est obligatoire.");
  else if (!POSTAL_RE.test(postal)) errors.push("Le code postal doit contenir 5 chiffres.");
  if (!town) errors.push("La ville est obligatoire.");
  return errors;
}
