export const EXISTING_CLIENT_MESSAGE = "Veuillez d'abord créer le client dans le module Clients, puis revenir ici pour créer votre document.";

export function findExistingClient(clients, clientId) {
  const id = String(clientId || "").trim();
  if (!id) return null;
  return (clients || []).find(item => String(item.id) === id) || null;
}

export function recipientLink(person) {
  if (!person) return { clientId: "", prospectId: "" };
  const rawId = String(person.realId || person.prospectId || person.id || "").replace(/^(client|prospect):/, "");
  if (person.directoryKind === "prospect") {
    return { clientId: "", prospectId: String(person.prospectId || rawId) };
  }
  return {
    clientId: String(person.id || person.clientId || rawId || ""),
    prospectId: person.prospectId ? String(person.prospectId) : "",
  };
}

export function studySubject(clients, person) {
  if (!person) return null;
  const link = recipientLink(person);
  const client = findExistingClient(clients, link.clientId || person.clientId || person.id);
  if (client && person.directoryKind !== "prospect") {
    return { ...client, directoryKind: "client", clientId: client.id, prospectId: link.prospectId };
  }
  if (!link.prospectId) return null;
  return {
    ...person,
    id: link.prospectId,
    directoryKind: "prospect",
    clientId: "",
    prospectId: link.prospectId,
  };
}
