import { formatClientNumber } from "./client-number.js";
import { formatProspectNumber } from "./prospect-number.js";
import { normalizeText } from "./clients.js";

export function personSearchFields(person) {
  const firstName = String(person?.firstName || "").trim();
  const lastName = String(person?.lastName || "").trim();
  const name = String(person?.name || person?.company || "").trim();
  const address = [person?.address, person?.addressComplement, person?.postalCode, person?.city]
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
  const phone = [person?.phone, person?.mobile, person?.telephone, person?.telephone_secondaire]
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
  const email = String(person?.email || "").trim();
  return { firstName, lastName, name, address, phone, email };
}

export function filledSearchFields(person) {
  const fields = personSearchFields(person);
  return {
    lastName: fields.lastName || fields.name,
    firstName: fields.firstName,
    address: fields.address,
  };
}

const CIVILITY_WORD = /^(m|mr|mme|mlle|me|monsieur|madame|maitre|mademoiselle)$/;

function searchWords(value) {
  const words = normalizeText(value).split(/\s+/).filter(Boolean);
  const kept = words.filter(word => !CIVILITY_WORD.test(word));
  return kept.length ? kept : words;
}

function wordsIn(hay, value) {
  const words = searchWords(value);
  if (!words.length) return true;
  const text = normalizeText(hay);
  return words.every(word => text.includes(word));
}

function matchesUnified(person, fields, token) {
  const hay = normalizeText([
    person?.civilite,
    fields.firstName,
    fields.lastName,
    fields.name,
    person?.company,
    fields.address,
    fields.phone,
    fields.email,
    person?.postalCode,
    person?.city,
    formatClientNumber(person?.clientNumber),
    person?.clientNumber,
    formatProspectNumber(person?.prospectNumber),
    person?.prospectNumber,
  ].join(" "));
  const compactPhone = normalizeText(fields.phone).replace(/\s/g, "");
  const compactToken = normalizeText(token).replace(/\s/g, "");
  if (compactToken && compactPhone.includes(compactToken)) return true;
  return wordsIn(hay, token);
}

export function hasDirectoryQuery({ lastName = "", firstName = "", address = "", q = "", phone = "", email = "" } = {}) {
  return Boolean(
    normalizeText(lastName)
    || normalizeText(firstName)
    || normalizeText(address)
    || normalizeText(q)
    || normalizeText(phone)
    || normalizeText(email)
  );
}

export function matchesDirectorySearch(person, { lastName = "", firstName = "", address = "", q = "", phone = "", email = "" } = {}) {
  const fields = personSearchFields(person);
  const unified = normalizeText(q);
  if (unified) return matchesUnified(person, fields, unified);
  const lastQuery = normalizeText(lastName);
  const firstQuery = normalizeText(firstName);
  const addressQuery = normalizeText(address);
  const phoneQuery = normalizeText(phone).replace(/\s/g, "");
  const emailQuery = normalizeText(email);
  const identityQueries = [lastQuery, firstQuery, addressQuery].filter(Boolean);
  if (identityQueries.length === 1 && !phoneQuery && !emailQuery) {
    return matchesUnified(person, fields, identityQueries[0]);
  }
  if (!lastQuery && !firstQuery && !addressQuery && !phoneQuery && !emailQuery) return true;
  const lastHay = `${person?.civilite || ""} ${fields.lastName} ${fields.firstName} ${fields.name} ${person?.company || ""}`;
  const firstHay = `${person?.civilite || ""} ${fields.firstName} ${fields.lastName} ${fields.name}`;
  const addressHay = fields.address;
  const phoneHay = normalizeText(fields.phone).replace(/\s/g, "");
  const emailHay = normalizeText(fields.email);
  if (lastQuery && !wordsIn(lastHay, lastQuery)) return false;
  if (firstQuery && !wordsIn(firstHay, firstQuery)) return false;
  if (addressQuery && !wordsIn(addressHay, addressQuery)) return false;
  if (phoneQuery && !phoneHay.includes(phoneQuery)) return false;
  if (emailQuery && !emailHay.includes(emailQuery)) return false;
  return true;
}

export function matchesPersonListQuery(person, query = "") {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  return words.every(word => matchesDirectorySearch(person, { q: word }));
}

export function filterDirectory(items, query, { limit = 12 } = {}) {
  if (!hasDirectoryQuery(query)) return [];
  return (items || []).filter(item => matchesDirectorySearch(item, query)).slice(0, limit);
}

export function queryMatchesSelected(person, query = {}) {
  if (!person) return false;
  const fields = personSearchFields(person);
  const lastQuery = normalizeText(query.lastName);
  const firstQuery = normalizeText(query.firstName);
  const addressQuery = normalizeText(query.address);
  if (!lastQuery && !firstQuery && !addressQuery) return false;
  if (lastQuery && !wordsIn(`${fields.lastName} ${fields.firstName} ${fields.name} ${person?.civilite || ""}`, lastQuery)) return false;
  if (firstQuery && !wordsIn(`${fields.firstName} ${fields.lastName} ${fields.name} ${person?.civilite || ""}`, firstQuery)) return false;
  if (addressQuery && !wordsIn(fields.address, addressQuery)) return false;
  return true;
}
