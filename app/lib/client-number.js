export const CLIENT_NUMBER_PREFIX = "MKL-CL-";

export function formatClientNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return "";
  return `${CLIENT_NUMBER_PREFIX}${String(number).padStart(5, "0")}`;
}

export function parseClientNumber(input) {
  const raw = String(input || "").trim().toUpperCase().replace(/\s/g, "");
  if (!raw) return null;
  const digits = raw.replace(/^MKL-CL-/, "").replace(/\D/g, "");
  if (!digits) return null;
  const number = Number(digits);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function findClientByNumber(clients, input) {
  const number = parseClientNumber(input);
  if (!number) return null;
  return (clients || []).find(item => Number(item.clientNumber) === number) || null;
}
