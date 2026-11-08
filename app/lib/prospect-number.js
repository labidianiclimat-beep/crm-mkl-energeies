export const PROSPECT_NUMBER_PREFIX = "MKL-PR-";

export function formatProspectNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return "";
  return `${PROSPECT_NUMBER_PREFIX}${String(number).padStart(5, "0")}`;
}

export function parseProspectNumber(input) {
  const raw = String(input || "").trim().toUpperCase().replace(/\s/g, "");
  if (!raw) return null;
  const digits = raw.replace(/^MKL-PR-/, "").replace(/\D/g, "");
  if (!digits) return null;
  const number = Number(digits);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function findProspectByNumber(prospects, input) {
  const number = parseProspectNumber(input);
  if (!number) return null;
  return (prospects || []).find(item => Number(item.prospectNumber) === number) || null;
}

export function personFromProspectNumber(prospects, clients, input) {
  const number = parseProspectNumber(input);
  if (!number) return null;
  const client = (clients || []).find(item => Number(item.prospectNumber) === number);
  if (client) return { ...client, directoryKind: "client", prospectNumber: number };
  const prospect = (prospects || []).find(item => Number(item.prospectNumber) === number);
  if (!prospect) return null;
  const linked = prospect.clientId
    ? (clients || []).find(item => String(item.id) === String(prospect.clientId))
    : null;
  if (linked) return { ...linked, directoryKind: "client", prospectNumber: number, prospectId: prospect.id };
  return { ...prospect, directoryKind: "prospect", prospectId: prospect.id };
}

export function commitRecipient(item, clients = [], prospects = []) {
  if (!item) return null;
  const person = unwrapRecipient(item, clients);
  if (!person) return null;
  if (person.directoryKind === "prospect") {
    const linked = personFromProspectNumber([person, ...(prospects || [])], clients, person.prospectNumber);
    if (linked?.directoryKind === "client") return { ...linked, directoryKind: "client" };
    return { ...person, directoryKind: "prospect" };
  }
  const rawId = person.realId || String(person.id || "").replace(/^(client|prospect):/, "");
  const known = (clients || []).find(entry => String(entry.id) === String(rawId));
  const client = known || person;
  return { ...client, id: client.id || rawId, directoryKind: "client" };
}

export function unwrapRecipient(item, clients = []) {
  if (!item) return null;
  const rawId = item.realId || String(item.id || "").replace(/^(client|prospect):/, "");
  if (item.directoryKind === "client") {
    const client = (clients || []).find(entry => String(entry.id) === String(rawId)) || { ...item, id: rawId };
    return { ...client, directoryKind: "client" };
  }
  if (item.directoryKind === "prospect") {
    return personFromProspectNumber([item], clients, item.prospectNumber) || {
      ...item,
      id: rawId,
      directoryKind: "prospect",
      prospectId: rawId,
    };
  }
  return item;
}
